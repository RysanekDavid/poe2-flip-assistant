import { fetchDemand } from "../../api/scoutDemand";
import type { PricedItem } from "../../api/types";
import { config } from "../../config/env";
import { scoutValueMap } from "../../db/marketQueries";
import type { CxMarketView } from "../cx/cxItemMarkets";
import { getDefaultLeague } from "../leagueState";
import type { ExchangeRates } from "../priceEngine";
import type { PlanContext, ScoutListing } from "./plan";

/**
 * The planner's inputs, read one way for every caller (Stash › Sell and Trade › Price check), so
 * the same item can never be planned against different markets by the two panels.
 */

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * poe2scout live-listing counts for the entries that are not exchange items. poe2scout is only
 * read for the app default league; any other league gets no competition, said out loud.
 */
export async function loadCompetition(
  league: string,
  keys: readonly string[],
  logTag: string,
): Promise<{ map: Map<string, ScoutListing>; warning: string | null }> {
  const map = new Map<string, ScoutListing>();
  if (keys.length === 0) return { map, warning: null };
  if (league !== getDefaultLeague()) return { map, warning: `listing competition is only read for ${getDefaultLeague()}` };
  try {
    const wanted = new Set(keys);
    for (const d of (await fetchDemand()).items) {
      const key = d.name.toLowerCase();
      if (!wanted.has(key) || map.has(key)) continue;
      map.set(key, { competition: { listed: d.quantity, sellThrough: d.sellThrough, samples: d.samples }, icon: d.icon });
    }
    return { map, warning: null };
  } catch (e: unknown) {
    console.warn(`[${logTag}] poe2scout competition failed: ${errText(e)}`);
    return { map, warning: `listing competition unavailable (poe2scout: ${errText(e)})` };
  }
}

export interface PlanContextInputs {
  league: string;
  rates: ExchangeRates;
  ninjaByName: ReadonlyMap<string, PricedItem>;
  cxView: CxMarketView | null;
  /** Fair value from your own listing's trade2 comparables, per lowercased name. */
  compDiv: ReadonlyMap<string, number>;
  competition: ReadonlyMap<string, ScoutListing>;
}

export function buildPlanContext(i: PlanContextInputs): PlanContext {
  return {
    rates: i.rates,
    ninjaByName: i.ninjaByName,
    cxByItemId: i.cxView?.byItemId ?? new Map(),
    // lineage gems sit in stashes too; both are poe2scout values
    uniqueDiv: scoutValueMap(i.league),
    compDiv: i.compDiv,
    competition: i.competition,
    params: { goldPerExalt: config.cx.goldPerExalt, flowSharePct: config.cx.flowSharePct, maxGridStepPct: config.cx.maxGridStepPct },
  };
}
