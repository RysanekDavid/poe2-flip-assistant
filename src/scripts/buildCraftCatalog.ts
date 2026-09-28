/*
 * Derive the slim craft catalog (src/data/poe2/craft/craft-catalog.json.gz) from the committed RePoE
 * snapshot. Run after every `npm run sync:poe2-data`: test:tools:craft-moves fails while the
 * catalog's sourceSha256 differs from repoe/manifest.json. Run: npm run build:craft-catalog
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";
import {
  CRAFT_CATALOG_PATH,
  CRAFT_CATALOG_SCHEMA_VERSION,
  CraftCatalogSchema,
  comboKeyOf,
  type CatalogBase,
  type CatalogCombo,
  type CatalogMod,
  type CraftCatalog,
  type FamilyPool,
} from "../core/tools/craftmoves/catalog";

const DATA_DIR = join(process.cwd(), "src", "data", "poe2");

/** RePoE item-class ids the tool crafts on — equipment and jewels, nothing else. */
const CRAFTABLE_CLASS_IDS = new Set([
  "Amulet", "Ring", "Belt", "Gloves", "Boots", "Body Armour", "Helmet", "Shield", "Buckler", "Focus", "Quiver",
  "Claw", "Dagger", "Wand", "One Hand Sword", "One Hand Axe", "One Hand Mace", "Sceptre", "Spear", "Flail",
  "Bow", "Staff", "Two Hand Sword", "Two Hand Axe", "Two Hand Mace", "Warstaff", "Crossbow", "Talisman", "Jewel",
]);

const ManifestSchema = z.object({
  repoe_version: z.string().min(1),
  artifact: z.string().regex(/^catalog-[0-9a-f]{16}\.json\.gz$/),
  artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const PatchCoverageSchema = z.object({ game_data_patch: z.string().min(1), catalog_sha256: z.string() });

/** family → modId → level, as RePoE mods_by_base stores each side. */
const familyPoolSchema = z.record(z.string(), z.record(z.string(), z.number()));

const SpawnWeightSchema = z.object({ tag: z.string(), weight: z.number() });
const RepoeModSchema = z.object({
  domain: z.string(),
  generation_type: z.string(),
  groups: z.array(z.string()),
  type: z.string().nullish(),
  is_essence_only: z.boolean(),
  name: z.string().nullish(),
  required_level: z.number(),
  spawn_weights: z.array(SpawnWeightSchema),
  stats: z.array(z.object({ id: z.string(), min: z.number(), max: z.number() })),
  text: z.string().nullish(),
});
type RepoeMod = z.infer<typeof RepoeModSchema>;

const RepoeSchema = z.object({
  sources: z.object({
    mods: z.record(z.string(), RepoeModSchema),
    base_items: z.record(
      z.string(),
      z.object({ item_class: z.string(), name: z.string().nullish(), release_state: z.string(), tags: z.array(z.string()) }).passthrough(),
    ),
    item_classes: z.record(z.string(), z.object({ name: z.string().nullish() }).passthrough()),
    mods_by_base: z.record(
      z.string(),
      z.record(z.string(), z.object({ bases: z.array(z.string()), mods: z.record(z.string(), familyPoolSchema) })),
    ),
  }),
});
type Repoe = z.infer<typeof RepoeSchema>["sources"];

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** Trade markup "[Resistances|Fire Resistance]" → "Fire Resistance", "[Fire]" → "Fire". */
function cleanTemplate(text: string): string {
  return text
    .replace(/\[[^\]|]*\|([^\]]*)\]/g, "$1")
    .replace(/\[([^\]]*)\]/g, "$1")
    .replace(/\r/g, "")
    .trim();
}

function loadSnapshot(): { manifest: z.infer<typeof ManifestSchema>; repoe: Repoe; gameDataPatch: string } {
  const manifest = ManifestSchema.parse(JSON.parse(readFileSync(join(DATA_DIR, "repoe", "manifest.json"), "utf8")));
  const compressed = readFileSync(join(DATA_DIR, "repoe", manifest.artifact));
  if (sha256(compressed) !== manifest.artifact_sha256) {
    throw new Error(`RePoE artifact ${manifest.artifact} does not match manifest sha256 — re-run npm run sync:poe2-data`);
  }
  const coverage = PatchCoverageSchema.parse(JSON.parse(readFileSync(join(DATA_DIR, "patch-coverage.json"), "utf8")));
  if (coverage.catalog_sha256 !== manifest.artifact_sha256) {
    throw new Error("patch-coverage.json describes a different RePoE snapshot — its game_data_patch would mislabel the catalog");
  }
  const decoded: unknown = JSON.parse(gunzipSync(compressed).toString("utf8"));
  const parsed = RepoeSchema.safeParse(decoded);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`RePoE snapshot shape mismatch: ${where.join("; ")}`);
  }
  return { manifest, repoe: parsed.data.sources, gameDataPatch: coverage.game_data_patch };
}

