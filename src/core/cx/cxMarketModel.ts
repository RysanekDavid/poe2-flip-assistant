import { CX_CURRENCY_IDS } from "../../api/cxClient";
import type { CxMarketRow } from "../../db/cxMarketQueries";
import { goldToDivine, sumLegFees } from "./cxFees";

/**
 * One hour of one league's exchange, turned into per-item observed prices and edges. Pure.
 *
 * Semantics (GGG publishes none for the ratio fields — docs/research/poe2-flip-snipe-competitors):
 *  - VWAP: volume_traded[quote] / volume_traded[item] = quote paid per item over the hour.
 *  - band: lowest_ratio / highest_ratio read as the hour's TRADED extremes, not a live bid/ask.
 *  - Every price is converted to Divine through the SAME hour's Ex/Div and Chaos/Div VWAPs, so
 *    two quotes of one item can be compared: that divergence is the cross-market edge.
 */

const { divine: DIV, exalted: EX, chaos: CHAOS } = CX_CURRENCY_IDS;

/** The only currencies an item is priced against here; ids compare with === only. */
export const CX_QUOTES: readonly string[] = [DIV, EX, CHAOS];

/** The hour's base rates, each null when its market did not trade. */
export interface HourRates {
  exaltPerDivine: number | null;
  chaosPerDivine: number | null;
}

/** One item priced in one quote currency during one hour. */
export interface QuoteObs {
  quote: string;
  /** VWAP in units of `quote` per item. */
  priceQuote: number;
  priceDiv: number;
  /** Hour's band in quote units per item, or null when GGG published no ratios. */
  lowQuote: number | null;
  highQuote: number | null;
  /** Item units that changed hands in this market this hour. */
  units: number;
}

export type EdgeKind = "cross" | "band";

/** The best flip the hour supports for one item, net of the gold fees we can price. */
export interface ItemHourEdge {
  hour: number;
  kind: EdgeKind;
  buy: { quote: string; priceQuote: number; priceDiv: number };
  sell: { quote: string; priceQuote: number; priceDiv: number };
  grossPct: number;
  netPct: number;
  netDivPerUnit: number;
  feeGoldPerUnit: number;
  feeDivPerUnit: number | null;
  feeComplete: boolean;
  /** Item units/hour on the slower leg — the liquidity cap. */
  slowerUnits: number;
  /** Most-liquid quote's VWAP in Div and its band in Div — the row's reference market. */
  midDiv: number;
  bandDiv: { low: number; high: number } | null;
}

function sideVolume(row: CxMarketRow, id: string): number | null {
  if (row.item_a === id) return row.volume_a;
  if (row.item_b === id) return row.volume_b;
  return null;
}

