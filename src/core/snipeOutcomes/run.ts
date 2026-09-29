import { createSearch, fetchListingStates, type TradeCred } from "../../api/tradeClient";
import { metered, newMeter, type TradeMeter } from "../../api/tradeMeter";
import { config } from "../../config/env";
import { getDefaultLeague } from "../leagueState";
import { resolveRates } from "../rates";
import { SNIPE_OUTCOMES_MAX_RESEARCH } from "../subsystems";
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
      maxSearches: SNIPE_OUTCOMES_MAX_RESEARCH,
    }),
  );
  return { ...summary, meter };
}

/** Heartbeat problem: a run that settled nothing but errors is failing, not pacing. */
export function snipeOutcomesProblem(s: OutcomeRunSummary): string | null {
  if (s.errors > 0 && s.listed + s.gone === 0 && s.missed < s.errors) return `${s.errors - s.missed} check(s) ended in error and none succeeded`;
  return null;
}