/** Class id → display name, for the craftable classes only. */
function craftableClassNames(repoe: Repoe): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of CRAFTABLE_CLASS_IDS) {
    const name = repoe.item_classes[id]?.name?.trim();
    if (!name) throw new Error(`RePoE item_classes has no display name for craftable class "${id}"`);
    out.set(id, name);
  }
  return out;
}

/** Released, named bases of the craftable classes, keyed by display name. */
function collectBases(repoe: Repoe, classNames: Map<string, string>): { bases: Record<string, CatalogBase>; byId: Map<string, string> } {
  const bases: Record<string, CatalogBase> = {};
  const byId = new Map<string, string>();
  for (const [id, b] of Object.entries(repoe.base_items)) {
    const itemClass = classNames.get(b.item_class);
    const name = b.name?.trim();
    if (!itemClass || !name || b.release_state !== "released") continue;
    byId.set(id, name);
    const prev = bases[name];
    if (!prev) {
      bases[name] = { id, itemClass, tags: b.tags, ambiguous: false };
      continue;
    }
    const same = prev.itemClass === itemClass && comboKeyOf(prev.tags) === comboKeyOf(b.tags);
    if (!same) bases[name] = { ...prev, ambiguous: true };
  }
  return { bases, byId };
}

const POOL_DOMAINS = new Set(["item", "misc"]);

const familyOf = (m: RepoeMod): string => m.type ?? m.groups[0] ?? "";
const isSide = (g: string): g is "prefix" | "suffix" => g === "prefix" || g === "suffix";

function toCatalogMod(m: RepoeMod, family: string, side: "prefix" | "suffix", domain: "item" | "desecrated"): CatalogMod | null {
  const text = m.text ? cleanTemplate(m.text) : "";
  if (!text) return null; // hidden mods have no display line to match against
  return {
    text,
    name: m.name?.trim() ?? "",
    family,
    side,
    domain,
    level: m.required_level,
    essenceOnly: m.is_essence_only || (domain === "item" && /Essence/.test(familyOf(m) + m.groups.join())),
    stats: m.stats,
  };
}

/** PoE spawn-weight semantics: the first listed tag the item carries decides; `default` is on every item. */
function spawnsOn(m: RepoeMod, tags: ReadonlySet<string>): boolean {
  for (const w of m.spawn_weights) {
    if (w.tag === "default" || tags.has(w.tag)) return w.weight > 0;
  }
  return false;
}

interface ModSink {
  mods: Record<string, CatalogMod>;
}

/** Copy one side's family pool, registering each mod; drops mods with no display text. */
function copyPool(repoe: Repoe, pool: FamilyPool | undefined, side: "prefix" | "suffix", sink: ModSink): FamilyPool {
  const out: FamilyPool = {};
  for (const [family, tiers] of Object.entries(pool ?? {})) {
    for (const [modId, level] of Object.entries(tiers)) {
      const src = repoe.mods[modId];
      if (!src) throw new Error(`mods_by_base references unknown mod ${modId}`);
      // jewel pools are RePoE domain "misc"; every other craftable class is "item"
      if (!POOL_DOMAINS.has(src.domain) || src.generation_type !== side) continue;
      const mod = sink.mods[modId] ?? toCatalogMod(src, family, side, "item");
      if (!mod) continue;
      sink.mods[modId] = mod;
      (out[family] ??= {})[modId] = level;
    }
  }
  return out;
}

function desecratedPool(desecrated: ReadonlyArray<[string, RepoeMod]>, tags: ReadonlySet<string>, sink: ModSink): FamilyPool {
  const out: FamilyPool = {};
  for (const [modId, src] of desecrated) {
    if (!isSide(src.generation_type) || !spawnsOn(src, tags)) continue;
    const mod = sink.mods[modId] ?? toCatalogMod(src, familyOf(src), src.generation_type, "desecrated");
    if (!mod) continue;
    sink.mods[modId] = mod;
    (out[mod.family] ??= {})[modId] = src.required_level;
  }
  return out;
}

