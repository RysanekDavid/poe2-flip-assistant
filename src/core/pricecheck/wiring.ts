import { fetchDemand } from "../../api/scoutClient";
import { searchListingsLinked } from "../../api/tradeClient";
import type { PricedItem } from "../../api/types";
import { config } from "../../config/env";
import { itemValuesAgeHours, latestFetchedAt, latestSnapshots, uniqueValueMap } from "../../db/marketQueries";
import { timestampAgeMs } from "../../lib/sqliteTime";
import { planValuation } from "../comparableValuation";
import { loadCxMarketView } from "../cx/cxItemMarkets";
import { getDefaultLeague } from "../leagueState";
import { leagueForUser } from "../leagueUsers";
import { bookReference } from "../priceBookFeed";
import type { ExchangeRates } from "../priceEngine";
import { resolveRates, type ResolvedRates } from "../rates";
import { liveValue, RatesUnavailableError } from "../tools/craftmoves/moves";
import type { PlanContext, ScoutListing } from "../wealth/plan";
import type { MarketAges, PriceCheckServices } from "./services";

/**
 * The production PriceCheckServices: the caller's league, read from the DB the way Wealth › Sell
 * reads it (same PlanContext fields), plus the two trade2 calls the live route alone may spend.
 */

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const minutes = (ms: number): number => Math.max(0, Math.round(ms / 60_000));

/**
 * poe2scout live-listing counts for uniques. poe2scout is only read for the default league; any
 * other league gets none, said out loud (same rule as Wealth › Sell).
 */
async function loadCompetition(league: string, keys: readonly string[]): Promise<{ map: Map<string, ScoutListing>; warnings: string[] }> {
  const map = new Map<string, ScoutListing>();
  if (keys.length === 0) return { map, warnings: [] };
  if (league !== getDefaultLeague()) return { map, warnings: [`listing competition is only read for ${getDefaultLeague()}`] };
  try {
    const wanted = new Set(keys);
    for (const d of (await fetchDemand()).items) {
      const key = d.name.toLowerCase();
      if (!wanted.has(key) || map.has(key)) continue;
      map.set(key, { competition: { listed: d.quantity, sellThrough: d.sellThrough, samples: d.samples }, icon: d.icon });
    }
    return { map, warnings: [] };
  } catch (e: unknown) {
    console.warn(`[pricecheck] poe2scout competition failed: ${errText(e)}`);
    return { map, warnings: [`listing competition unavailable (poe2scout: ${errText(e)})`] };
  }
}

function marketAges(league: string, cxHour: number | null, nowMs: number): MarketAges {
  const ninjaAt = latestFetchedAt(league);
  const scoutHours = itemValuesAgeHours(league);
  return {
    ninjaAgeMin: ninjaAt == null ? null : minutes(timestampAgeMs(ninjaAt, nowMs)),
    cxAgeMin: cxHour == null ? null : minutes(nowMs - cxHour * 1000),
    scoutAgeMin: scoutHours == null ? null : Math.round(scoutHours * 60),
  };
}

function planContextLoader(league: string, rates: ExchangeRates, prices: readonly PricedItem[], ninjaByName: ReadonlyMap<string, PricedItem>, nowMs: number) {
  const cxView = loadCxMarketView(league, prices, nowMs);
  const load = async (keys: readonly string[]): Promise<{ ctx: PlanContext; warnings: string[] }> => {
    const competition = await loadCompetition(league, keys.filter((k) => !ninjaByName.has(k)));
    const ctx: PlanContext = {
      rates,
      ninjaByName,
      cxByItemId: cxView?.byItemId ?? new Map(),
      uniqueDiv: uniqueValueMap(league),
      // a price check has no listing of yours behind it — no reprice comparables
      compDiv: new Map(),
      competition: competition.map,
      params: { goldPerExalt: config.cx.goldPerExalt, flowSharePct: config.cx.flowSharePct, maxGridStepPct: config.cx.maxGridStepPct },
    };
    // a missing exchange history is already said by the planner's own cx-quote warning
    return { ctx, warnings: competition.warnings };
  };
  return { load, cxHour: cxView?.newestHour ?? null };
}

function ratesOrThrow(league: string): ResolvedRates {
  const rates = resolveRates(league);
  if (!rates) throw new RatesUnavailableError(league);
  return rates;
}

/** Throws RatesUnavailableError when the caller's league has no exchange rates yet. */
export function priceCheckServices(userId: number, hasCred: boolean, nowMs: number = Date.now()): PriceCheckServices {
  const league = leagueForUser(userId);
  const rates = ratesOrThrow(league);
  const prices = latestSnapshots(league);
  const ninjaByName = new Map(prices.map((p) => [p.itemName.toLowerCase(), p]));
  const planContext = planContextLoader(league, rates.rates, prices, ninjaByName, nowMs);
  return {
    league,
    defaultLeague: getDefaultLeague(),
    hasCred,
    rates,
    ages: marketAges(league, planContext.cxHour, nowMs),
    planContext: planContext.load,
    isExchangeItem: (name) => ninjaByName.has(name.trim().toLowerCase()),
    rareBook: async (parsed) => {
      const plan = await planValuation(parsed);
      return { query: plan.query, ref: bookReference(league, plan.signature, null), resolvedMods: plan.resolvedCount };
    },
    trade: { liveRare: liveValue, searchComparables: searchListingsLinked },
  };
}
