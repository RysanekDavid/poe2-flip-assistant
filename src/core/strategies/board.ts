/*
 * The strategy KB as one league's viewer sees it: curated facts unchanged, plus art, the latest
 * poe.ninja exchange price and 7-day change of every catalog ref, the 7-day trend of each farm's
 * drops (and of each mechanic's), the live EV of every priced conversion, and a trade2 search link
 * per tablet or target mod. Pure over its inputs (buildStrategyViews / mechanicTrends) so tests can
 * price it without a database; loadStrategyBoard wires the league's stores for
 * GET /api/farm/strategies.
 */
import { latestFetchedAt } from "../../db/marketQueries";
import { latestChangeRowsFor } from "../../db/latestSnapshotQueries";
import type {
  AnyStrategyView,
  ConversionView,
  MechanicTrend,
  PricedRef,
  StrategiesResponse,
  StrategyView,
  TabletModView,
  Trend,
  TradeLegView,
  YieldView,
} from "../../lib/strategiesContract";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import { tradeSearchUrl } from "../../lib/tradeLink";
import { entityById } from "../entities/load";
import { resolveRates } from "../rates";
import { conversionEv } from "./ev";
import { loadStrategies, strategiesOfKind } from "./load";
import {
  MECHANICS,
  strategyRefs,
  type Conversion,
  type EntityRef,
  type FarmStrategy,
  type Strategy,
  type StrategyYield,
  type Tablet,
  type TabletMod,
  type TradeLeg,
} from "./schema";
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

function catalogRow(ref: EntityRef) {
  const row = entityById(ref.id);
  if (!row) throw new Error(`strategy ref "${ref.id}" is not in the entity catalog`);
  return row;
}

function marketOf(ref: EntityRef, markets: Markets): YieldMarket | undefined {
  const id = catalogRow(ref).exchange_id;
  return id === null ? undefined : markets.get(id);
}

function priceOf(ref: EntityRef, markets: Markets, nowMs: number): YieldView["price"] {
  const market = marketOf(ref, markets);
  return market
    ? { div: market.div, ageMin: Math.max(0, (nowMs - Date.parse(market.fetchedAt)) / 60_000), change7d: market.change7d, source: "ninja" }
    : null;
}

function pricedRef(ref: EntityRef, markets: Markets, nowMs: number): PricedRef {
  return { ...ref, icon_url: catalogRow(ref).icon_url, price: priceOf(ref, markets, nowMs) };
}

function yieldView(entry: StrategyYield, markets: Markets, nowMs: number): YieldView {
  return { ...entry, icon_url: catalogRow(entry.ref).icon_url, price: priceOf(entry.ref, markets, nowMs) };
}

function modView(mod: TabletMod, league: string, type: string, unique: string | null): TabletModView {
  const search_url = mod.trade_stat_id === null ? null : tradeSearchUrl(league, { type, name: unique ?? undefined, stats: [{ id: mod.trade_stat_id }] });
  return { ...mod, search_url };
}

function tabletView(tablet: Tablet, league: string): StrategyView["tablets"][number] {
  return { ...tablet, mods: tablet.mods.map((mod) => modView(mod, league, tablet.type, tablet.unique)) };
}

function conversionView(conversion: Conversion, markets: Markets, nowMs: number): ConversionView {
  const legs = (list: Conversion["inputs"]) => list.map((leg) => ({ ref: pricedRef(leg.ref, markets, nowMs), qty: leg.qty }));
  const inputs = legs(conversion.inputs);
  const outputs = legs(conversion.outputs);
  const priced = (list: typeof inputs) => list.map((leg) => ({ name: leg.ref.name, qty: leg.qty, div: leg.ref.price?.div ?? null }));
  return { ...conversion, inputs, outputs, ev: conversionEv(priced(inputs), priced(outputs)) };
}

function legView(leg: TradeLeg, markets: Markets, nowMs: number): TradeLegView {
  return { ...leg, ref: leg.ref ? pricedRef(leg.ref, markets, nowMs) : null };
}

/** The weighted 7-day move of a set of yields (deduplicated by entity id); null when none is priced with a trend. */
export function yieldsTrend(yields: readonly StrategyYield[], markets: Markets): Trend | null {
  const unique = [...new Map(yields.map((y) => [y.ref.id, y])).values()];
  const items = unique.flatMap((y) => {
    const market = marketOf(y.ref, markets);
    return market ? [market] : [];
  });
  const trend = basketTrend(items);
  return trend && { change7d: trend.change7d, counted: trend.counted, total: unique.length };
}

function farmView(strategy: FarmStrategy, league: string, markets: Markets, nowMs: number): StrategyView {
  return {
    ...strategy,
    yields: strategy.yields.map((entry) => yieldView(entry, markets, nowMs)),
    tablets: strategy.tablets.map((tablet) => tabletView(tablet, league)),
    trend: yieldsTrend(strategy.yields, markets),
  };
}

function strategyView(strategy: Strategy, league: string, markets: Markets, nowMs: number): AnyStrategyView {
  const conversions = (list: readonly Conversion[]) => list.map((c) => conversionView(c, markets, nowMs));
  switch (strategy.kind) {
    case "farm":
      return farmView(strategy, league, markets, nowMs);
    case "roll_and_sell":
      return {
        ...strategy,
        target_mods: strategy.target_mods.map((mod) => modView(mod, league, strategy.target.base, null)),
        roll_steps: strategy.roll_steps.map((step) => ({ ...step, currencies: step.currencies.map((ref) => pricedRef(ref, markets, nowMs)) })),
        sell_ref: strategy.sell_ref ? pricedRef(strategy.sell_ref, markets, nowMs) : null,
        price_refs: conversions(strategy.price_refs),
      };
    case "trade":
      return {
        ...strategy,
        inputs: strategy.inputs.map((leg) => legView(leg, markets, nowMs)),
        outputs: strategy.outputs.map((leg) => legView(leg, markets, nowMs)),
        price_refs: conversions(strategy.price_refs),
      };
  }
}

/** Every strategy priced against `markets` (keyed by exchange id) and linked into `league`'s trade site. */
export function buildStrategyViews(strategies: readonly Strategy[], league: string, markets: Markets, nowMs: number): AnyStrategyView[] {
  return strategies.map((strategy) => strategyView(strategy, league, markets, nowMs));
}

/** One chip per mechanic a farm strategy covers (schema order): the trend over all its farms' drops. */
export function mechanicTrends(strategies: readonly Strategy[], markets: Markets): MechanicTrend[] {
  const farms = strategiesOfKind(strategies, "farm");
  return MECHANICS.flatMap((mechanic) => {
    const covering = farms.filter((s) => s.mechanics.includes(mechanic));
    if (covering.length === 0) return [];
    return [{ mechanic, trend: yieldsTrend(covering.flatMap((s) => s.yields), markets) }];
  });
}

/** The league's latest exchange rows for every ref that trades on the exchange. */
function loadMarkets(league: string, strategies: readonly Strategy[]): Map<string, YieldMarket> {
  const ids = [...new Set(strategies.flatMap((s) => strategyRefs(s).map((ref) => catalogRow(ref).exchange_id)).filter((id): id is string => id !== null))];
  const markets = new Map<string, YieldMarket>();
  for (const row of latestChangeRowsFor(league, ids)) {
    // a non-positive value is not a price: the item stays unpriced rather than showing 0
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
