import type { PricedItem } from "../api/types";
import { CX_CURRENCY_IDS } from "../api/cxClient";
import { config } from "../config/env";
import { recommendOffsets, type Currency, type ExchangeRates } from "./priceEngine";
import { denominateIn, pickUnit, type Denom } from "./treasury";
import type { EdgeIssue, EdgeKind } from "./cx/cxEdges";
import type { CxEdgeStats, CxItemStats } from "./cx/cxPersistence";

/**
 * The MARKET side of a flip row: what the exchange itself says a flip of this item is worth.
 *
 *  - `cx`        a guarded edge observed on GGG's hourly exchange history: net of the gold fees
 *                we can price, persistence across hours, the slower leg's real flow.
 *  - `estimated` no computable observed edge — either no exchange market at all, or one whose
 *                edge failed a guard (`cxIssue` says which). Legs and margin come from the old
 *                volume heuristic (recommendOffsets) and are labelled as such.
 *
 * Flow units: GGG's digest counts item units per hour, so `flowObserved` flow is exact. poe.ninja
 * `volumePrimaryValue` is NOT an established unit — it looks Divine-denominated and hourly-ish
 * (Standard: ninja Chaos 1405 vs the digest's Chaos/Div 2959 Div/h on a different day), so
 * anything derived from it is marked unit-uncertain rather than asserted.
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
  /** Item units per hour the relevant leg moves. */
  unitsPerHour: number;
  /** Div per hour the relevant leg moves. */
  turnoverDivPerHour: number;
  /** True when the flow comes from GGG's digest; false = ninja volume, unit unverified. */
  flowObserved: boolean;
  /** The item's stored exchange market, even when it yielded no edge. */
  cx: CxItemStats | null;
  edge: CxEdgeStats | null;
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

function recoEstimate(p: PricedItem, rates: ExchangeRates, cx: CxItemStats | null): MarketEstimate {
  const reco = recommendOffsets(p.volume);
  const buyDivine = p.baseValue * reco.buyDiscount;
  const sellDivine = p.baseValue * reco.sellBonus;
  // one currency for both legs (picked off the mid) so buy/sell read in the same unit
  const unit = pickUnit(p.baseValue, rates);
  const ninjaUnits = p.baseValue > 0 ? p.volume / p.baseValue : 0;
  return {
    source: "estimated",
    buyDivine,
    sellDivine,
    buyDisp: denominateIn(buyDivine, unit, rates),
    sellDisp: denominateIn(sellDivine, unit, rates),
    edgePct: reco.marginPct,
    netDivPerUnit: sellDivine - buyDivine,
    // An observed market without an edge still has observed flow — prefer it to ninja's.
    unitsPerHour: cx != null ? cx.marketUnitsPerHour : ninjaUnits,
    turnoverDivPerHour: cx != null ? cx.marketUnitsPerHour * cx.midDiv : p.volume,
    flowObserved: cx != null,
    cx,
    edge: null,
  };
}

function cxEstimate(cx: CxItemStats, edge: CxEdgeStats): MarketEstimate {
  return {
    source: "cx",
    buyDivine: edge.buy.priceDiv,
    sellDivine: edge.sell.priceDiv,
    // Shown in the currency each leg actually trades in — that IS the flip instruction.
    buyDisp: { amount: edge.buy.priceQuote, unit: quoteCurrency(edge.buy.quote) },
    sellDisp: { amount: edge.sell.priceQuote, unit: quoteCurrency(edge.sell.quote) },
    edgePct: edge.edgePct,
    netDivPerUnit: edge.netDivPerUnit,
    unitsPerHour: edge.slowerUnitsPerHour,
    turnoverDivPerHour: edge.slowerUnitsPerHour * cx.midDiv,
    flowObserved: true,
    cx,
    edge,
  };
}

/** A guarded observed edge when the item has one, the labelled heuristic otherwise. */
export function marketEstimate(p: PricedItem, rates: ExchangeRates, cx: CxItemStats | null): MarketEstimate {
  return cx?.edge != null ? cxEstimate(cx, cx.edge) : recoEstimate(p, rates, cx);
}

export function liquidityTier(turnoverDivPerHour: number): LiquidityTier {
  if (turnoverDivPerHour >= config.cx.liquiditySafeDivH) return "safe";
  if (turnoverDivPerHour >= config.cx.liquidityRiskyDivH) return "risky";
  return "thin";
}

/** Units per hour you can expect to fill: your assumed share of the leg's flow. */
function fillUnitsPerHour(unitsPerHour: number): number {
  return unitsPerHour * (config.cx.flowSharePct / 100);
}

/**
 * Div/day = (profit per unit, Div) × (units you can fill per day). Both factors carry their
 * units explicitly — the old formula multiplied Div/unit by ninja's volume figure.
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
  /** Hour's ratio extremes in Div — display only, NOT fills. */
  band: { lowDiv: number; highDiv: number } | null;
  persistence6: number | null;
  persistence24: number | null;
  feeGold: number | null;
  feeDiv: number | null;
  feeComplete: boolean;
  /** Unix hour (end boundary) of the digest the shown buy/sell legs come from. */
  legsHour: number | null;
  /** Why an item WITH an exchange market has no computable edge. */
  cxIssue: EdgeIssue | null;
  /** The rejected edge's net %, for the tooltip only. */
  cxRawNetPct: number | null;
  flowObserved: boolean;
}

/** The observed-market detail a row carries — nulls where the exchange has nothing to say. */
export function cxRowFields(market: MarketEstimate): CxRowFields {
  const { cx, edge } = market;
  return {
    edgeKind: edge?.kind ?? null,
    edgeLatestPct: edge?.edgeLatestPct ?? null,
    edgeMedian24Pct: edge?.edgeMedian24Pct ?? null,
    band: cx?.bandDiv == null ? null : { lowDiv: cx.bandDiv.low, highDiv: cx.bandDiv.high },
    persistence6: edge?.persistence6 ?? null,
    persistence24: edge?.persistence24 ?? null,
    feeGold: edge?.feeGoldPerUnit ?? null,
    feeDiv: edge?.feeDivPerUnit ?? null,
    feeComplete: edge?.feeComplete ?? false,
    legsHour: edge?.legsHour ?? null,
    cxIssue: cx?.issue ?? null,
    cxRawNetPct: cx?.rawNetPct ?? null,
    flowObserved: market.flowObserved,
  };
}
