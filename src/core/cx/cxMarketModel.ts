import { CX_CURRENCY_IDS } from "../../api/cxClient";
import { config } from "../../config/env";
import type { CxMarketRow } from "../../db/cxMarketQueries";

/**
 * One hour of one league's exchange, turned into per-item observed quotes. Pure.
 *
 * Semantics (GGG publishes none for the ratio fields — docs/research/poe2-flip-snipe-competitors):
 *  - VWAP: volume_traded[quote] / volume_traded[item] = quote paid per item over the hour.
 *  - lowest/highest_ratio: kept for display only. In real digests they look like resting-order
 *    extremes, not fills, so nothing is scored on them unless config.cx.bandEdges is switched on.
 *  - Every price is converted to Divine through the SAME hour's Ex/Div and Chaos/Div VWAPs, so
 *    two quotes of one item can be compared: that divergence is the cross-market edge.
 *
 * The exchange only fills at N:1 ratios (every real ratio map has one side = 1). An item worth
 * ~1–3 Ex can only trade at 1:1, 1:2, 1:3 in the Ex market — a 33–100% price grid — while its
 * Div market fills on a <1% grid, so the two VWAPs diverge every hour BY CONSTRUCTION. Hence the
 * leg guards below: a quote too thin or too coarse to carry an edge is not quotable at all.
 */

const { divine: DIV, exalted: EX, chaos: CHAOS } = CX_CURRENCY_IDS;

/** The only currencies an item is priced against here; ids compare with === only. */
export const CX_QUOTES: readonly string[] = [DIV, EX, CHAOS];

/** Thresholds the model applies. Pure functions take them explicitly; the app reads config. */
export interface ModelParams {
  goldPerExalt: number;
  /** Item units per hour a leg must move to be quotable. */
  minLegUnits: number;
  /** Div per hour a leg must move to be quotable. */
  minLegDivPerHour: number;
  /** A leg whose N:1 ratio grid is coarser than this (%) is not quotable. */
  maxGridStepPct: number;
  /** A net edge above this (%) is treated as a data artefact, never ranked. */
  maxPlausibleEdgePct: number;
  /** Score in-market band edges (off until ratio semantics are verified). */
  bandEdges: boolean;
}

export function modelParams(): ModelParams {
  const c = config.cx;
  return {
    goldPerExalt: c.goldPerExalt,
    minLegUnits: c.minLegUnits,
    minLegDivPerHour: c.minLegDivPerHour,
    maxGridStepPct: c.maxGridStepPct,
    maxPlausibleEdgePct: c.maxPlausibleEdgePct,
    bandEdges: c.bandEdges,
  };
}

/** The hour's base rates, each null when its market did not trade. */
export interface HourRates {
  exaltPerDivine: number | null;
  chaosPerDivine: number | null;
}

/** Why a leg cannot carry an edge. */
export type LegIssue = "thin" | "coarse";

/** One item priced in one quote currency during one hour. */
export interface QuoteObs {
  quote: string;
  /** VWAP in units of `quote` per item. */
  priceQuote: number;
  priceDiv: number;
  /** Hour's ratio extremes in quote units per item, or null when GGG published none. */
  lowQuote: number | null;
  highQuote: number | null;
  /** Item units that changed hands in this market this hour. */
  units: number;
  /** Relative spacing (%) of the N:1 fill grid at this price. */
  gridStepPct: number;
  /** Null when the leg is quotable. */
  issue: LegIssue | null;
}

/**
 * Relative spacing of the exchange's N:1 fill grid at a price p (quote units per item). At
 * p = 150 the neighbours are 149/151 (~0.7%); at p = 2 they are 1 and 3 (50%); p < 1 is the
 * mirror case (N items : 1 quote). 100 / max(p, 1/p) captures both sides.
 */
export function gridStepPct(priceQuote: number): number {
  return 100 / Math.max(priceQuote, 1 / priceQuote);
}

/** The three base-currency markets of one hour, keyed "a|b" in stored (sorted) order. */
export type BaseMarkets = Map<string, CxMarketRow>;

