/*
 * The strategy KB as one league's viewer sees it: curated facts unchanged, plus yield art, the
 * latest poe.ninja exchange price and 7-day change per yield, the 7-day trend of each strategy's
 * drops (and of each mechanic's), and a trade2 search link per tablet mod. Pure over its inputs
 * (buildStrategyViews / mechanicTrends) so tests can price it without a database; loadStrategyBoard
 * wires the league's stores for GET /api/farm/strategies.
 */
import { latestFetchedAt } from "../../db/marketQueries";
import { latestChangeRowsFor } from "../../db/latestSnapshotQueries";
import type { MechanicTrend, StrategiesResponse, StrategyView, Trend, YieldView } from "../../lib/strategiesContract";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import { tradeSearchUrl } from "../../lib/tradeLink";
import { entityById } from "../entities/load";
import { resolveRates } from "../rates";
import { loadStrategies } from "./load";
import { MECHANICS, type FarmStrategy, type StrategyYield, type Tablet } from "./schema";
import { basketTrend } from "./trend";

/** One exchange item's market as the strategy views need it. */
export interface YieldMarket {
  /** Divine per item. */
  div: number;
  /** ISO-8601 UTC time the price row was stored. */
  fetchedAt: string;
  change7d: number | null;
  volume: number;
}

type Markets = ReadonlyMap<string, YieldMarket>;

function exchangeIdOf(ref: StrategyYield["ref"]): string | null {
  const row = entityById(ref.id);
  if (!row) throw new Error(`strategy yield "${ref.id}" is not in the entity catalog`);
  return row.exchange_id;
}

function marketOf(entry: StrategyYield, markets: Markets): YieldMarket | undefined {
  const id = exchangeIdOf(entry.ref);
  return id === null ? undefined : markets.get(id);
}

function yieldView(entry: StrategyYield, markets: Markets, nowMs: number): YieldView {
  const row = entityById(entry.ref.id);
  if (!row) throw new Error(`strategy yield "${entry.ref.id}" is not in the entity catalog`);
  const market = marketOf(entry, markets);
  return {
    ...entry,
    icon_url: row.icon_url,
    price: market
      ? { div: market.div, ageMin: Math.max(0, (nowMs - Date.parse(market.fetchedAt)) / 60_000), change7d: market.change7d, source: "ninja" }
      : null,
  };
}

function tabletView(tablet: Tablet, league: string): StrategyView["tablets"][number] {
  return {
    ...tablet,
    mods: tablet.mods.map((mod) => ({
      ...mod,
      search_url:
        mod.trade_stat_id === null
          ? null
          : tradeSearchUrl(league, { type: tablet.type, name: tablet.unique ?? undefined, stats: [{ id: mod.trade_stat_id }] }),
    })),
  };
}

/** The weighted 7-day move of a set of yields (deduplicated by entity id); null when none is priced with a trend. */
export function yieldsTrend(yields: readonly StrategyYield[], markets: Markets): Trend | null {
  const unique = [...new Map(yields.map((y) => [y.ref.id, y])).values()];
  const items = unique.flatMap((y) => {
    const market = marketOf(y, markets);
    return market ? [market] : [];
  });
  const trend = basketTrend(items);
  return trend && { change7d: trend.change7d, counted: trend.counted, total: unique.length };
}

/** Every strategy priced against `markets` (keyed by exchange id) and linked into `league`'s trade site. */
export function buildStrategyViews(strategies: readonly FarmStrategy[], league: string, markets: Markets, nowMs: number): StrategyView[] {
  return strategies.map((strategy) => ({
    ...strategy,
    yields: strategy.yields.map((entry) => yieldView(entry, markets, nowMs)),
    tablets: strategy.tablets.map((tablet) => tabletView(tablet, league)),
    trend: yieldsTrend(strategy.yields, markets),
  }));
}

/** One chip per mechanic a strategy covers (schema order): the trend over all its strategies' drops. */
export function mechanicTrends(strategies: readonly FarmStrategy[], markets: Markets): MechanicTrend[] {
  return MECHANICS.flatMap((mechanic) => {
    const covering = strategies.filter((s) => s.mechanics.includes(mechanic));
    if (covering.length === 0) return [];
    return [{ mechanic, trend: yieldsTrend(covering.flatMap((s) => s.yields), markets) }];
  });
}

/** The league's latest exchange rows for every yield that trades on the exchange. */
function loadMarkets(league: string, strategies: readonly FarmStrategy[]): Map<string, YieldMarket> {
  const ids = [...new Set(strategies.flatMap((s) => s.yields.map((y) => exchangeIdOf(y.ref))).filter((id): id is string => id !== null))];
  const markets = new Map<string, YieldMarket>();
  for (const row of latestChangeRowsFor(league, ids)) {
    // a non-positive value is not a price: the yield stays unpriced rather than showing 0
    if (!(row.baseValue > 0)) continue;
    markets.set(row.itemId, {
      div: row.baseValue,
      fetchedAt: new Date(parseSqliteTimestamp(row.fetchedAt)).toISOString(),
      change7d: row.change7d,
      volume: row.volume ?? 0,
    });
  }
  return markets;
}

/** GET /api/farm/strategies body for one league at `nowMs`: all strategies, filtering is client-side. */
export function loadStrategyBoard(league: string, nowMs: number): StrategiesResponse {
  const rates = resolveRates(league, nowMs);
  const exPerDiv = rates && rates.rates.exaltPerDivine > 0 ? rates.rates.exaltPerDivine : null;
  const strategies = loadStrategies();
  const markets = loadMarkets(league, strategies);
  return {
    computedLeague: league,
    exPerDiv,
    pricesFetchedAt: latestFetchedAt(league),
    strategies: buildStrategyViews(strategies, league, markets, nowMs),
    mechanics: mechanicTrends(strategies, markets),
  };
}