/** Ex/Div and Chaos/Div VWAPs of the hour, from their own markets. */
export function hourRates(rows: readonly CxMarketRow[]): HourRates {
  const rate = (numerator: string): number | null => {
    const m = rows.find((r) => (r.item_a === numerator && r.item_b === DIV) || (r.item_b === numerator && r.item_a === DIV));
    if (m == null) return null;
    const num = sideVolume(m, numerator);
    const den = sideVolume(m, DIV);
    return num != null && den != null && num > 0 && den > 0 ? num / den : null;
  };
  return { exaltPerDivine: rate(EX), chaosPerDivine: rate(CHAOS) };
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

function observe(row: CxMarketRow, item: Side, quote: Side, rates: HourRates): QuoteObs | null {
  const quoteId = quote === "a" ? row.item_a : row.item_b;
  const qpd = quotePerDivine(quoteId, rates);
  const units = item === "a" ? row.volume_a : row.volume_b;
  const quoteUnits = quote === "a" ? row.volume_a : row.volume_b;
  if (qpd == null || !(units > 0) || !(quoteUnits > 0)) return null;
  const priceQuote = quoteUnits / units;
  // Which ratio field is numerically lower depends on the pair's orientation — take min/max.
  const band = [ratioPrice(row, "low", item, quote), ratioPrice(row, "high", item, quote)].filter(
    (n): n is number => n != null,
  );
  return {
    quote: quoteId,
    priceQuote,
    priceDiv: priceQuote / qpd,
    lowQuote: band.length > 0 ? Math.min(...band) : null,
    highQuote: band.length > 0 ? Math.max(...band) : null,
    units,
  };
}

/** Every item's quotes this hour, keyed by the item's base id. An item is never its own quote. */
export function quotesByItem(rows: readonly CxMarketRow[], rates: HourRates): Map<string, QuoteObs[]> {
  const out = new Map<string, QuoteObs[]>();
  const add = (item: string, obs: QuoteObs | null): void => {
    if (obs == null) return;
    const list = out.get(item) ?? [];
    list.push(obs);
    out.set(item, list);
  };
  for (const row of rows) {
    if (CX_QUOTES.includes(row.item_b)) add(row.item_a, observe(row, "a", "b", rates));
    if (CX_QUOTES.includes(row.item_a)) add(row.item_b, observe(row, "b", "a", rates));
  }
  return out;
}

interface Legs {
  kind: EdgeKind;
  buy: { quote: string; priceQuote: number; priceDiv: number };
  sell: { quote: string; priceQuote: number; priceDiv: number };
  slowerUnits: number;
}

/** Buy where the item is cheapest in Div, sell where it is dearest — needs two quotes. */
function crossLegs(quotes: readonly QuoteObs[]): Legs | null {
  if (quotes.length < 2) return null;
  const sorted = [...quotes].sort((x, y) => x.priceDiv - y.priceDiv);
  const buy = sorted[0]!;
  const sell = sorted[sorted.length - 1]!;
  return {
    kind: "cross",
    buy: { quote: buy.quote, priceQuote: buy.priceQuote, priceDiv: buy.priceDiv },
    sell: { quote: sell.quote, priceQuote: sell.priceQuote, priceDiv: sell.priceDiv },
    slowerUnits: Math.min(buy.units, sell.units),
  };
}

/**
 * Market-making inside one market: resting orders below and above the VWAP by the SAME distance
 * d = HALF the tighter side of the traded band. Tighter side, so one outlier fill cannot inflate
 * it; half, because the extremes are where the hour's rarest fills happened — quoting at them
 * would promise fills the hour barely produced.
 */
export const BAND_CAPTURE = 0.5;

function bandLegs(q: QuoteObs): Legs | null {
  if (q.lowQuote == null || q.highQuote == null) return null;
  const tighter = Math.min(q.highQuote / q.priceQuote - 1, 1 - q.lowQuote / q.priceQuote);
  const d = Math.max(0, tighter * BAND_CAPTURE);
  const perDiv = q.priceDiv / q.priceQuote;
  const buyQuote = q.priceQuote * (1 - d);
  const sellQuote = q.priceQuote * (1 + d);
  return {
    kind: "band",
    buy: { quote: q.quote, priceQuote: buyQuote, priceDiv: buyQuote * perDiv },
    sell: { quote: q.quote, priceQuote: sellQuote, priceDiv: sellQuote * perDiv },
    slowerUnits: q.units,
  };
}

function priceLegs(item: string, legs: Legs, rates: HourRates, goldPerExalt: number) {
  // Buying requests the item itself; selling requests the sell-side currency.
  const fees = sumLegFees([
    { baseId: item, units: 1 },
    { baseId: legs.sell.quote, units: legs.sell.priceQuote },
  ]);
  const feeDiv = goldToDivine(fees.knownGold, rates.exaltPerDivine, goldPerExalt);
  const netDivPerUnit = legs.sell.priceDiv - legs.buy.priceDiv - (feeDiv ?? 0);
  return {
    ...legs,
    grossPct: (legs.sell.priceDiv / legs.buy.priceDiv - 1) * 100,
    netPct: (netDivPerUnit / legs.buy.priceDiv) * 100,
    netDivPerUnit,
    feeGoldPerUnit: fees.knownGold,
    feeDivPerUnit: feeDiv,
    // An unpriceable gold amount is as unknown as an unlisted item fee.
    feeComplete: fees.complete && (feeDiv != null || fees.knownGold === 0),
  };
}

/** The better (higher net %) of the cross-market and in-market edges for one item-hour. */
export function itemHourEdge(
  item: string,
  hour: number,
  quotes: readonly QuoteObs[],
  rates: HourRates,
  goldPerExalt: number,
): ItemHourEdge | null {
  if (quotes.length === 0) return null;
  const liquid = [...quotes].sort((x, y) => y.units - x.units)[0]!;
  const candidates = [crossLegs(quotes), bandLegs(liquid)]
    .filter((l): l is Legs => l != null)
    .map((l) => priceLegs(item, l, rates, goldPerExalt));
  if (candidates.length === 0) return null;
  const best = candidates.reduce((x, y) => (y.netPct > x.netPct ? y : x));
  const perDiv = liquid.priceDiv / liquid.priceQuote;
  return {
    ...best,
    hour,
    midDiv: liquid.priceDiv,
    bandDiv:
      liquid.lowQuote != null && liquid.highQuote != null
        ? { low: liquid.lowQuote * perDiv, high: liquid.highQuote * perDiv }
        : null,
  };
}

/** Every item's best edge for one hour's markets. */
export function hourEdges(hour: number, rows: readonly CxMarketRow[], goldPerExalt: number): Map<string, ItemHourEdge> {
  const rates = hourRates(rows);
  const out = new Map<string, ItemHourEdge>();
  for (const [item, quotes] of quotesByItem(rows, rates)) {
    const edge = itemHourEdge(item, hour, quotes, rates, goldPerExalt);
    if (edge != null) out.set(item, edge);
  }
  return out;
}
