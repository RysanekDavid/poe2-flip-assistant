import { z } from "zod";
import { confidenceSchema, unmodelledEntrySchema } from "../core/tools/bossEv/schema";
import { bossViewSchema, floorDropSchema } from "./tools/bossEvContract";

/**
 * GET /api/farm — the Farm tab's one payload: mechanic baskets ranked by 7d heat, pinnacle bosses
 * ranked by net per kill, and each boss's full evaluation for the detail panel. Shared by the route
 * (validated on the way out) and the client (validated on the way in). All money is Divine.
 *
 * No Div/hour anywhere: drop rates per map are unknown and the owner dropped hand-typed paces, so a
 * per-hour number would be made up. Mechanics carry their 7-day basket heat, bosses their net per kill.
 */

/**
 * How far a net can be trusted: `lower` when some drop has no
 * sourced rate or no price (EV leaves it out, so the real value is at least this), `upper` when part
 * of the entry is unpriced, `unknown` when both, `exact` otherwise.
 */
export const netBoundSchema = z.enum(["exact", "lower", "upper", "unknown"]);
export type NetBound = z.infer<typeof netBoundSchema>;

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

/** One consumed entry item as the row shows it: art, "1× Breachlord Sac", its cost (null = unpriced). */
export const entryChipSchema = z.object({
  name: z.string(),
  qty: z.number(),
  icon: z.string().nullable(),
  costDiv: z.number().nullable(),
  route: z.enum(["buy", "craft"]).nullable(),
});
export type EntryChip = z.infer<typeof entryChipSchema>;

export const bossRowSchema = z.object({
  kind: z.literal("boss"),
  id: z.string(),
  name: z.string(),
  mechanic: z.string(),
  icon: z.string().nullable(),
  tierId: z.string(),
  entryDiv: z.number(),
  entryComplete: z.boolean(),
  entry: z.array(entryChipSchema).min(1),
  /** A real entry cost the tool cannot price — the net is then an upper bound. */
  unmodelledEntry: unmodelledEntrySchema.nullable(),
  entryVolume: z.number().nullable(),
  floorDiv: z.number(),
  floorDrops: z.array(floorDropSchema),
  chaseDiv: z.number(),
  /** Conservative EV − entry over the priced, rated drops only. */
  netDiv: z.number(),
  netBound: netBoundSchema,
  /** Drops EV leaves out (no sourced rate or no price) — what makes a net a lower bound. */
  uncountedDrops: z.number().int(),
  chaseOneIn: z.number().nullable(),
  pLosingRun: z.number().nullable(),
  losingRunUnknownRates: z.number().int(),
  losingRunConfidence: confidenceSchema.nullable(),
  headline: z.object({ text: z.string(), tone: toneSchema, title: z.string() }),
  /** Weakest confidence among the lines that carry the EV; "unverified" when none has a rate. */
  confidence: confidenceSchema,
  unpriced: z.array(z.string()),
  unpricedLineage: z.number().int(),
  /** Drops with no published rate — EV leaves them out, so it is a lower bound. */
  unknownRate: z.number().int(),
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
