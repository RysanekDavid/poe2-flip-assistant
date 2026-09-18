import { deriveCxRates, fetchCxDigest, type CxDigest, type CxRates } from "../api/cxClient";
import { fetchScoutLeagues } from "../api/scoutClient";
import type { LeagueOption } from "../api/types";
import {
  ratesFetchedAt,
  timestampAgeMs,
  upsertCurrencyRates,
  type RateUpsert,
} from "../db/ratesQueries";

/**
 * Network-side of the rates ladder: pulling GGG's currency-exchange digest into currency_rates.
 *
 * Both callers here are deliberately FAIL-QUIET. The poller must survive a CDN hiccup, and a
 * league switch must not be rolled back because a bonus rate fetch failed — the switch is the
 * user's instruction, the rates are a convenience that the next poll cycle will supply anyway.
 * Quiet means console.warn, never a swallowed error.
 */

/** Refresh slightly before the hourly digest rolls over, so a cycle rarely serves stale rates. */
const CX_STALE_AFTER_MS = 55 * 60 * 1000;

/** A switch immediately after another switch should not re-fetch — the payload holds all leagues. */
const BOOTSTRAP_DEBOUNCE_MS = 5 * 60 * 1000;

/** Standard always exists and is what a mis-switched user falls back to; it rides along free. */
const ALWAYS_TRACKED = "Standard";

/**
 * The two network reads, injectable — same seam the league watcher uses, so the tests drive the
 * real storage and fallback logic without a single socket.
 */
export interface RateSources {
  digest: () => Promise<CxDigest>;
  scoutLeagues: () => Promise<LeagueOption[]>;
}

const LIVE_SOURCES: RateSources = {
  digest: () => fetchCxDigest(),
  scoutLeagues: fetchScoutLeagues,
};

function toUpserts(rates: CxRates): RateUpsert[] {
  return rates.pairs.map((p) => ({
    pair: p.pair,
    rate: p.rate,
    rateLow: p.rateLow,
    rateHigh: p.rateHigh,
    sampleVolume: p.sampleVolume,
    hour: rates.hour,
  }));
}

/** Store one digest's rates for the given leagues. Returns the leagues that actually had data. */
function storeDigestRates(digest: CxDigest, leagues: readonly string[]): string[] {
  const written: string[] = [];
  for (const league of new Set(leagues)) {
    const rates = deriveCxRates(digest, league);
    if (rates == null) continue; // league traded no core pair this hour — nothing honest to store
    upsertCurrencyRates(league, toUpserts(rates), "cx");
    written.push(league);
  }
  return written;
}

function cxAgeMs(league: string): number | null {
  const at = ratesFetchedAt(league, "cx");
  return at == null ? null : timestampAgeMs(at);
}

/**
 * When a digest last came back INTACT — not merely when one was requested.
 *
 * A league with no exchange activity yet stores nothing, so its cx age stays null and the
 * "stale?" test would say yes on every five-minute poll cycle, forever. Remembering the last
 * good digest caps that at one fetch per stale window. A FAILED fetch deliberately does not
 * update it, so a CDN blip is retried next cycle instead of costing an hour of rates.
 */
let lastGoodDigestAt = 0;

/**
 * Poller hook: fetch ONE digest when any polled league's stored cx rates have gone stale, and
 * store every one of them plus Standard from it. Never throws.
 *
 * The digest is a single payload covering every league GGG lists, so serving four leagues costs
 * exactly what serving one did — which is why this takes the whole set rather than being called
 * per league (that would re-fetch the same payload N times, or skip N−1 of them on the debounce).
 */
export async function refreshCxRatesIfStale(
  leagues: readonly string[],
  sources: RateSources = LIVE_SOURCES,
): Promise<string[]> {
  const stale = leagues.filter((l) => {
    const age = cxAgeMs(l);
    return age == null || age >= CX_STALE_AFTER_MS;
  });
  if (stale.length === 0) return [];
  if (Date.now() - lastGoodDigestAt < CX_STALE_AFTER_MS) return [];
  try {
    const digest = await sources.digest();
    lastGoodDigestAt = Date.now();
    const written = storeDigestRates(digest, [...leagues, ALWAYS_TRACKED]);
    if (written.length > 0) console.log(`[cx] rates updated for ${written.join(", ")}`);
    else console.warn(`[cx] digest has no currency-exchange activity for ${stale.join(", ")} yet`);
    return written;
  } catch (err) {
    console.warn(`[cx] rate refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/** poe2scout publishes both Divine-denominated rates on its league row — the cx fallback. */
async function bootstrapFromScout(league: string, sources: RateSources): Promise<boolean> {
  const rows = await sources.scoutLeagues();
  const match = rows.find((l) => l.name === league) ?? null;
  if (match?.exaltPerDivine == null || match.chaosPerDivine == null) return false;
  if (!(match.exaltPerDivine > 0) || !(match.chaosPerDivine > 0)) return false;
  upsertCurrencyRates(
    league,
    [
      { pair: "exalt_per_divine", rate: match.exaltPerDivine },
      { pair: "chaos_per_divine", rate: match.chaosPerDivine },
      { pair: "exalt_per_chaos", rate: match.exaltPerDivine / match.chaosPerDivine },
    ],
    "scout",
  );
  return true;
}

/**
 * Give a just-switched league usable rates immediately, so Div/Chaos/Ex show up before the
 * poller's first cycle instead of an empty dashboard. cx first, scout as the fallback.
 * Never throws: a failed bootstrap leaves the switch committed and the rates to the poller.
 */
export async function bootstrapRatesForLeague(
  league: string,
  sources: RateSources = LIVE_SOURCES,
): Promise<"cx" | "scout" | "skipped" | "failed"> {
  const age = cxAgeMs(league);
  if (age != null && age < BOOTSTRAP_DEBOUNCE_MS) return "skipped";

  try {
    const digest = await sources.digest();
    if (storeDigestRates(digest, [league]).length > 0) return "cx";
    console.warn(`[cx] no currency-exchange activity for "${league}" this hour — falling back to scout`);
  } catch (err) {
    console.warn(`[cx] bootstrap fetch failed for "${league}": ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    if (await bootstrapFromScout(league, sources)) return "scout";
    console.warn(`[cx] poe2scout published no usable rates for "${league}"`);
  } catch (err) {
    console.warn(`[cx] scout bootstrap failed for "${league}": ${err instanceof Error ? err.message : String(err)}`);
  }
  return "failed";
}
