import { z } from "zod";
import { confidenceSchema } from "../core/tools/bossEv/schema";
import { bossViewSchema } from "./tools/bossEvContract";

/**
 * GET /api/farm — the Farm tab's one payload: mechanic baskets ranked by 7d heat, pinnacle bosses
 * ranked by net per kill, and each boss's full evaluation for the detail panel. Shared by the route
 * (validated on the way out) and the client (validated on the way in). All money is Divine.
 *
 * Div/hour is the viewer's own: it exists only where they entered their clear speed (and, for a
 * mechanic, their own Div per map) — never a fabricated default, so every such field is nullable.
 */

export const farmKindSchema = z.enum(["boss", "mechanic"]);
export type FarmKind = z.infer<typeof farmKindSchema>;

/**
 * How far a net (and the Div/hour scaled from it) can be trusted: `lower` when some drop has no
 * sourced rate or no price (EV leaves it out, so the real value is at least this), `upper` when part
 * of the entry is unpriced, `unknown` when both, `exact` otherwise.
 */
export const netBoundSchema = z.enum(["exact", "lower", "upper", "unknown"]);
export type NetBound = z.infer<typeof netBoundSchema>;

/** The viewer's own pace on one board row; null wherever they have not entered it. */
const speedFields = {
  /** Minutes per kill (boss) or per map (mechanic). */
  yourMinutes: z.number().positive().nullable(),
  /** Div/hour; null unless every input it needs is known (bosses: also null when netBound is unknown). */
  divPerHour: z.number().nullable(),
  /** The bound divPerHour inherits (a boss's netBound; a mechanic's own numbers are exact); null with no Div/hour. */
  divPerHourBound: netBoundSchema.nullable(),
};

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
  ...speedFields,
  /** The viewer's own Div per map for this mechanic — the market cannot know what a map yields. */
  yourDivPerRun: z.number().nonnegative().nullable(),
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
  netBound: netBoundSchema,
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
  ...speedFields,
});
export type BossRow = z.infer<typeof bossRowSchema>;

export type FarmBoardRow = MechanicRow | BossRow;

/** One saved pace, as GET /api/farm lists it and PUT /api/farm/speed returns it. */
export const speedEntrySchema = z.object({
  kind: farmKindSchema,
  key: z.string(),
  minutesPerRun: z.number().positive(),
  /** Mechanics only; null = not entered (a boss's per-kill value comes from the market). */
  divPerRun: z.number().nonnegative().nullable(),
  /** Epoch ms of the last save. */
  updatedAt: z.number().int(),
});
export type SpeedEntry = z.infer<typeof speedEntrySchema>;

// A day is far past any real clear; the cap only stops a typo from reading as a pace.
export const MAX_MINUTES_PER_RUN = 24 * 60;

/**
 * PUT /api/farm/speed body: a full replacement of the viewer's pace on one row. A boss takes no
 * divPerRun — its per-kill value is the market net, and a hand-typed one would silently override it.
 */
export const speedPutSchema = z
  .object({
    kind: farmKindSchema,
    key: z.string().trim().min(1).max(64),
    minutesPerRun: z.number().finite().positive().max(MAX_MINUTES_PER_RUN),
    divPerRun: z.number().finite().nonnegative().nullable().optional(),
  })
  .strict()
  .refine((b) => b.kind === "mechanic" || b.divPerRun == null, {
    message: "divPerRun is for mechanics only — a boss's per-kill value comes from the market",
    path: ["divPerRun"],
  });
export type SpeedPut = z.infer<typeof speedPutSchema>;

/** DELETE /api/farm/speed body. */
export const speedDeleteSchema = z.object({ kind: farmKindSchema, key: z.string().trim().min(1).max(64) }).strict();
export type SpeedDelete = z.infer<typeof speedDeleteSchema>;

export const speedPutResponseSchema = z.object({ entry: speedEntrySchema });
export const speedDeleteResponseSchema = z.object({ ok: z.literal(true) });
export const speedErrorSchema = z.object({ error: z.string() });

/** "minutesPerRun: Number must be greater than 0" — the first issue, with where it is. */
export function speedErrorText(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "invalid request";
  return first.path.length > 0 ? `${first.path.join(".")}: ${first.message}` : first.message;
}

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
  /** Every pace the viewer saved, including keys not on today's board (a mechanic that went cold). */
  speed: z.array(speedEntrySchema),
});
export type FarmResponse = z.infer<typeof farmResponseSchema>;
