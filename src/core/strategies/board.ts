/*
 * The strategy KB as one league's viewer sees it: curated facts unchanged, plus yield art and the
 * latest poe.ninja exchange price per yield, and a trade2 search link per tablet mod. Pure over its
 * inputs (buildStrategyViews) so tests can price it without a database; loadStrategyBoard wires
 * the league's stores for GET /api/farm/strategies.
 */
import { latestFetchedAt } from "../../db/marketQueries";
import type { StrategiesResponse, StrategyView, YieldView } from "../../lib/strategiesContract";
import { tradeSearchUrl } from "../../lib/tradeLink";
import { entityById } from "../entities/load";
import { exchangePriceMap, type ExchangePrice } from "../entities/prices";
import { resolveRates } from "../rates";
import { loadStrategies } from "./load";
import type { FarmStrategy, StrategyYield, Tablet } from "./schema";

function yieldView(entry: StrategyYield, prices: ReadonlyMap<string, ExchangePrice>, nowMs: number): YieldView {
  const row = entityById(entry.ref.id);
  if (!row) throw new Error(`strategy yield "${entry.ref.id}" is not in the entity catalog`);
  const price = row.exchange_id ? prices.get(row.exchange_id) : undefined;
  return {
    ...entry,
    icon_url: row.icon_url,
    price: price
      ? { div: price.div, ageMin: Math.max(0, (nowMs - Date.parse(price.fetchedAt)) / 60_000), source: "ninja" }
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

/** Every strategy priced against `prices` (Divine per exchange id) and linked into `league`'s trade site. */
export function buildStrategyViews(
  strategies: readonly FarmStrategy[],
  league: string,
  prices: ReadonlyMap<string, ExchangePrice>,
  nowMs: number,
): StrategyView[] {
  return strategies.map((strategy) => ({
    ...strategy,
    yields: strategy.yields.map((entry) => yieldView(entry, prices, nowMs)),
    tablets: strategy.tablets.map((tablet) => tabletView(tablet, league)),
  }));
}

/** GET /api/farm/strategies body for one league at `nowMs`: all strategies, filtering is client-side. */
export function loadStrategyBoard(league: string, nowMs: number): StrategiesResponse {
  const rates = resolveRates(league, nowMs);
  const exPerDiv = rates && rates.rates.exaltPerDivine > 0 ? rates.rates.exaltPerDivine : null;
  return {
    computedLeague: league,
    exPerDiv,
    pricesFetchedAt: latestFetchedAt(league),
    strategies: buildStrategyViews(loadStrategies(), league, exchangePriceMap(league), nowMs),
  };
}
