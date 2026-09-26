import type { CxMarketRow } from "../../db/cxMarketQueries";
import { goldToDivine, sumLegFees } from "./cxFees";
import {
  baseMarkets,
  hourRates,
  quotesByItem,
  type HourRates,
  type LegIssue,
  type ModelParams,
  type QuoteObs,
} from "./cxMarketModel";

/**
 * The best honest flip one hour supports for one item, or the reason there is none. Pure.
 *
 * An edge is only reported when it survives every guard: both legs quotable (liquid enough and
 * on a fine enough ratio grid), the gross edge wider than the two legs' grid steps combined (so
 * it is not quantisation), a priceable fee on anything cheaper than an Exalt, and a net edge
 * below the plausibility cap. Everything else is an explicit `issue`, never a number.
 */

export type EdgeKind = "cross" | "band";
export type EdgeIssue = LegIssue | "single-market" | "fee-unknown" | "implausible";

export interface LegPrice {
  quote: string;
  priceQuote: number;
  priceDiv: number;
}

export interface HourEdge {
  kind: EdgeKind;
  buy: LegPrice;
  sell: LegPrice;
  grossPct: number;
  netPct: number;
  netDivPerUnit: number;
  feeGoldPerUnit: number;
  feeDivPerUnit: number | null;
  feeComplete: boolean;
  /** Item units/hour on the slower leg — the liquidity cap. */
  slowerUnits: number;
}

export interface ItemHour {
  hour: number;
  /** Most-liquid quote's VWAP in Div, and its ratio extremes in Div (display only). */
  midDiv: number;
  bandDiv: { low: number; high: number } | null;
  /** Item units/hour through the most liquid quote. */
  marketUnits: number;
  edge: HourEdge | null;
  /** Why `edge` is null. */
  issue: EdgeIssue | null;
  /** Net % of the best rejected candidate — shown in a tooltip, never ranked. */
  rawNetPct: number | null;
}

interface Legs {
  kind: EdgeKind;
  buy: LegPrice;
  sell: LegPrice;
  /** Combined grid step (%) of the two legs — the edge must be wider than this. */
  gridPct: number;
  slowerUnits: number;
}

const legPrice = (q: QuoteObs, priceQuote: number = q.priceQuote): LegPrice => ({
  quote: q.quote,
  priceQuote,
  priceDiv: priceQuote * (q.priceDiv / q.priceQuote),
});

/** Buy where the item is cheapest in Div, sell where it is dearest — needs two quotable legs. */
function crossLegs(viable: readonly QuoteObs[]): Legs | null {
  if (viable.length < 2) return null;
  const sorted = [...viable].sort((x, y) => x.priceDiv - y.priceDiv);
  const buy = sorted[0]!;
  const sell = sorted[sorted.length - 1]!;
  return {
    kind: "cross",
    buy: legPrice(buy),
    sell: legPrice(sell),
    gridPct: buy.gridStepPct + sell.gridStepPct,
    slowerUnits: Math.min(buy.units, sell.units),
  };
}

/**
 * Market-making inside one market (only when config.cx.bandEdges): resting orders at HALF the
 * tighter side of the ratio extremes, symmetric around the VWAP.
 */
function bandLegs(q: QuoteObs): Legs | null {
  if (q.lowQuote == null || q.highQuote == null) return null;
  const tighter = Math.min(q.highQuote / q.priceQuote - 1, 1 - q.lowQuote / q.priceQuote);
  const d = Math.max(0, tighter * 0.5);
  return {
    kind: "band",
    buy: legPrice(q, q.priceQuote * (1 - d)),
    sell: legPrice(q, q.priceQuote * (1 + d)),
    gridPct: 2 * q.gridStepPct,
    slowerUnits: q.units,
  };
}

