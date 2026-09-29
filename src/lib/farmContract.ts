import { z } from "zod";
import { confidenceSchema } from "../core/tools/bossEv/schema";
import { bossViewSchema } from "./tools/bossEvContract";

/**
 * GET /api/farm — the Farm tab's one payload: mechanic baskets ranked by 7d heat, pinnacle bosses
 * ranked by net per kill, and each boss's full evaluation for the detail panel. Shared by the route
 * (validated on the way out) and the client (validated on the way in). All money is Divine.
 */

const driverSchema = z.object({ item: z.string(), change7d: z.number(), valueDiv: z.number(), volume: z.number() });

export const mechanicRowSchema = z.object({
  kind: z.literal("mechanic"),
  category: z.string(),
  label: z.string(),
  hint: z.string(),
  signal: z.enum(["HOT", "WARM", "COLD"]),
  wAvgChange7d: z.number(),
  basketValueDiv: z.number(),
  itemCount: z.number().int(),
  drivers: z.array(driverSchema),
  /** Art of the basket's top driver; null when the snapshot has none. */
  icon: z.string().nullable(),
});
export type MechanicRow = z.infer<typeof mechanicRowSchema>;

export const toneSchema = z.enum(["good", "warn", "bad", "neutral", "muted"]);

export const bossRowSchema = z.object({
  kind: z.literal("boss"),
  id: z.string(),
  name: z.string(),
  mechanic: z.string(),
  icon: z.string().nullable(),
  tierId: z.string(),
  entryDiv: z.number(),
  entryComplete: z.boolean(),
  entryVolume: z.number().nullable(),
  floorDiv: z.number(),
  chaseDiv: z.number(),
  /** Conservative EV − entry over the priced, rated drops only. */
  netDiv: z.number(),
  /**
   * How far netDiv can be trusted: `lower` when some drop has no sourced rate or no price (EV leaves
   * it out, so the real net is at least this), `upper` when part of the entry is unpriced, `unknown`
   * when both, `exact` otherwise.
   */
  netBound: z.enum(["exact", "lower", "upper", "unknown"]),
  /** Drops EV leaves out (no sourced rate or no price) — what makes a net a lower bound. */
  uncountedDrops: z.number().int(),
  chaseOneIn: z.number().nullable(),
  pLosingRun: z.number().nullable(),
  losingRunUnknownRates: z.number().int(),
  headline: z.object({ text: z.string(), tone: toneSchema, title: z.string() }),
  /** Weakest confidence among the lines that carry the EV; "unverified" when none has a rate. */
  confidence: confidenceSchema,
  unpriced: z.array(z.string()),
  unpricedLineage: z.number().int(),
});
export type BossRow = z.infer<typeof bossRowSchema>;

export type FarmBoardRow = MechanicRow | BossRow;

export const farmRatesSchema = z.object({
  exaltPerDivine: z.number(),
  chaosPerDivine: z.number(),
  source: z.enum(["cx", "ninja", "scout"]),
  fetchedAt: z.string().nullable(),
});

export const farmResponseSchema = z.object({
  computedLeague: z.string(),
  mechanics: z.array(mechanicRowSchema),
  bosses: z.array(bossRowSchema),
  /** Full per-boss evaluation (every tier) keyed by the rows' ids, for the detail panel. */
  details: z.array(bossViewSchema),
  rates: farmRatesSchema.nullable(),
  pricesFetchedAt: z.string().nullable(),
  scoutAgeHours: z.number().nullable(),
  dataAsOf: z.string(),
  patch: z.string(),
  patchWarning: z.object({ level: z.enum(["obsolete", "recheck"]), text: z.string() }).nullable(),
});
export type FarmResponse = z.infer<typeof farmResponseSchema>;
