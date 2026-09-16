import { getDb } from "./database";
import type { CxPair } from "../api/cxClient";

/**
 * Stored currency-exchange rates, one row per (league, pair, source).
 *
 * Only rates that cost a network call to obtain are stored: 'cx' (GGG's hourly public digest)
 * and 'scout' (poe2scout's league aggregate). ninja-derived rates are computed live from
 * price_snapshots on every read and deliberately NOT persisted — storing them would create a
 * second, silently-diverging copy of data we already hold.
 */

export type RatePair = CxPair;
export type RateSource = "cx" | "scout";

export interface CurrencyRateRow {
  league: string;
  pair: RatePair;
  rate: number;
  rate_low: number | null;
  rate_high: number | null;
  sample_volume: number | null;
  source: RateSource;
  fetched_at: string;
  hour: number | null;
}

export interface RateUpsert {
  pair: RatePair;
  rate: number;
  rateLow?: number | null;
  rateHigh?: number | null;
  sampleVolume?: number | null;
  hour?: number | null;
}

/** Replace this league's rates for one source. Zero/negative rates are refused, not stored. */
export function upsertCurrencyRates(league: string, rates: readonly RateUpsert[], source: RateSource): void {
  const usable = rates.filter((r) => Number.isFinite(r.rate) && r.rate > 0);
  if (usable.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO currency_rates (league, pair, rate, rate_low, rate_high, sample_volume, source, fetched_at, hour)
     VALUES (@league, @pair, @rate, @rateLow, @rateHigh, @sampleVolume, @source, CURRENT_TIMESTAMP, @hour)
     ON CONFLICT(league, pair, source) DO UPDATE SET
       rate = excluded.rate, rate_low = excluded.rate_low, rate_high = excluded.rate_high,
       sample_volume = excluded.sample_volume, fetched_at = CURRENT_TIMESTAMP, hour = excluded.hour`,
  );
  const tx = db.transaction((rows: readonly RateUpsert[]) => {
    for (const r of rows) {
      stmt.run({
        league,
        source,
        pair: r.pair,
        rate: r.rate,
        rateLow: r.rateLow ?? null,
        rateHigh: r.rateHigh ?? null,
        sampleVolume: r.sampleVolume ?? null,
        hour: r.hour ?? null,
      });
    }
  });
  tx(usable);
}

/** Every stored rate row for one league (all sources) — the caller picks by freshness. */
export function latestRates(league: string): CurrencyRateRow[] {
  return getDb()
    .prepare(
      `SELECT league, pair, rate, rate_low, rate_high, sample_volume, source, fetched_at, hour
       FROM currency_rates WHERE league = ? ORDER BY fetched_at DESC`,
    )
    .all(league) as CurrencyRateRow[];
}

/** Newest stored rate time for one league+source, or null when nothing is stored. */
export function ratesFetchedAt(league: string, source: RateSource): string | null {
  const row = getDb()
    .prepare("SELECT MAX(fetched_at) AS mx FROM currency_rates WHERE league = ? AND source = ?")
    .get(league, source) as { mx: string | null };
  return row.mx ?? null;
}

/**
 * Age of a SQLite timestamp in ms. CURRENT_TIMESTAMP writes "YYYY-MM-DD HH:MM:SS" in UTC with
 * no zone marker, which Date would otherwise read as local time — an hours-wide freshness bug
 * in exactly the check that decides whether a rate is still usable.
 */
export function timestampAgeMs(stamp: string, nowMs: number = Date.now()): number {
  const normalized = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(stamp) ? stamp : `${stamp.replace(" ", "T")}Z`;
  const parsed = new Date(normalized).getTime();
  if (Number.isNaN(parsed)) throw new Error(`unparseable timestamp: "${stamp}"`);
  return nowMs - parsed;
}