export function baseMarkets(rows: readonly CxMarketRow[]): BaseMarkets {
  const out: BaseMarkets = new Map();
  for (const r of rows) if (CX_QUOTES.includes(r.item_a) && CX_QUOTES.includes(r.item_b)) out.set(`${r.item_a}|${r.item_b}`, r);
  return out;
}

/** Units of `a` paid per unit of `b` on their own market, plus b's volume — or null. */
export function baseRate(base: BaseMarkets, a: string, b: string): { aPerB: number; bVolume: number } | null {
  const m = base.get(a < b ? `${a}|${b}` : `${b}|${a}`);
  if (m == null) return null;
  const va = m.item_a === a ? m.volume_a : m.volume_b;
  const vb = m.item_a === a ? m.volume_b : m.volume_a;
  return va > 0 && vb > 0 ? { aPerB: va / vb, bVolume: vb } : null;
}

/** Ex/Div and Chaos/Div VWAPs of the hour, from their own markets. */
export function hourRates(base: BaseMarkets): HourRates {
  return {
    exaltPerDivine: baseRate(base, EX, DIV)?.aPerB ?? null,
    chaosPerDivine: baseRate(base, CHAOS, DIV)?.aPerB ?? null,
  };
}

/** Units of a quote currency per Divine this hour, or null when that rate did not trade. */
export function quotePerDivine(quote: string, rates: HourRates): number | null {
  if (quote === DIV) return 1;
  if (quote === EX) return rates.exaltPerDivine;
  if (quote === CHAOS) return rates.chaosPerDivine;
  return null;
}

type Side = "a" | "b";

function ratioPrice(row: CxMarketRow, kind: "low" | "high", item: Side, quote: Side): number | null {
  const q = row[`${kind}_ratio_${quote}`];
  const i = row[`${kind}_ratio_${item}`];
  return q != null && i != null && q > 0 && i > 0 ? q / i : null;
}

function legIssue(units: number, priceDiv: number, stepPct: number, p: ModelParams): LegIssue | null {
  if (units < p.minLegUnits || units * priceDiv < p.minLegDivPerHour) return "thin";
  if (stepPct > p.maxGridStepPct) return "coarse";
  return null;
}

function observe(row: CxMarketRow, item: Side, quote: Side, rates: HourRates, p: ModelParams): QuoteObs | null {
  const quoteId = quote === "a" ? row.item_a : row.item_b;
  const qpd = quotePerDivine(quoteId, rates);
  const units = item === "a" ? row.volume_a : row.volume_b;
  const quoteUnits = quote === "a" ? row.volume_a : row.volume_b;
  if (qpd == null || !(units > 0) || !(quoteUnits > 0)) return null;
  const priceQuote = quoteUnits / units;
  const priceDiv = priceQuote / qpd;
  const stepPct = gridStepPct(priceQuote);
  // Which ratio field is numerically lower depends on the pair's orientation — take min/max.
  const band = [ratioPrice(row, "low", item, quote), ratioPrice(row, "high", item, quote)].filter(
    (n): n is number => n != null,
  );
  return {
    quote: quoteId,
    priceQuote,
    priceDiv,
    lowQuote: band.length > 0 ? Math.min(...band) : null,
    highQuote: band.length > 0 ? Math.max(...band) : null,
    units,
    gridStepPct: stepPct,
    issue: legIssue(units, priceDiv, stepPct, p),
  };
}

/** Every item's quotes this hour, keyed by the item's base id. An item is never its own quote. */
export function quotesByItem(rows: readonly CxMarketRow[], rates: HourRates, p: ModelParams): Map<string, QuoteObs[]> {
  const out = new Map<string, QuoteObs[]>();
  const add = (item: string, obs: QuoteObs | null): void => {
    if (obs == null) return;
    const list = out.get(item) ?? [];
    list.push(obs);
    out.set(item, list);
  };
  for (const row of rows) {
    if (CX_QUOTES.includes(row.item_b)) add(row.item_a, observe(row, "a", "b", rates, p));
    if (CX_QUOTES.includes(row.item_a)) add(row.item_b, observe(row, "b", "a", rates, p));
  }
  return out;
}
