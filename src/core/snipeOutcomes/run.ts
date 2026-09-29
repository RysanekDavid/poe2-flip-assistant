import { createSearch, fetchListingStates, type TradeCred } from "../../api/tradeClient";
import { metered, newMeter, type TradeMeter } from "../../api/tradeMeter";
import { config } from "../../config/env";
import { getDefaultLeague } from "../leagueState";
import { resolveRates } from "../rates";
import { checkOutcomes } from "./check";
import type { OutcomeRunSummary } from "./settle";

/**
 * One checker run under the owner's cred on this process's trade2 limiter. The meter counts the
 * requests that actually went out (a budget-refused one is not charged).
 */
export async function runSnipeOutcomeChecks(cred: TradeCred, nowMs: number = Date.now()): Promise<OutcomeRunSummary & { meter: TradeMeter }> {
  const meter = newMeter();
  const summary = await metered(meter, () =>
    checkOutcomes({
      fetchStates: (ids, queryId) => fetchListingStates(ids, queryId, cred),
      search: (q) => createSearch(q, "asc", cred),
      ratesFor: (league) => resolveRates(league, nowMs)?.rates ?? null,
      defaultLeague: getDefaultLeague(),
      nowMs,
      maxFetches: config.snipeOutcomes.maxFetchesPerRun,
      maxSearches: config.snipeOutcomes.maxSearchesPerRun,
    }),
  );
  return { ...summary, meter };
}

/**
 * Heartbeat problem text. Every fetched listing reading gone while the fetch method is unverified
 * is exactly what an expired search id serving nulls would look like — say so instead of green.
 */
export function snipeOutcomesProblem(s: OutcomeRunSummary): string | null {
  if (s.fetchedSlots > 0 && s.fetchedGone === s.fetchedSlots && s.fetchMethod === "unverified") {
    return `all ${s.fetchedSlots} fetched listing(s) read gone and the fetch method is unverified — outcomes may be wrong`;
  }
  const failed = s.errors - s.missed;
  if (failed > 0 && s.listed + s.gone === 0) return `${failed} check(s) ended in error and none succeeded`;
  return null;
}