function buildClasses(repoe: Repoe, classNames: Map<string, string>, baseNames: Map<string, string>, sink: ModSink) {
  const wanted = new Set(classNames.values());
  const desecrated = Object.entries(repoe.mods).filter(([, m]) => m.domain === "desecrated" && isSide(m.generation_type));
  const classes: Record<string, Record<string, CatalogCombo>> = {};
  for (const [className, combos] of Object.entries(repoe.mods_by_base)) {
    if (!wanted.has(className)) continue;
    for (const [combo, entry] of Object.entries(combos)) {
      const bases = entry.bases.map((id) => baseNames.get(id)).filter((n): n is string => n != null);
      if (bases.length === 0) continue; // unreleased / unnamed bases only
      const tags = new Set(combo.split(","));
      (classes[className] ??= {})[combo] = {
        bases: [...new Set(bases)].sort(),
        prefix: copyPool(repoe, entry.mods.prefix, "prefix", sink),
        suffix: copyPool(repoe, entry.mods.suffix, "suffix", sink),
        desecrated: desecratedPool(desecrated, tags, sink),
      };
    }
  }
  return classes;
}

/** Essence-only item mods carry no spawn weight, so no class pool lists them; keep them globally. */
function addEssenceMods(repoe: Repoe, sink: ModSink): number {
  let added = 0;
  for (const [modId, src] of Object.entries(repoe.mods)) {
    if (src.domain !== "item" || !isSide(src.generation_type) || sink.mods[modId]) continue;
    const essence = src.is_essence_only || /Essence/.test(modId);
    if (!essence || src.spawn_weights.some((w) => w.weight > 0)) continue;
    const mod = toCatalogMod(src, familyOf(src), src.generation_type, "item");
    if (!mod) continue;
    sink.mods[modId] = { ...mod, essenceOnly: true };
    added++;
  }
  return added;
}

/** Every base the classes reference must resolve to the same combo it is listed under. */
function assertBaseCombos(cat: CraftCatalog): void {
  for (const [className, combos] of Object.entries(cat.classes)) {
    for (const [combo, entry] of Object.entries(combos)) {
      for (const name of entry.bases) {
        const base = cat.bases[name];
        if (!base) throw new Error(`${className}/${combo} lists base "${name}" missing from bases`);
        if (!base.ambiguous && comboKeyOf(base.tags) !== combo) {
          throw new Error(`base "${name}" tags ${comboKeyOf(base.tags)} do not match its combo ${combo}`);
        }
      }
    }
  }
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function main(): void {
  const { manifest, repoe, gameDataPatch } = loadSnapshot();
  const classNames = craftableClassNames(repoe);
  const { bases, byId } = collectBases(repoe, classNames);
  const sink: ModSink = { mods: {} };
  const classes = buildClasses(repoe, classNames, byId, sink);
  const essences = addEssenceMods(repoe, sink);
  const catalog = CraftCatalogSchema.parse({
    schemaVersion: CRAFT_CATALOG_SCHEMA_VERSION,
    sourceSha256: manifest.artifact_sha256,
    repoeVersion: manifest.repoe_version,
    gameDataPatch,
    mods: sortKeys(sink.mods),
    classes: sortKeys(classes),
    bases: sortKeys(bases),
  });
  assertBaseCombos(catalog);
  const json = `${JSON.stringify(catalog)}\n`;
  mkdirSync(dirname(CRAFT_CATALOG_PATH), { recursive: true });
  // gzip carries mtime 0 from Node, so an unchanged snapshot rebuilds to identical bytes
  const gz = gzipSync(json, { level: 9 });
  writeFileSync(CRAFT_CATALOG_PATH, gz);
  const ambiguous = Object.values(bases).filter((b) => b.ambiguous).length;
  console.log(
    `[craft-catalog] wrote ${CRAFT_CATALOG_PATH} — ${(gz.length / 1024).toFixed(0)} KB gzip (${(json.length / 1024 / 1024).toFixed(2)} MB raw), ` +
      `${Object.keys(catalog.mods).length} mods (${essences} essence-only), ${Object.keys(catalog.classes).length} classes, ` +
      `${Object.keys(bases).length} bases (${ambiguous} ambiguous), data ${gameDataPatch} / RePoE ${manifest.repoe_version}`,
  );
}

main();
