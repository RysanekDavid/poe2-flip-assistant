import { searchListingsLinked, type TradeCred } from "../../api/tradeClient";
import { withCredStatus } from "../../auth/credStatus";
import { latestStashItems } from "../../db/balanceItemQueries";
import { pruneListingComps, upsertListingComp } from "../../db/listingCompsQueries";
import { finishRepriceRun } from "../../db/repriceRunQueries";
import { getDefaultLeague } from "../leagueState";
import { resolveRates } from "../rates";
import { pickRepriceCandidates, repriceQuery, runRepriceScan, REPRICE_COMPARABLES, type RepriceDeps } from "./repriceScan";

/**
 * One user's queued reprice check, end to end: latest stash read → candidates → metered trade2
 * searches under the user's own cookie → listing_comps → the run's outcome on reprice_runs.
 * Poller-only (scheduler/tradeScans drains the queue); never called from a web route.
 */
export interface RepriceUserResult {
  userId: number;
  candidates: number;
  checked: number;
  searches: number;
  fetches: number;
  error: string | null;
}

function liveDeps(userId: number, league: string): RepriceDeps {
  return {
    // wrapped per request: each search is this user's cookie answering trade2 (ok / expired)
    search: (q, cred) => withCredStatus(userId, cred, () => searchListingsLinked(q, REPRICE_COMPARABLES, cred)),
    queryFor: repriceQuery,
    writeComp: (c) => upsertListingComp(userId, league, c),
  };
}

function fail(userId: number, error: string): RepriceUserResult {
  finishRepriceRun(userId, { checked: 0, searches: 0, error });
  return { userId, candidates: 0, checked: 0, searches: 0, fetches: 0, error };
}

export async function repriceForUser(userId: number, cred: TradeCred | null, nowMs: number = Date.now()): Promise<RepriceUserResult> {
  if (cred == null) return fail(userId, "no POESESSID stored — connect it in Settings");
  // stash reads run in the app default league, so their listings are priced and searched there
  const league = getDefaultLeague();
  const resolved = resolveRates(league);
  if (resolved == null) return fail(userId, `no exchange rates for ${league} — cannot price comparables`);
  const { items } = latestStashItems(userId, league);
  const candidates = pickRepriceCandidates(items, resolved.rates, nowMs);
  const r = await runRepriceScan(candidates, cred, resolved.rates, liveDeps(userId, league));
  pruneListingComps(userId, league, items.map((i) => i.listing_id).filter((id): id is string => id != null));
  // per-row failures only fail the run when nothing at all could be checked
  const error = r.fatal ?? (r.checked === 0 && r.errors.length > 0 ? r.errors.join("; ") : null);
  finishRepriceRun(userId, { checked: r.checked, searches: r.meter.search, error });
  for (const e of r.errors) console.warn(`[reprice] user ${userId}: ${e}`);
  return { userId, candidates: candidates.length, checked: r.checked, searches: r.meter.search, fetches: r.meter.fetch, error };
}
