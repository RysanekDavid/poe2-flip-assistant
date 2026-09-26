import type { PricedItem } from "../api/types";
import { divineToExalt, divineToChaos, toDivine, divineTo, type ExchangeRates, type Currency } from "./priceEngine";
import { denominateIn, pickUnit, type Denom } from "./treasury";
import { oscillationScore } from "./trendDetector";
import type { CxItemStats } from "./cx/cxPersistence";
import {
  cxRowFields,
  liquidityTier,
  marketEstimate,
  throughputDivDay,
  timeToSellHint,
  type CxRowFields,
  type LiquidityTier,
  type MarketEstimate,
  type MarketSource,
  type TimeToSellHint,
} from "./flipMarket";

export type FlipMode = "REAL" | "RECO";

/** 24h % change from ninja's 7d sparkline (cumulative % offsets vs the 7d-ago baseline):
 *  compare the last point against the one ~1/7th from the end. */
export function change24hFromSpark(spark: number[] | null | undefined): number | null {
  if (!spark || spark.length < 3) return null;
  const lastIdx = spark.length - 1;
  const prevIdx = Math.floor(lastIdx * (6 / 7));
  if (prevIdx >= lastIdx) return null;
  const prev = 1 + spark[prevIdx]! / 100;
  const last = 1 + spark[lastIdx]! / 100;
  return prev > 0 ? (last / prev - 1) * 100 : null;
}

/** Cap payload size: a row sparkline needs a shape, not ninja's full-resolution series. */
const SPARK_POINTS = 24;
function downsampleSpark(spark: number[] | null): number[] | null {
  if (!spark || spark.length < 2) return null;
  if (spark.length <= SPARK_POINTS) return spark;
  const step = (spark.length - 1) / (SPARK_POINTS - 1);
  return Array.from({ length: SPARK_POINTS }, (_, i) => spark[Math.round(i * step)]!);
}

/** A manual observed price: an amount in a chosen currency. */
export interface ManualPrice {
  amount: number;
  ccy: Currency;
}

export interface FlipRow extends CxRowFields {
  itemId: string;
  item: string;
  category: string;
  icon: string | null;
  midDivine: number;
  volume: number; // poe.ninja volumePrimaryValue: Div traded per hour
  change7d: number | null;
  change24h: number | null; // derived from the tail of ninja's 7d sparkline
  spark: number[] | null; // downsampled 7d sparkline (cumulative %) for row sparklines
  buyExalt: number; // Ex representation (sorting / alert text)
  sellChaos: number;
  marginPct: number;
  mode: FlipMode;
  profitChaos: number; // profit per single flip, in Chaos
  profitDiv: number; // profit per single flip, in Divine (canonical)
  throughputDivDay: number; // profit/unit × units you can fill per day (flow share of the slower leg)
  flipScore: number; // profitChaos × volume — raw, for reference
  oscScore: number; // 7d wiggle beyond drift — high = repeats well
  worthScore: number; // 0–100: margin + liquidity + oscillation, × persistence/estimate confidence − risk
  marketMarginPct: number;
  /** Where the market numbers come from: GGG's exchange history, or the labelled heuristic. */
  source: MarketSource;
  /** Market edge %: net of priced gold fees, 6h median (cx) — or the heuristic target (estimated). */
  edgePct: number;
  liquidityTier: LiquidityTier;
  /** Div per hour the slower leg moves. */
  slowerLegDivPerHour: number;
  timeToSellHint: TimeToSellHint | null;
  // display, in the trade currencies (REAL = your chosen units; market = the legs' own currencies)
  buyDisp: Denom;
  sellDisp: Denom;
  marketBuyDisp: Denom;
  marketSellDisp: Denom;
  // REAL only: your observed mid vs ninja mid (%). Negative = live below ninja → likely reverts up.
  liveVsNinjaPct: number | null;
  risk: "PUMP" | "DECLINE" | null;
  stable: boolean;
}

/** Estimated rows rank below observed ones at equal inputs: their margin is a guess. */
const ESTIMATED_PENALTY = 0.5;

interface TradeLegs {
  mode: FlipMode;
  buyDivine: number;
  sellDivine: number;
  marginPct: number;
  buyDisp: Denom;
  sellDisp: Denom;
}

/** REAL mode = your observed Ange prices; otherwise the market estimate IS the trade. */
function tradeLegs(
  market: MarketEstimate,
  rates: ExchangeRates,
  manualBuy: ManualPrice | null,
  manualSell: ManualPrice | null,
): TradeLegs {
  if (manualBuy == null || manualSell == null) {
    const { buyDivine, sellDivine, buyDisp, sellDisp } = market;
    return { mode: "RECO", buyDivine, sellDivine, marginPct: market.edgePct, buyDisp, sellDisp };
  }
  const buyDivine = toDivine(manualBuy.amount, manualBuy.ccy, rates);
  const sellDivine = toDivine(manualSell.amount, manualSell.ccy, rates);
  return {
    mode: "REAL",
    buyDivine,
    sellDivine,
    marginPct: buyDivine > 0 ? ((sellDivine - buyDivine) / buyDivine) * 100 : 0,
    buyDisp: { amount: manualBuy.amount, unit: manualBuy.ccy },
    sellDisp: { amount: manualSell.amount, unit: manualSell.ccy },
  };
}

