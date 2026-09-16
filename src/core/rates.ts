import { deriveRates, type ExchangeRates } from "./priceEngine";
import { latestSnapshots, latestFetchedAt } from "../db/marketQueries";
import { latestRates, timestampAgeMs, type CurrencyRateRow, type RateSource } from "../db/ratesQueries";

/**
 * One place that answers "what is a Divine worth in this league right now", across three
 * sources of very different character:
 *
 *  - `cx`    GGG's public Currency Exchange digest. Volume-weighted over the last full hour,
 *            available the INSTANT a league exists. Trusted for 2h, after which the hourly
 *            digest that should have replaced it clearly failed.
 *  - `ninja` Our own price_snapshots, refreshed every poll cycle. The steady-state source.
 *  - `scout` poe2scout's league aggregate. Coarse (~daily) and only worth using as the last
 *            thing standing, so it gets a 24h window.
 *
 * The ladder exists because a fresh league switch has no snapshots at all: without `cx` every
 * rate-dependent panel would read "rates unavailable" until the next poll.
 */

const CX_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Our own snapshots need a bound too, and it is the SAME 2h the header strip already paints red
 * as "prices stale". Without one, a retired league's month-old rows still satisfy this tier and
 * outrank a fresh scout row — month-old rates would silently price a position close.
 */
const NINJA_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const SCOUT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type RatesSource = "cx" | "ninja" | "scout";

export interface ResolvedRates {
  rates: ExchangeRates;
  source: RatesSource;
  /** When the underlying numbers were observed, or null when the source keeps no timestamp. */
  fetchedAt: string | null;
}

/**
 * How old a stored rate's DATA is, which is not the same as how long ago we downloaded it.
 *
 * A cx row carries the unix hour its digest covered, and that is the honest age: if the CDN
 * keeps serving yesterday's digest, re-downloading it every 55 minutes would renew `fetched_at`
 * forever and this tier would never age out in favour of our own snapshots.
 */
function dataAgeMs(row: CurrencyRateRow, nowMs: number): number {
  if (row.hour != null) return nowMs - row.hour * 1000;
  return timestampAgeMs(row.fetched_at, nowMs);
}

/** Both Divine-denominated rates from one source's rows, if that source has both and is fresh. */
function fromStoredSource(
  rows: readonly CurrencyRateRow[],
  source: RateSource,
  maxAgeMs: number,
  nowMs: number,
): ResolvedRates | null {
  const own = rows.filter((r) => r.source === source);
  const exalt = own.find((r) => r.pair === "exalt_per_divine");
  const chaos = own.find((r) => r.pair === "chaos_per_divine");
  if (exalt == null || chaos == null || !(exalt.rate > 0) || !(chaos.rate > 0)) return null;

  // Both legs must be fresh: a stale half would quietly mix two hours' markets into one rate.
  const age = Math.max(dataAgeMs(exalt, nowMs), dataAgeMs(chaos, nowMs));
  if (age > maxAgeMs) return null;

  return {
    rates: { exaltPerDivine: exalt.rate, chaosPerDivine: chaos.rate },
    source,
    fetchedAt: exalt.fetched_at,
  };
}

/**
 * Best available rates for a league, or null when no source can answer. Callers that previously
 * did `deriveRates(latestSnapshots())` use this instead and surface `source`/`fetchedAt` so the
 * UI can say where a number came from and how old it is.
 */
export function resolveRates(league: string, nowMs: number = Date.now()): ResolvedRates | null {
  const stored = latestRates(league);

  const cx = fromStoredSource(stored, "cx", CX_MAX_AGE_MS, nowMs);
  if (cx != null) return cx;

  const ninja = deriveRates(latestSnapshots(league));
  const ninjaAt = ninja != null ? latestFetchedAt(league) : null;
  if (ninja != null && ninjaAt != null && timestampAgeMs(ninjaAt, nowMs) <= NINJA_MAX_AGE_MS) {
    return { rates: ninja, source: "ninja", fetchedAt: ninjaAt };
  }

  return fromStoredSource(stored, "scout", SCOUT_MAX_AGE_MS, nowMs);
}