function priceLegs(item: string, legs: Legs, rates: HourRates, p: ModelParams): HourEdge {
  // Buying requests the item itself; selling requests the sell-side currency.
  const fees = sumLegFees([
    { baseId: item, units: 1 },
    { baseId: legs.sell.quote, units: legs.sell.priceQuote },
  ]);
  const feeDiv = goldToDivine(fees.knownGold, rates.exaltPerDivine, p.goldPerExalt);
  const netDivPerUnit = legs.sell.priceDiv - legs.buy.priceDiv - (feeDiv ?? 0);
  return {
    kind: legs.kind,
    buy: legs.buy,
    sell: legs.sell,
    grossPct: (legs.sell.priceDiv / legs.buy.priceDiv - 1) * 100,
    netPct: (netDivPerUnit / legs.buy.priceDiv) * 100,
    netDivPerUnit,
    feeGoldPerUnit: fees.knownGold,
    feeDivPerUnit: feeDiv,
    // An unpriceable gold amount is as unknown as an unlisted item fee.
    feeComplete: fees.complete && (feeDiv != null || fees.knownGold === 0),
    slowerUnits: legs.slowerUnits,
  };
}

/** Sub-Exalt items: an unknown per-item gold fee is comparable to the item itself. */
function isSubExalt(priceDiv: number, rates: HourRates): boolean {
  return rates.exaltPerDivine == null || priceDiv * rates.exaltPerDivine < 1;
}

function edgeIssue(edge: HourEdge, legs: Legs, rates: HourRates, p: ModelParams): EdgeIssue | null {
  if (edge.grossPct <= legs.gridPct) return "coarse";
  if (!edge.feeComplete && isSubExalt(edge.buy.priceDiv, rates)) return "fee-unknown";
  if (edge.netPct > p.maxPlausibleEdgePct) return "implausible";
  return null;
}

/** Why no candidate could even be formed from these quotes. */
function quoteIssue(quotes: readonly QuoteObs[]): EdgeIssue {
  if (quotes.length < 2) return "single-market";
  return quotes.some((q) => q.issue === "thin") ? "thin" : "coarse";
}

/** The hour's best guarded edge for one item, or the reason there is none. */
export function itemHour(item: string, hour: number, quotes: readonly QuoteObs[], rates: HourRates, p: ModelParams): ItemHour | null {
  if (quotes.length === 0) return null;
  const liquid = [...quotes].sort((x, y) => y.units - x.units)[0]!;
  const perDiv = liquid.priceDiv / liquid.priceQuote;
  const base = {
    hour,
    midDiv: liquid.priceDiv,
    bandDiv: liquid.lowQuote != null && liquid.highQuote != null ? { low: liquid.lowQuote * perDiv, high: liquid.highQuote * perDiv } : null,
    marketUnits: liquid.units,
  };
  const viable = quotes.filter((q) => q.issue == null);
  const candidates = [crossLegs(viable), p.bandEdges && liquid.issue == null ? bandLegs(liquid) : null].filter(
    (l): l is Legs => l != null,
  );
  if (candidates.length === 0) return { ...base, edge: null, issue: quoteIssue(quotes), rawNetPct: null };

  const judged = candidates.map((legs) => {
    const edge = priceLegs(item, legs, rates, p);
    return { edge, issue: edgeIssue(edge, legs, rates, p) };
  });
  const byNet = (x: { edge: HourEdge }, y: { edge: HourEdge }): number => y.edge.netPct - x.edge.netPct;
  const valid = judged.filter((j) => j.issue == null).sort(byNet)[0];
  if (valid != null) return { ...base, edge: valid.edge, issue: null, rawNetPct: null };
  const rejected = [...judged].sort(byNet)[0]!;
  return { ...base, edge: null, issue: rejected.issue, rawNetPct: rejected.edge.netPct };
}

/** Every item's guarded edge (or reason) for one hour's markets. */
export function hourEdges(hour: number, rows: readonly CxMarketRow[], p: ModelParams): Map<string, ItemHour> {
  const rates = hourRates(baseMarkets(rows));
  const out = new Map<string, ItemHour>();
  for (const [item, quotes] of quotesByItem(rows, rates, p)) {
    const h = itemHour(item, hour, quotes, rates, p);
    if (h != null) out.set(item, h);
  }
  return out;
}
