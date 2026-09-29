/*
 * Shared loader for the committed RePoE snapshot, used by every offline builder that derives a
 * slim artifact from it (build:craft-catalog, build:regex-data, sync:entities). The web process never loads this
 * ~60 MB payload; builders stamp their output with the manifest's artifact_sha256 so tests can
 * fail while a derived artifact lags a re-sync.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";

export const DATA_DIR = join(process.cwd(), "src", "data", "poe2");

/** RePoE item-class ids the tool crafts on — equipment and jewels, nothing else. */
export const CRAFTABLE_CLASS_IDS = new Set([
  "Amulet", "Ring", "Belt", "Gloves", "Boots", "Body Armour", "Helmet", "Shield", "Buckler", "Focus", "Quiver",
  "Claw", "Dagger", "Wand", "One Hand Sword", "One Hand Axe", "One Hand Mace", "Sceptre", "Spear", "Flail",
  "Bow", "Staff", "Two Hand Sword", "Two Hand Axe", "Two Hand Mace", "Warstaff", "Crossbow", "Talisman", "Jewel",
]);

export const ManifestSchema = z.object({
  repoe_version: z.string().min(1),
  artifact: z.string().regex(/^catalog-[0-9a-f]{16}\.json\.gz$/),
  artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Manifest = z.infer<typeof ManifestSchema>;
export const PatchCoverageSchema = z.object({ game_data_patch: z.string().min(1), catalog_sha256: z.string() });

/** family → modId → level, as RePoE mods_by_base stores each side. */
export const familyPoolSchema = z.record(z.string(), z.record(z.string(), z.number()));

const SpawnWeightSchema = z.object({ tag: z.string(), weight: z.number() });
export const RepoeModSchema = z.object({
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
  implicit_tags: z.array(z.string()).optional(),
});
export type RepoeMod = z.infer<typeof RepoeModSchema>;

export const RepoeSchema = z.object({
  sources: z.object({
    mods: z.record(z.string(), RepoeModSchema),
    base_items: z.record(
      z.string(),
      z
        .object({
          item_class: z.string(),
          name: z.string().nullish(),
          release_state: z.string(),
          tags: z.array(z.string()),
          implicits: z.array(z.string()).optional(),
        })
        .passthrough(),
    ),
    item_classes: z.record(z.string(), z.object({ name: z.string().nullish() }).passthrough()),
    mods_by_base: z.record(
      z.string(),
      z.record(z.string(), z.object({ bases: z.array(z.string()), mods: z.record(z.string(), familyPoolSchema) })),
    ),
  }),
});
export type Repoe = z.infer<typeof RepoeSchema>["sources"];

export interface Snapshot {
  manifest: Manifest;
  repoe: Repoe;
  gameDataPatch: string;
}

export const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** Trade markup "[Resistances|Fire Resistance]" → "Fire Resistance", "[Fire]" → "Fire". */
export function cleanTemplate(text: string): string {
  return text
    .replace(/\[[^\]|]*\|([^\]]*)\]/g, "$1")
    .replace(/\[([^\]]*)\]/g, "$1")
    .replace(/\r/g, "")
    .trim();
}

/** PoE spawn-weight semantics: the first listed tag the item carries decides; `default` is on every item. */
export function spawnsOn(m: RepoeMod, tags: ReadonlySet<string>): boolean {
  for (const w of m.spawn_weights) {
    if (w.tag === "default" || tags.has(w.tag)) return w.weight > 0;
  }
  return false;
}

/** The verified snapshot before any builder-specific schema: each builder parses the sources it needs. */
export interface RawSnapshot {
  manifest: Manifest;
  decoded: unknown;
  gameDataPatch: string;
}

export function readSnapshot(): RawSnapshot {
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
  return { manifest, decoded, gameDataPatch: coverage.game_data_patch };
}

/** Parse `value` or throw naming the first mismatching paths — a silent partial parse would ship a wrong artifact. */
export function parseSnapshotShape<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`${label} shape mismatch: ${where.join("; ")}`);
  }
  return parsed.data;
}

export function loadSnapshot(): Snapshot {
  const { manifest, decoded, gameDataPatch } = readSnapshot();
  const parsed = parseSnapshotShape(RepoeSchema, decoded, "RePoE snapshot");
  return { manifest, repoe: parsed.sources, gameDataPatch };
}