/** Market legs in the trade currencies: mirror your REAL units, else the market's own legs. */
function marketDisplay(market: MarketEstimate, legs: TradeLegs, p: PricedItem, rates: ExchangeRates): [Denom, Denom] {
  if (legs.mode === "REAL") {
    return [
      { amount: divineTo(market.buyDivine, legs.buyDisp.unit, rates), unit: legs.buyDisp.unit },
      { amount: divineTo(market.sellDivine, legs.sellDisp.unit, rates), unit: legs.sellDisp.unit },
    ];
  }
  if (market.source === "cx") return [market.buyDisp, market.sellDisp];
  const unit = pickUnit(p.baseValue, rates);
  return [denominateIn(market.buyDivine, unit, rates), denominateIn(market.sellDivine, unit, rates)];
}

/**
 * 0–100 "worth": margin × liquidity × repeatability, scaled by how many recent hours the edge
 * actually held (cx) or by the estimate penalty, and discounted for hold-risk.
 */
function worthScore(legs: TradeLegs, market: MarketEstimate, osc: number, risky: boolean): number {
  // An estimated margin is a lookup on volume, not an observation — scoring it would just count
  // liquidity twice (the audit's "Score ≈ volume rank"), so it contributes nothing.
  const observed = legs.mode === "REAL" || market.source === "cx";
  const marginN = observed ? Math.min(Math.max(legs.marginPct, 0) / 20, 1) : 0;
  const liqN = Math.min(Math.log10(market.turnoverDivPerHour + 1) / Math.log10(50000), 1);
  const oscN = Math.min(osc / 100, 1);
  return Math.round(100 * (0.45 * marginN + 0.4 * liqN + 0.15 * oscN) * confidence(legs, market) * (risky ? 0.75 : 1));
}

/** How much the margin can be trusted: your own prices fully, observed edges by persistence. */
function confidence(legs: TradeLegs, market: MarketEstimate): number {
  if (legs.mode === "REAL") return 1;
  // Floor 0.25: a one-hour spike keeps a quarter of its score, never zero — it may be the start
  // of a real window, it just must not outrank edges that have held for hours.
  if (market.cx != null) return 0.25 + 0.75 * (market.cx.persistence6 / 6);
  return ESTIMATED_PENALTY;
}

function riskOf(c7: number | null): "PUMP" | "DECLINE" | null {
  return c7 == null ? null : c7 > 100 ? "PUMP" : c7 < -20 ? "DECLINE" : null;
}

/**
 * Single source of truth for flip math. Discovery and watchlist both go through here so numbers
 * never diverge.
 *
 * REAL mode (both manual prices given): true spread from observed prices. Otherwise the market
 * estimate: GGG's exchange history when `cx` is given for this item, the labelled volume
 * heuristic when it is not.
 */
export function scoreItem(
  p: PricedItem,
  rates: ExchangeRates,
  manualBuy: ManualPrice | null = null,
  manualSell: ManualPrice | null = null,
  cx: CxItemStats | null = null,
): FlipRow {
  const market = marketEstimate(p, rates, cx);
  const legs = tradeLegs(market, rates, manualBuy, manualSell);
  const [marketBuyDisp, marketSellDisp] = marketDisplay(market, legs, p, rates);
  const profitDiv = legs.mode === "REAL" ? legs.sellDivine - legs.buyDivine : market.netDivPerUnit;
  const profitChaos = divineToChaos(profitDiv, rates);
  const risk = riskOf(p.change7d);
  const osc = oscillationScore(p.spark7d);
  return {
    ...cxRowFields(cx),
    itemId: p.itemId,
    item: p.itemName,
    category: p.category,
    icon: p.icon,
    midDivine: p.baseValue,
    volume: p.volume,
    change7d: p.change7d,
    change24h: change24hFromSpark(p.spark7d),
    spark: downsampleSpark(p.spark7d),
    buyExalt: divineToExalt(legs.buyDivine, rates),
    sellChaos: divineToChaos(legs.sellDivine, rates),
    marginPct: legs.marginPct,
    mode: legs.mode,
    profitChaos,
    profitDiv,
    throughputDivDay: throughputDivDay(profitDiv, market.unitsPerHour),
    flipScore: profitChaos * p.volume,
    oscScore: osc,
    worthScore: worthScore(legs, market, osc, risk != null),
    marketMarginPct: market.edgePct,
    source: market.source,
    edgePct: market.edgePct,
    liquidityTier: liquidityTier(market.turnoverDivPerHour),
    slowerLegDivPerHour: market.turnoverDivPerHour,
    timeToSellHint: timeToSellHint(legs.sellDivine, market.unitsPerHour),
    buyDisp: legs.buyDisp,
    sellDisp: legs.sellDisp,
    marketBuyDisp,
    marketSellDisp,
    liveVsNinjaPct: liveVsNinja(legs, p.baseValue),
    risk,
    stable: p.change7d != null && Math.abs(p.change7d) < 30,
  };
}

function liveVsNinja(legs: TradeLegs, mid: number): number | null {
  return legs.mode === "REAL" && mid > 0 ? ((legs.buyDivine + legs.sellDivine) / 2 / mid - 1) * 100 : null;
}
