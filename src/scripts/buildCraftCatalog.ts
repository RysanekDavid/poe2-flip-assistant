/*
 * Derive the slim craft catalog (src/data/poe2/craft/craft-catalog.json.gz) from the committed RePoE
 * snapshot. Run after every `npm run sync:poe2-data`: test:tools:craft-moves fails while the
 * catalog's sourceSha256 differs from repoe/manifest.json. Run: npm run build:craft-catalog
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gzipSync } from "node:zlib";
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
import { CRAFTABLE_CLASS_IDS, cleanTemplate, loadSnapshot, spawnsOn, type Repoe, type RepoeMod } from "./repoe/snapshot";

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

/** Display lines of a base's implicit mods; an id missing from the mods table is a snapshot break. */
function implicitLines(repoe: Repoe, baseId: string, ids: readonly string[]): string[] {
  return ids.flatMap((modId) => {
    const mod = repoe.mods[modId];
    if (!mod) throw new Error(`base ${baseId} lists implicit ${modId} missing from RePoE mods`);
    return mod.text ? cleanTemplate(mod.text).split("\n") : []; // hidden implicits have no display line
  });
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
      bases[name] = { id, itemClass, tags: b.tags, ambiguous: false, implicits: implicitLines(repoe, id, b.implicits ?? []) };
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
  // every RePoE 4.5 mod carries implicit_tags (often empty); a missing key is a snapshot shape change
  if (!m.implicit_tags) throw new Error(`mod "${m.name ?? text}" has no implicit_tags — RePoE shape changed`);
  return {
    text,
    name: m.name?.trim() ?? "",
    family,
    groups: m.groups,
    tags: m.implicit_tags,
    side,
    domain,
    level: m.required_level,
    craftedOnly: m.is_essence_only || (domain === "item" && /Essence/.test(familyOf(m) + m.groups.join())),
    stats: m.stats,
  };
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

/**
 * Crafted-only mods carry no spawn weight, so no class pool lists them; keep them globally:
 * essence mods (item domain), the alloy mods (item domain, Alloy*: an alloy writes the item's one
 * crafted mod, 0.5.0 notes) and the liquid-emotion jewel mods (misc domain, CraftedJewel*), e.g.
 * Contempt's "+1 Suffix Modifier allowed", which sits in a PREFIX slot.
 */
function addCraftedOnlyMods(repoe: Repoe, sink: ModSink): number {
  let added = 0;
  for (const [modId, src] of Object.entries(repoe.mods)) {
    if (!POOL_DOMAINS.has(src.domain) || !isSide(src.generation_type) || sink.mods[modId]) continue;
    const essence = src.domain === "item" && (src.is_essence_only || /Essence/.test(modId));
    const alloy = src.domain === "item" && /^Alloy/.test(modId);
    const liquid = src.domain === "misc" && /^CraftedJewel/.test(modId);
    if (!(essence || alloy || liquid) || src.spawn_weights.some((w) => w.weight > 0)) continue;
    const mod = toCatalogMod(src, familyOf(src), src.generation_type, "item");
    if (!mod) continue;
    sink.mods[modId] = { ...mod, craftedOnly: true };
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
  const craftedOnly = addCraftedOnlyMods(repoe, sink);
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
      `${Object.keys(catalog.mods).length} mods (${craftedOnly} crafted-only), ${Object.keys(catalog.classes).length} classes, ` +
      `${Object.keys(bases).length} bases (${ambiguous} ambiguous), data ${gameDataPatch} / RePoE ${manifest.repoe_version}`,
  );
}

main();
