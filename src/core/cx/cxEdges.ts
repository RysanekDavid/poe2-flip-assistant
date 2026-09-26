import type { CxMarketRow } from "../../db/cxMarketQueries";
import { goldToDivine, sumLegFees } from "./cxFees";
import {
  baseMarkets,
  GRID_SAFETY,
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
 * Every viable (buy quote → sell quote) pair is evaluated, not just the widest one: one dumped
 * market must not hide a clean edge between the other two. A pair is valid only when it survives
 * every guard — both legs quotable (liquid enough, fine enough ratio grid), gross edge wider than
 * GRID_SAFETY × the legs' combined grid steps (so it is not quantisation), a priceable fee on
 * anything cheaper than an Exalt, and a net edge under the plausibility cap. The hour is
 * `implausible` only when no pair is valid and the best rejected one was.
 */

export type EdgeKind = "cross" | "band";
/** `sporadic` is assigned over a window (cxPersistence), never to a single hour. */
export type EdgeIssue = LegIssue | "single-market" | "fee-unknown" | "implausible" | "sporadic";

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
  /** Combined grid step (%) of the two legs. */
  gridPct: number;
  slowerUnits: number;
}

export interface Judged {
  edge: HourEdge;
  issue: EdgeIssue | null;
}

const legPrice = (q: QuoteObs, priceQuote: number = q.priceQuote): LegPrice => ({
  quote: q.quote,
  priceQuote,
  priceDiv: priceQuote * (q.priceDiv / q.priceQuote),
});

function crossLegs(buy: QuoteObs, sell: QuoteObs): Legs {
  return {
    kind: "cross",
    buy: legPrice(buy),
    sell: legPrice(sell),
    gridPct: buy.gridStepPct + sell.gridStepPct,
    slowerUnits: Math.min(buy.units, sell.units),
  };
}

/** Every ordered pair of quotable legs where the sell side is dearer in Div. */
function crossCandidates(viable: readonly QuoteObs[]): Legs[] {
  const out: Legs[] = [];
  for (const buy of viable) for (const sell of viable) if (sell.priceDiv > buy.priceDiv) out.push(crossLegs(buy, sell));
  return out;
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

function judge(item: string, legs: Legs, rates: HourRates, p: ModelParams): Judged {
  const edge = priceLegs(item, legs, rates, p);
  let issue: EdgeIssue | null = null;
  if (edge.grossPct <= GRID_SAFETY * legs.gridPct) issue = "coarse";
  else if (!edge.feeComplete && isSubExalt(edge.buy.priceDiv, rates)) issue = "fee-unknown";
  else if (edge.netPct > p.maxPlausibleEdgePct) issue = "implausible";
  return { edge, issue };
}

/** Why no candidate could even be formed from these quotes. */
function quoteIssue(quotes: readonly QuoteObs[]): EdgeIssue {
  if (quotes.length < 2) return "single-market";
  return quotes.some((q) => q.issue === "thin") ? "thin" : "coarse";
}

/**
 * One specific direction (buy in `buyQuote`, sell in `sellQuote`) judged for one hour, or null
 * when either leg did not trade or is not quotable. Same quote on both sides = the band edge.
 */
export function judgePair(
  item: string,
  buyQuote: string,
  sellQuote: string,
  quotes: readonly QuoteObs[],
  rates: HourRates,
  p: ModelParams,
): Judged | null {
  const buy = quotes.find((q) => q.quote === buyQuote && q.issue == null);
  const sell = quotes.find((q) => q.quote === sellQuote && q.issue == null);
  if (buy == null || sell == null) return null;
  const legs = buy === sell ? (p.bandEdges ? bandLegs(buy) : null) : crossLegs(buy, sell);
  return legs == null ? null : judge(item, legs, rates, p);
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
  const band = p.bandEdges && liquid.issue == null ? bandLegs(liquid) : null;
  const candidates = band == null ? crossCandidates(viable) : [...crossCandidates(viable), band];
  if (candidates.length === 0) return { ...base, edge: null, issue: quoteIssue(quotes), rawNetPct: null };

  const judged = candidates.map((legs) => judge(item, legs, rates, p));
  const byNet = (x: Judged, y: Judged): number => y.edge.netPct - x.edge.netPct;
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
