/*
 * Shape of the static regex datasets in src/data/poe2/regex/*.json. Written offline by
 * `npm run build:regex-data`, parsed again by the client panel after its lazy import and by the
 * tests, so a stale or hand-edited file fails loudly instead of producing a wrong search string.
 */
import { z } from "zod";
import { segmentsOf, slotCount } from "./template";

export const REGEX_DATA_SCHEMA_VERSION = 1;
export const POOL_TABS = ["waystone", "tablet", "relic", "jewel"] as const;
export type PoolTab = (typeof POOL_TABS)[number];
export const MOD_SIDES = ["prefix", "suffix"] as const;

/** Which RePoE snapshot a dataset was derived from; tests compare it with repoe/manifest.json. */
export const StampSchema = z.object({
  schemaVersion: z.literal(REGEX_DATA_SCHEMA_VERSION),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  repoeVersion: z.string().min(1),
  gameDataPatch: z.string().min(1),
});
export type Stamp = z.infer<typeof StampSchema>;

export const PoolLineSchema = z
  .object({
    /** Display text with every rolled number replaced by "#", signs kept ("+#% Monster …"). */
    template: z.string().min(1),
    /** Lowercased text between the numbers — what a literal search fragment can land in. */
    segments: z.array(z.string()),
    numeric: z.object({ count: z.number().int().min(0), decimals: z.number().int().min(0) }),
  })
  .superRefine((line, ctx) => {
    const expected = segmentsOf(line.template);
    if (line.segments.join("\u0000") !== expected.join("\u0000")) {
      ctx.addIssue({ code: "custom", message: `segments do not match template "${line.template}"` });
    }
    if (line.numeric.count !== slotCount(line.template)) {
      ctx.addIssue({ code: "custom", message: `numeric.count ≠ number slots in "${line.template}"` });
    }
  });
export type PoolLine = z.infer<typeof PoolLineSchema>;

const RangeSchema = z
  .object({ min: z.number().finite(), max: z.number().finite() })
  .refine((r) => r.min <= r.max, "range min > max");

export const PoolTierSchema = z.object({
  /** RePoE mod id of this tier. */
  modId: z.string().min(1),
  /** Ordinal, 1 = weakest (id suffix, else level rank) — NOT the in-game "Tier: N" label. */
  tier: z.number().int().min(1),
  /** Pool bands the tier spawns in (waystone tier band, tablet type, relic size, jewel kind). */
  bands: z.array(z.string().min(1)).min(1),
  level: z.number().int().min(0),
  /** Each rolled line of this tier: index into the mod's `lines` plus one range per "#". */
  lines: z.array(z.object({ line: z.number().int().min(0), ranges: z.array(RangeSchema) })).min(1),
});
export type PoolTier = z.infer<typeof PoolTierSchema>;

export const PoolModSchema = z.object({
  /** Stable id (the RePoE mod family); used as the selection key and in share URLs. */
  id: z.string().min(1).max(80),
  side: z.enum(MOD_SIDES),
  /** Affix name of the lowest tier ("of Enduring"); empty for nameless mods. */
  name: z.string(),
  group: z.string().min(1),
  tags: z.array(z.string()),
  desecrated: z.boolean(),
  /** Distinct line templates across all tiers, in tier order. */
  lines: z.array(PoolLineSchema).min(1),
  tiers: z.array(PoolTierSchema).min(1),
});
export type PoolMod = z.infer<typeof PoolModSchema>;

const LabelledSchema = z.object({ id: z.string().min(1), label: z.string().min(1) });
export type PoolGroup = z.infer<typeof LabelledSchema>;

export const RegexPoolSchema = z
  .object({
    stamp: StampSchema,
    tab: z.enum(POOL_TABS),
    groups: z.array(LabelledSchema).min(1),
    bands: z.array(LabelledSchema).min(1),
    /** Base type names ("Breach Tablet", "Waystone (Tier 15)") — searchable text on every item. */
    bases: z.array(z.string().min(1)),
    /** Line templates items of this tab can carry but nobody selects (corruption implicits). */
    foreignLines: z.array(z.string().min(1)),
    mods: z.array(PoolModSchema).min(1),
  })
  .superRefine((pool, ctx) => {
    const groups = new Set(pool.groups.map((g) => g.id));
    const bands = new Set(pool.bands.map((b) => b.id));
    const ids = new Set<string>();
    for (const mod of pool.mods) {
      const issue = poolModIssue(mod, groups, bands);
      if (issue) ctx.addIssue({ code: "custom", message: `${mod.id}: ${issue}` });
      if (ids.has(mod.id)) ctx.addIssue({ code: "custom", message: `duplicate mod id ${mod.id}` });
      ids.add(mod.id);
    }
  });
export type RegexPool = z.infer<typeof RegexPoolSchema>;

function poolModIssue(mod: PoolMod, groups: ReadonlySet<string>, bands: ReadonlySet<string>): string | null {
  if (!groups.has(mod.group)) return `unknown group ${mod.group}`;
  for (const tier of mod.tiers) {
    const unknownBand = tier.bands.find((b) => !bands.has(b));
    if (unknownBand) return `tier ${tier.modId} has unknown band ${unknownBand}`;
    for (const { line, ranges } of tier.lines) {
      const target = mod.lines[line];
      if (!target) return `tier ${tier.modId} points at missing line ${line}`;
      if (ranges.length !== target.numeric.count) return `tier ${tier.modId} line ${line} has ${ranges.length} ranges for ${target.numeric.count} numbers`;
    }
  }
  return null;
}

/** Everything a vendor-screen search can collide with: equipment mod lines, bases, class names. */
export const VendorDataSchema = z.object({
  stamp: StampSchema,
  lines: z.array(z.string().min(1)).min(1),
  bases: z.array(z.string().min(1)).min(1),
  classes: z.array(z.string().min(1)).min(1),
});
export type VendorData = z.infer<typeof VendorDataSchema>;
