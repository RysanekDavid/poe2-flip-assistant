import type { PricedItem } from "../api/types";
import {
  recommendOffsets,
  divineToExalt,
  divineToChaos,
  toDivine,
  divineTo,
  type ExchangeRates,
  type Currency,
} from "./priceEngine";
import { denominateIn, pickUnit, type Denom } from "./treasury";
import { oscillationScore } from "./trendDetector";

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

export interface FlipRow {
  itemId: string;
  item: string;
  category: string;
  icon: string | null;
  midDivine: number;
  volume: number;
  change7d: number | null;
  change24h: number | null; // derived from the tail of ninja's 7d sparkline
  spark: number[] | null; // downsampled 7d sparkline (cumulative %) for row sparklines
  buyExalt: number; // Ex representation (sorting / alert text)
  sellChaos: number;
  marginPct: number;
  mode: FlipMode;
  profitChaos: number; // profit per single flip, in Chaos
  profitDiv: number; // profit per single flip, in Divine (canonical)
  throughputDivDay: number; // profitDiv × daily volume — UPPER BOUND Div/day if you moved all flow
  flipScore: number; // profitChaos × volume — raw, for reference
  oscScore: number; // 7d wiggle beyond drift — high = repeats well
  worthScore: number; // 0–100 composite: margin + liquidity + oscillation − risk
  marketMarginPct: number;
  // display, in the trade currencies (REAL = your chosen units; RECO = auto-denominated)
  buyDisp: Denom;
  sellDisp: Denom;
  marketBuyDisp: Denom;
  marketSellDisp: Denom;
  // REAL only: your observed mid vs ninja mid (%). Negative = live below ninja → likely reverts up.
  liveVsNinjaPct: number | null;
  risk: "PUMP" | "DECLINE" | null;
  stable: boolean;
}

/**
 * Single source of truth for flip math. Discovery and watchlist both go through
 * here so numbers never diverge.
 *
 * REAL mode (both manual prices given): true spread from observed prices, in
 * whatever currencies you entered. RECO mode: volume-adaptive recommendation.
 */
export function scoreItem(
  p: PricedItem,
  rates: ExchangeRates,
  manualBuy: ManualPrice | null = null,
  manualSell: ManualPrice | null = null,
): FlipRow {
  const hasManual = manualBuy != null && manualSell != null;
  const buyCcy: Currency = manualBuy?.ccy ?? "EXALT";
  const sellCcy: Currency = manualSell?.ccy ?? "CHAOS";

  // market estimate — always computed so REAL rows can still compare against it
  const reco = recommendOffsets(p.volume);
  const marketBuyDivine = p.baseValue * reco.buyDiscount;
  const marketSellDivine = p.baseValue * reco.sellBonus;
  const marketMarginPct = reco.marginPct;

  let buyDivine: number;
  let sellDivine: number;
  let marginPct: number;
  let profitChaos: number;
  let mode: FlipMode;
  let buyDisp: Denom;
  let sellDisp: Denom;

  if (hasManual) {
    mode = "REAL";
    buyDivine = toDivine(manualBuy.amount, buyCcy, rates);
    sellDivine = toDivine(manualSell.amount, sellCcy, rates);
    marginPct = buyDivine > 0 ? ((sellDivine - buyDivine) / buyDivine) * 100 : 0;
    profitChaos = divineToChaos(sellDivine - buyDivine, rates);
    buyDisp = { amount: manualBuy.amount, unit: buyCcy };
    sellDisp = { amount: manualSell.amount, unit: sellCcy };
  } else {
    mode = "RECO";
    buyDivine = marketBuyDivine;
    sellDivine = marketSellDivine;
    marginPct = marketMarginPct;
    profitChaos = divineToChaos(p.baseValue * 2 * reco.offset, rates);
    // one currency for both legs (picked off the mid) so buy/sell read in the same unit
    const unit = pickUnit(p.baseValue, rates);
    buyDisp = denominateIn(buyDivine, unit, rates);
    sellDisp = denominateIn(sellDivine, unit, rates);
  }

  // market estimate shown in the trade currencies: mirror your REAL units, auto-denominate for RECO
  const marketUnit = pickUnit(p.baseValue, rates);
  const marketBuyDisp: Denom = hasManual
    ? { amount: divineTo(marketBuyDivine, buyCcy, rates), unit: buyCcy }
    : denominateIn(marketBuyDivine, marketUnit, rates);
  const marketSellDisp: Denom = hasManual
    ? { amount: divineTo(marketSellDivine, sellCcy, rates), unit: sellCcy }
    : denominateIn(marketSellDivine, marketUnit, rates);

  const c7 = p.change7d;
  const risk: "PUMP" | "DECLINE" | null = c7 == null ? null : c7 > 100 ? "PUMP" : c7 < -20 ? "DECLINE" : null;

  // composite "worth" 0–100: margin × liquidity × repeatability, discounted for hold-risk
  const osc = oscillationScore(p.spark7d);
  const marginN = Math.min(Math.max(marginPct, 0) / 20, 1);
  const liqN = p.volume > 0 ? Math.min(Math.log10(p.volume + 1) / Math.log10(50000), 1) : 0;
  const oscN = Math.min(osc / 100, 1);
  const riskFactor = risk ? 0.75 : 1;
  const worthScore = Math.round(100 * (0.45 * marginN + 0.4 * liqN + 0.15 * oscN) * riskFactor);

  return {
    itemId: p.itemId,
    item: p.itemName,
    category: p.category,
    icon: p.icon,
    midDivine: p.baseValue,
    volume: p.volume,
    change7d: c7,
    change24h: change24hFromSpark(p.spark7d),
    spark: downsampleSpark(p.spark7d),
    buyExalt: divineToExalt(buyDivine, rates),
    sellChaos: divineToChaos(sellDivine, rates),
    marginPct,
    mode,
    profitChaos,
    profitDiv: sellDivine - buyDivine,
    throughputDivDay: Math.max(sellDivine - buyDivine, 0) * p.volume,
    flipScore: profitChaos * p.volume,
    oscScore: osc,
    worthScore,
    marketMarginPct,
    buyDisp,
    sellDisp,
    marketBuyDisp,
    marketSellDisp,
    liveVsNinjaPct: hasManual && p.baseValue > 0 ? ((buyDivine + sellDivine) / 2 / p.baseValue - 1) * 100 : null,
    risk,
    stable: c7 != null && Math.abs(c7) < 30,
  };
}
