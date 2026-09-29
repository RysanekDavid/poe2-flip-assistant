import { searchListingsLinked } from "../../api/tradeClient";
import type { PricedItem } from "../../api/types";
import { itemValuesAgeHours, latestFetchedAt, latestSnapshots } from "../../db/marketQueries";
import { timestampAgeMs } from "../../lib/sqliteTime";
import { planValuation } from "../comparableValuation";
import { loadCxMarketView } from "../cx/cxItemMarkets";
import { getDefaultLeague } from "../leagueState";
import { leagueForUser } from "../leagueUsers";
import { bookReference } from "../priceBookFeed";
import { resolveRates, type ResolvedRates } from "../rates";
import { liveValue, RatesUnavailableError } from "../tools/craftmoves/moves";
import { buildPlanContext, loadCompetition } from "../wealth/planContext";
import type { LiveServices, MarketAges, PriceCheckServices } from "./services";

/**
 * The production services: the caller's league, read from the DB with the same PlanContext builder
 * Wealth › Sell uses, plus the two trade2 calls the live route alone may spend.
 */

const minutes = (ms: number): number => Math.max(0, Math.round(ms / 60_000));

function marketAges(league: string, cxHour: number | null, nowMs: number): MarketAges {
  const ninjaAt = latestFetchedAt(league);
  const scoutHours = itemValuesAgeHours(league);
  return {
    ninjaAgeMin: ninjaAt == null ? null : minutes(timestampAgeMs(ninjaAt, nowMs)),
    cxAgeMin: cxHour == null ? null : minutes(nowMs - cxHour * 1000),
    // clamped like the others: a clock-skewed cache stamp must not become a negative age (a 500)
    scoutAgeMin: scoutHours == null ? null : minutes(scoutHours * 3_600_000),
  };
}

function ratesOrThrow(league: string): ResolvedRates {
  const rates = resolveRates(league);
  if (!rates) throw new RatesUnavailableError(league);
  return rates;
}

interface NinjaIndex {
  prices: PricedItem[];
  byName: Map<string, PricedItem>;
}

function ninjaIndex(league: string): NinjaIndex {
  const prices = latestSnapshots(league);
  return { prices, byName: new Map(prices.map((p) => [p.itemName.toLowerCase(), p])) };
}

/** Enough to classify, gate and price a live search — no exchange view or valuation cache reads. */
export function liveServices(userId: number): LiveServices {
  return liveFor(leagueForUser(userId)).live;
}

function liveFor(league: string): { live: LiveServices; ninja: NinjaIndex } {
  const rates = ratesOrThrow(league);
  const ninja = ninjaIndex(league);
  const byName = ninja.byName;
  const live: LiveServices = {
    league,
    defaultLeague: getDefaultLeague(),
    rates,
    isExchangeItem: (name) => byName.has(name.trim().toLowerCase()),
    trade: { liveRare: liveValue, searchComparables: searchListingsLinked },
  };
  return { live, ninja };
}

/** Throws RatesUnavailableError when the caller's league has no exchange rates yet. */
export function priceCheckServices(userId: number, hasCred: boolean, nowMs: number = Date.now()): PriceCheckServices {
  const { live, ninja } = liveFor(leagueForUser(userId));
  const { league } = live;
  const { prices, byName } = ninja;
  const cxView = loadCxMarketView(league, prices, nowMs);
  return {
    ...live,
    hasCred,
    ages: marketAges(league, cxView?.newestHour ?? null, nowMs),
    planContext: async (keys) => {
      const competition = await loadCompetition(league, keys.filter((k) => !byName.has(k)), "pricecheck");
      // a price check has no listing of yours behind it — no reprice comparables
      const ctx = buildPlanContext({ league, rates: live.rates.rates, ninjaByName: byName, cxView, compDiv: new Map(), competition: competition.map });
      return { ctx, warnings: competition.warning ? [competition.warning] : [] };
    },
    rarePlan: async (parsed) => {
      const plan = await planValuation(parsed);
      return { query: plan.query, signature: plan.signature, resolvedMods: plan.resolvedCount };
    },
    bookReference: (signature) => bookReference(league, signature, null),
  };
}
