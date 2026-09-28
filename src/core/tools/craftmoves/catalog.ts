import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";

/**
 * The slim craft catalog: every item-domain prefix/suffix mod, desecrated mod and essence-only mod
 * a craftable item class can carry, with its RePoE level, tier family and value ranges.
 *
 * Built offline by `npm run build:craft-catalog` from the committed RePoE snapshot (gzipped: ~3.4 MB of
 * JSON, mostly tier pools repeated across base-type combos, compresses to ~150 KB). The web process
 * must never load that ~60 MB snapshot (see src/core/cx/repoeNames.ts), so the tool reads only this
 * derived artifact. `sourceSha256` pins the snapshot it came from; test:tools:craft-moves fails when
 * the snapshot is re-synced without rebuilding this file.
 */

export const CRAFT_CATALOG_SCHEMA_VERSION = 1 as const;
export const CRAFT_CATALOG_PATH = join(process.cwd(), "src", "data", "poe2", "craft", "craft-catalog.json.gz");

export const AFFIX_SIDES = ["prefix", "suffix"] as const;
export type AffixSide = (typeof AFFIX_SIDES)[number];

const StatSchema = z.object({ id: z.string(), min: z.number(), max: z.number() });

const CatalogModSchema = z.object({
  /** Display template with trade markup stripped, lines joined by "\n": "+(5-8) to Strength". */
  text: z.string().min(1),
  /** Affix name as shown in advanced (Ctrl+Alt+C) copies: "of the Brute". */
  name: z.string(),
  family: z.string().min(1),
  side: z.enum(AFFIX_SIDES),
  domain: z.enum(["item", "desecrated"]),
  /** RePoE required_level — the "modifier level" currency floors and ilvl gates compare against. */
  level: z.number().int().nonnegative(),
  essenceOnly: z.boolean(),
  stats: z.array(StatSchema),
});
export type CatalogMod = z.infer<typeof CatalogModSchema>;

/** family → modId → modifier level. */
const FamilyPoolSchema = z.record(z.string(), z.record(z.string(), z.number().int().nonnegative()));
export type FamilyPool = z.infer<typeof FamilyPoolSchema>;

const ComboSchema = z.object({
  bases: z.array(z.string()),
  prefix: FamilyPoolSchema,
  suffix: FamilyPoolSchema,
  desecrated: FamilyPoolSchema,
});
export type CatalogCombo = z.infer<typeof ComboSchema>;

const BaseSchema = z.object({
  id: z.string(),
  itemClass: z.string(),
  tags: z.array(z.string()),
  /** Other released bases share this display name with a different tag set (the combo is a guess). */
  ambiguous: z.boolean(),
});
export type CatalogBase = z.infer<typeof BaseSchema>;

export const CraftCatalogSchema = z.object({
  schemaVersion: z.literal(CRAFT_CATALOG_SCHEMA_VERSION),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  repoeVersion: z.string().min(1),
  gameDataPatch: z.string().min(1),
  mods: z.record(z.string(), CatalogModSchema),
  /** item class display name ("Rings") → RePoE tag combo ("ring,default") → pools. */
  classes: z.record(z.string(), z.record(z.string(), ComboSchema)),
  /** base display name → identity. */
  bases: z.record(z.string(), BaseSchema),
});
export type CraftCatalog = z.infer<typeof CraftCatalogSchema>;

/** The combo key RePoE's mods_by_base uses for a base: its tags, in order, comma-joined. */
export const comboKeyOf = (tags: readonly string[]): string => tags.join(",");

let cached: CraftCatalog | null = null;

/** Parse + validate the committed catalog once per process. Throws loudly when missing or malformed. */
export function loadCraftCatalog(): CraftCatalog {
  if (cached) return cached;
  const raw: unknown = JSON.parse(gunzipSync(readFileSync(CRAFT_CATALOG_PATH)).toString("utf8"));
  const parsed = CraftCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`craft catalog ${CRAFT_CATALOG_PATH} is malformed — rebuild with npm run build:craft-catalog (${where.join("; ")})`);
  }
  cached = parsed.data;
  return cached;
}

/** The pools for one base, or null when the class/base is not in the catalog. */
export function comboFor(cat: CraftCatalog, itemClass: string, baseName: string): CatalogCombo | null {
  const base = cat.bases[baseName];
  if (!base) return null;
  return cat.classes[itemClass]?.[comboKeyOf(base.tags)] ?? null;
}
