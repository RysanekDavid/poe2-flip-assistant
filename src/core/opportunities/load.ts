import { fetchDemand, type CachedDemand } from "../../api/scoutDemand";
import { config } from "../../config/env";
import { recentSnipeAlerts } from "../../db/alertQueries";
import { balanceStats } from "../../db/balanceQueries";
import { outcomesSince } from "../../db/snipeOutcomeQueries";
import { lastScanReport } from "../../db/snipeReportQueries";
import { uniqueTradeValues } from "../../db/uniqueTradeQueries";
import { opportunitiesResponseSchema, type Budget, type OpportunitiesResponse, type RisingSection, type SnipeSection } from "../../lib/opportunitiesContract";
import type { NearMiss } from "../../lib/snipeScanContract";
import { getDefaultLeague } from "../leagueState";
import { leagueForUser } from "../leagueUsers";
import { buildMarketUniques } from "../marketUniques";
import { NEAR_MISS_MIN_MARGIN_PCT, type NearMissLimits } from "../snipeNearMiss";
import { budgetFromNetWorth } from "./budget";
import { goneListings } from "./liveSnipes";
import { buildRising } from "./rising";
import { buildSnipeSection } from "./snipeSection";

/**
 * The I/O half of Market › Opportunities: reads what the app already stores (SNIPE alerts, the
 * outcome tracker, the last scan report, net worth, the shared poe2scout fill and the trade2
 * fallback prices) and hands it to the pure builders. It sends no trade2 request.
 */

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The last report's near-misses for `league`, or why the report cannot be read. */
function reportNearMisses(league: string): { nearMisses: NearMiss[]; error: string | null } {
  const parsed = lastScanReport();
  if (!parsed?.report) return { nearMisses: [], error: parsed?.error ?? null };
  return { nearMisses: parsed.report.league === league ? (parsed.report.nearMisses ?? []) : [], error: null };
}

function loadSnipes(userId: number, league: string, viewerLeague: string, budget: Budget, nowMs: number): SnipeSection {
  const limits: NearMissLimits = { gate: config.snipeGate, minMarginPct: NEAR_MISS_MIN_MARGIN_PCT, minValueDiv: config.valuation.minValueDiv };
  const freshMin = limits.gate.freshMinutes;
  const report = reportNearMisses(league);
  return buildSnipeSection({
    // a listing is older than its alert, so an alert past the freshness window cannot be fresh
    alerts: recentSnipeAlerts(userId, freshMin),
    gone: goneListings(outcomesSince(nowMs - freshMin * 60_000, 1000)),
    nearMisses: report.nearMisses,
    limits,
    budget,
    viewerLeague,
    scannerEnabled: config.autoSnipe.enabled,
    reportError: report.error,
    nowMs,
  });
}

function newestPointAt(demand: CachedDemand): string | null {
  let newest: string | null = null;
  for (const i of demand.items) if (i.priceAt != null && (newest == null || i.priceAt > newest)) newest = i.priceAt;
  return newest;
}

/** Rising uniques from the shared scout fill. A scout failure fails this section only, with its reason. */
async function loadRising(viewerLeague: string, budget: Budget, nowMs: number): Promise<RisingSection> {
  try {
    const demand = await fetchDemand();
    const uniques = buildMarketUniques({ demand, viewerLeague, trade: uniqueTradeValues(demand.league), nowMs });
    const history = new Map(demand.items.map((i) => [String(i.id), { recent: i.recent, newestAt: i.priceAt }] as const));
    return buildRising({ items: uniques.items, history, newestPointAt: newestPointAt(demand), budget, nowMs });
  } catch (e: unknown) {
    console.warn(`[opportunities] rising uniques: ${errText(e)}`);
    return { status: "error", error: `rising uniques unavailable: ${errText(e)}` };
  }
}

export async function loadOpportunities(userId: number, nowMs: number = Date.now()): Promise<OpportunitiesResponse> {
  // the scanner, scout and the net-worth reader all run in the app default league
  const league = getDefaultLeague();
  const viewerLeague = leagueForUser(userId);
  const latest = balanceStats(userId, league).latest;
  const budget = budgetFromNetWorth(latest ? { netWorthDiv: latest.net_worth_div, at: latest.fetched_at } : null);
  const snipes = loadSnipes(userId, league, viewerLeague, budget, nowMs);
  const rising = await loadRising(viewerLeague, budget, nowMs);
  return opportunitiesResponseSchema.parse({ league, viewerLeague, generatedAt: new Date(nowMs).toISOString(), budget, snipes, rising });
}
