import { z } from "zod";

/**
 * GET /api/league/start and POST /api/league/start/presets — league-start mode. Shared by the
 * routes (validated on the way out) and the Exchange tab panel (validated on the way in).
 *
 * All money is Divine. A price nobody observed is null, never 0: a 0 would read as "worthless".
 * Ratios are "price N days later ÷ price today" at the same point of past league starts.
 */

export const leagueStartSignalSchema = z.enum(["sell-now", "drift", "hold", "rising", "unknown"]);
export type LeagueStartSignal = z.infer<typeof leagueStartSignalSchema>;

export const leagueStartItemSchema = z.object({
  /** GGG exchange base id. */
  baseId: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().nullable(),
  /** poe.ninja id the watchlist keys by; null when the item has no unambiguous ninja line. */
  watchItemId: z.string().nullable(),
  /** Latest exchange mid in this league; null when the item did not trade in the newest stored hour. */
  nowDiv: z.number().positive().nullable(),
  ratio7: z.number().positive().nullable(),
  ratio14: z.number().positive().nullable(),
  /** nowDiv × ratio7, when both exist. */
  expected7Div: z.number().positive().nullable(),
  signal: leagueStartSignalSchema,
  /** Past leagues behind ratio7. */
  confidence: z.number().int().nonnegative(),
});
export type LeagueStartItem = z.infer<typeof leagueStartItemSchema>;

export const pastLeagueSchema = z.object({
  league: z.string(),
  startHour: z.number().int(),
  daysAvailable: z.number().int().nonnegative(),
});

export const leagueStartResponseSchema = z.object({
  /** The caller's league. */
  league: z.string(),
  /** Its base name (HC/SSF stripped) — the league the start is dated for. */
  baseLeague: z.string(),
  curveDays: z.number().int().positive(),
  /** Unix seconds of the first digest hour the league traded in; null until dated. */
  startHour: z.number().int().nullable(),
  /** 0-based league day now; null until dated. */
  day: z.number().int().nonnegative().nullable(),
  active: z.boolean(),
  /** Past league starts with a usable curve — what "based on N past league start(s)" quotes. */
  basedOn: z.number().int().nonnegative(),
  pastLeagues: z.array(pastLeagueSchema),
  /** Days of THIS league's own curve recorded so far (it becomes a past league for the next one). */
  recordedDays: z.number().int().nonnegative(),
  items: z.array(leagueStartItemSchema),
  /** Plain reason when the mode is off or has nothing to say; null when items speak for themselves. */
  note: z.string().nullable(),
});
export type LeagueStartResponse = z.infer<typeof leagueStartResponseSchema>;

export const leagueStartPresetResponseSchema = z.object({
  /** Item names added to the caller's watchlist. */
  added: z.array(z.string()),
  /** Sell-now items already on the watchlist in this league (left untouched). */
  alreadyWatched: z.number().int().nonnegative(),
});
export type LeagueStartPresetResponse = z.infer<typeof leagueStartPresetResponseSchema>;
