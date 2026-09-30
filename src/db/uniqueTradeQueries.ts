import { z } from "zod";
import { getDb } from "./database";
import { parseSqliteTimestamp } from "../lib/sqliteTime";

/**
 * unique_trade_values: trade2 fallback prices for curated boss uniques poe2scout does not price.
 * Written only by the poller's unique-trade-values job; read by the Farm boss pricing.
 */

const rowSchema = z.object({
  name_key: z.string(),
  value_div: z.number().positive().nullable(),
  listed: z.number().int().nonnegative().nullable(),
  samples: z.number().int().nonnegative().nullable(),
  observed_at: z.string().nullable(),
  checked_at: z.string(),
  searched_at: z.string().nullable(),
  error: z.string().nullable(),
});

/** What the last successful search saw. `div` null = searched but too few usable listings (never 0). */
export interface UniqueTradeObservation {
  div: number | null;
  listed: number;
  samples: number;
  atMs: number;
}

/** One unique's stored trade2 state: the last successful search, the last attempt, the last spend. */
export interface UniqueTradeRow {
  nameKey: string;
  observed: UniqueTradeObservation | null;
  checkedAtMs: number;
  /** When a search request was last actually sent for it; null when none ever was. */
  searchedAtMs: number | null;
  /** Why the last attempt failed; null when it succeeded. */
  error: string | null;
}

export interface ObservationWrite {
  nameKey: string;
  div: number | null;
  listed: number;
  samples: number;
  at: string;
}

export interface FailureWrite {
  nameKey: string;
  error: string;
  at: string;
  /** A search request went out (trade2 answered with an error, or never answered): it counts against the cap. */
  spent: boolean;
}

/** Record a successful search: its price (or null) replaces the previous one, and any error clears. */
export function recordUniqueTradeObservation(league: string, w: ObservationWrite): void {
  if (w.div != null && !(w.div > 0)) throw new Error(`unique_trade_values: ${w.nameKey} priced at ${w.div} — a non-positive price is not a price`);
  getDb()
    .prepare(
      `INSERT INTO unique_trade_values (league, name_key, value_div, listed, samples, observed_at, checked_at, searched_at, error)
       VALUES (@league, @nameKey, @div, @listed, @samples, @at, @at, @at, NULL)
       ON CONFLICT(league, name_key) DO UPDATE SET
         value_div = excluded.value_div, listed = excluded.listed, samples = excluded.samples,
         observed_at = excluded.observed_at, checked_at = excluded.checked_at, searched_at = excluded.searched_at, error = NULL`,
    )
    .run({ league, nameKey: w.nameKey, div: w.div, listed: w.listed, samples: w.samples, at: w.at });
}

/**
 * Record a failed attempt without touching the last observation, so a good price keeps its true
 * age. searched_at moves only when the attempt actually sent a request.
 */
export function recordUniqueTradeFailure(league: string, w: FailureWrite): void {
  getDb()
    .prepare(
      `INSERT INTO unique_trade_values (league, name_key, checked_at, searched_at, error) VALUES (@league, @nameKey, @at, @searched, @error)
       ON CONFLICT(league, name_key) DO UPDATE SET
         checked_at = excluded.checked_at, error = excluded.error, searched_at = COALESCE(excluded.searched_at, searched_at)`,
    )
    .run({ league, nameKey: w.nameKey, at: w.at, searched: w.spent ? w.at : null, error: w.error });
}

function toRow(r: z.infer<typeof rowSchema>): UniqueTradeRow {
  const { observed_at: at, listed, samples } = r;
  const observed = at != null && listed != null && samples != null ? { div: r.value_div, listed, samples, atMs: parseSqliteTimestamp(at) } : null;
  if (observed == null && (r.value_div != null || at != null)) throw new Error(`unique_trade_values: ${r.name_key} has a partial observation`);
  return {
    nameKey: r.name_key,
    observed,
    checkedAtMs: parseSqliteTimestamp(r.checked_at),
    searchedAtMs: r.searched_at == null ? null : parseSqliteTimestamp(r.searched_at),
    error: r.error,
  };
}

/** Every stored unique for a league, keyed by scoutKey. A malformed row fails loudly. */
export function uniqueTradeValues(league: string): Map<string, UniqueTradeRow> {
  const raw = getDb()
    .prepare("SELECT name_key, value_div, listed, samples, observed_at, checked_at, searched_at, error FROM unique_trade_values WHERE league = ?")
    .all(league);
  return new Map(z.array(rowSchema).parse(raw).map((r) => [r.name_key, toRow(r)]));
}

/**
 * Epoch ms of every search request the job sent since `sinceMs`, in any league (the trade2 budget
 * is per IP). One row keeps only its latest spend, which is exact for a one-hour window: no unique
 * is searched twice within two hours (the retry and refresh floor).
 */
export function uniqueTradeSearchesSince(sinceMs: number): number[] {
  const rows = z
    .array(z.object({ searched_at: z.string() }))
    .parse(getDb().prepare("SELECT searched_at FROM unique_trade_values WHERE searched_at >= ?").all(new Date(sinceMs).toISOString()));
  return rows.map((r) => parseSqliteTimestamp(r.searched_at));
}
