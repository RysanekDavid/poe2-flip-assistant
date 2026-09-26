import type { PricedItem } from "../api/types";
import { CX_CURRENCY_IDS } from "../api/cxClient";
import { config } from "../config/env";
import { recommendOffsets, type Currency, type ExchangeRates } from "./priceEngine";
import { denominateIn, pickUnit, type Denom } from "./treasury";
import type { EdgeKind } from "./cx/cxMarketModel";
import type { CxItemStats } from "./cx/cxPersistence";

/**
 * The MARKET side of a flip row: what the exchange itself says a flip of this item is worth.
 *
 *  - `cx`        observed on GGG's hourly exchange history: net edge after the gold fees we can
 *                price, persistence across hours, and the slower leg's real flow.
 *  - `estimated` no exchange market for the item — the old volume-lookup heuristic
 *                (recommendOffsets), kept only as a labelled fallback. It is NOT a detected edge.
 *
 * Units: `ninja volume` (PricedItem.volume = poe.ninja volumePrimaryValue) is DIVINE traded PER
 * HOUR, not item units. Checked against GGG's own hourly digest for Standard: ninja Chaos 1405 vs
 * cx Chaos/Div 2959 Div/h, ninja Exalted 27.8 vs cx 43 Div/h — same order, a daily figure would
 * be ~24× larger. Units/hour is therefore volume ÷ price.
 */

export type MarketSource = "cx" | "estimated";
export type LiquidityTier = "safe" | "risky" | "thin";

export interface MarketEstimate {
  source: MarketSource;
  buyDivine: number;
  sellDivine: number;
  buyDisp: Denom;
  sellDisp: Denom;
  /** Net edge % (cx) or the heuristic target margin % (estimated). */
  edgePct: number;
  /** Profit per unit in Div, net of priced fees (cx) or of nothing (estimated). */
  netDivPerUnit: number;
  /** Item units per hour the slower leg moves. */
  unitsPerHour: number;
  /** Div per hour the slower leg moves. */
  turnoverDivPerHour: number;
  cx: CxItemStats | null;
}

const QUOTE_CCY: Readonly<Record<string, Currency>> = {
  [CX_CURRENCY_IDS.divine]: "DIVINE",
  [CX_CURRENCY_IDS.exalted]: "EXALT",
  [CX_CURRENCY_IDS.chaos]: "CHAOS",
};

function quoteCurrency(baseId: string): Currency {
  const ccy = QUOTE_CCY[baseId];
  if (ccy == null) throw new Error(`cx quote ${baseId} is not Divine/Exalted/Chaos`);
  return ccy;
}

function recoEstimate(p: PricedItem, rates: ExchangeRates): MarketEstimate {
  const reco = recommendOffsets(p.volume);
  const buyDivine = p.baseValue * reco.buyDiscount;
  const sellDivine = p.baseValue * reco.sellBonus;
  // one currency for both legs (picked off the mid) so buy/sell read in the same unit
  const unit = pickUnit(p.baseValue, rates);
  return {
    source: "estimated",
    buyDivine,
    sellDivine,
    buyDisp: denominateIn(buyDivine, unit, rates),
    sellDisp: denominateIn(sellDivine, unit, rates),
    edgePct: reco.marginPct,
    netDivPerUnit: sellDivine - buyDivine,
    unitsPerHour: p.baseValue > 0 ? p.volume / p.baseValue : 0,
    turnoverDivPerHour: p.volume,
    cx: null,
  };
}

function cxEstimate(cx: CxItemStats): MarketEstimate {
  return {
    source: "cx",
    buyDivine: cx.buy.priceDiv,
    sellDivine: cx.sell.priceDiv,
    // Shown in the currency each leg actually trades in — that IS the flip instruction.
    buyDisp: { amount: cx.buy.priceQuote, unit: quoteCurrency(cx.buy.quote) },
    sellDisp: { amount: cx.sell.priceQuote, unit: quoteCurrency(cx.sell.quote) },
    edgePct: cx.edgePct,
    netDivPerUnit: cx.netDivPerUnit,
    unitsPerHour: cx.slowerUnitsPerHour,
    turnoverDivPerHour: cx.slowerUnitsPerHour * cx.midDiv,
    cx,
  };
}

/** Observed exchange data when the item has it, the labelled heuristic otherwise. */
export function marketEstimate(p: PricedItem, rates: ExchangeRates, cx: CxItemStats | null): MarketEstimate {
  return cx != null ? cxEstimate(cx) : recoEstimate(p, rates);
}

export function liquidityTier(turnoverDivPerHour: number): LiquidityTier {
  if (turnoverDivPerHour >= config.cx.liquiditySafeDivH) return "safe";
  if (turnoverDivPerHour >= config.cx.liquidityRiskyDivH) return "risky";
  return "thin";
}

/** Units per hour you can expect to fill: your assumed share of the slower leg's flow. */
function fillUnitsPerHour(unitsPerHour: number): number {
  return unitsPerHour * (config.cx.flowSharePct / 100);
}

/**
 * Div/day = (profit per unit, Div) × (units you can fill per day). Both factors carry their
 * units explicitly — the old formula multiplied Div/unit by ninja's Div-denominated volume.
 */
export function throughputDivDay(profitDivPerUnit: number, unitsPerHour: number): number {
  return Math.max(profitDivPerUnit, 0) * fillUnitsPerHour(unitsPerHour) * 24;
}

export interface TimeToSellHint {
  sizeUnits: number;
  hours: number;
}

/** Hours to clear a config.cx.hintPositionDiv position at the assumed flow share, or null. */
export function timeToSellHint(priceDiv: number, unitsPerHour: number): TimeToSellHint | null {
  const fill = fillUnitsPerHour(unitsPerHour);
  if (!(priceDiv > 0) || !(fill > 0)) return null;
  const sizeUnits = Math.max(1, Math.round(config.cx.hintPositionDiv / priceDiv));
  return { sizeUnits, hours: sizeUnits / fill };
}

export interface CxRowFields {
  edgeKind: EdgeKind | null;
  edgeLatestPct: number | null;
  edgeMedian24Pct: number | null;
  band: { lowDiv: number; highDiv: number } | null;
  persistence6: number | null;
  persistence24: number | null;
  feeGold: number | null;
  feeDiv: number | null;
  feeComplete: boolean;
}

/** The observed-market detail a row carries — all null on an estimated row. */
export function cxRowFields(cx: CxItemStats | null): CxRowFields {
  if (cx == null) {
    return {
      edgeKind: null,
      edgeLatestPct: null,
      edgeMedian24Pct: null,
      band: null,
      persistence6: null,
      persistence24: null,
      feeGold: null,
      feeDiv: null,
      feeComplete: false,
    };
  }
  return {
    edgeKind: cx.kind,
    edgeLatestPct: cx.edgeLatestPct,
    edgeMedian24Pct: cx.edgeMedian24Pct,
    band: cx.bandDiv == null ? null : { lowDiv: cx.bandDiv.low, highDiv: cx.bandDiv.high },
    persistence6: cx.persistence6,
    persistence24: cx.persistence24,
    feeGold: cx.feeGoldPerUnit,
    feeDiv: cx.feeDivPerUnit,
    feeComplete: cx.feeComplete,
  };
}
