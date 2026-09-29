import { CX_CURRENCY_IDS } from "../../api/cxClient";
import type { CxSellQuote } from "../../lib/wealthContract";
import { goldFeeFor, goldToDivine } from "../cx/cxFees";
import { gridStepPct } from "../cx/cxMarketModel";
import type { CxItemStats } from "../cx/cxPersistence";
import { liquidityTier } from "../flipMarket";
import { recommendOffsets, type Currency, type ExchangeRates } from "../priceEngine";
import { CCY_UNIT, RATIO_CAP, denominateIn, formatObservedDenom, pickUnit } from "../treasury";

/**
 * Selling on the Currency Exchange: expected price, gold fee, denomination and time to clear. Pure.
 *
 * Fee (cx/cxFees): gold per unit of the currency you RECEIVE, so the same Div value costs very
 * different gold as 1 Divine, ~20 Chaos or ~400 Exalted. Denomination: among the currencies that
 * keep the receipt within treasury's item cap, at ≥ 1 whole unit and inside the 65000:1 ratio
 * clamp (treasury.RATIO_CAP), prefer those whose N:1 price
 * grid is no coarser than maxGridStepPct (a 1.5 Div item priced in Div can only sit at 1 or 2 —
 * a 33–67% step that costs far more than any fee), then pick the cheapest gold fee.
 */

const RECEIVE_ID: Readonly<Record<Currency, string>> = {
  DIVINE: CX_CURRENCY_IDS.divine,
  EXALT: CX_CURRENCY_IDS.exalted,
  CHAOS: CX_CURRENCY_IDS.chaos,
};

/** Value ladder, cheapest first — the order treasury.pickUnit climbs. */
const LADDER: readonly Currency[] = ["EXALT", "CHAOS", "DIVINE"];

/** An order this many hours from clearing gets the "split the order" warning. */
export const SPLIT_ORDER_HOURS = 24;

export interface PricedLine {
  /** Per-unit poe.ninja mid in Div. */
  baseValue: number;
  /** poe.ninja volume — unit-uncertain (see flipMarket); only feeds the offset heuristic here. */
  volume: number;
}

interface DenomChoice {
  unit: Currency;
  receiveUnits: number;
  gridPct: number;
  /** Items per currency unit or currency units per item, whichever is ≥ 1. */
  ratio: number;
  feeGold: number | null;
}

const unitsPerDivine = (c: Currency, r: ExchangeRates): number =>
  c === "DIVINE" ? 1 : c === "EXALT" ? r.exaltPerDivine : r.chaosPerDivine;

function choiceFor(unit: Currency, unitDiv: number, qty: number, rates: ExchangeRates): DenomChoice {
  const upd = unitsPerDivine(unit, rates);
  const price = unitDiv * upd;
  const receiveUnits = unitDiv * qty * upd;
  return {
    unit, receiveUnits, gridPct: gridStepPct(price), ratio: Math.max(price, 1 / price),
    feeGold: goldFeeFor(RECEIVE_ID[unit], receiveUnits),
  };
}

const cheapest = (list: readonly DenomChoice[]): DenomChoice =>
  list.reduce((a, b) => ((b.feeGold ?? Infinity) < (a.feeGold ?? Infinity) ? b : a));

/** The receive currency for a whole order — see the file header for the rule. */
export function chooseDenomination(unitDiv: number, qty: number, rates: ExchangeRates, maxGridStepPct: number): DenomChoice {
  const floor = pickUnit(unitDiv * qty, rates);
  // A ratio past the exchange's 65000:1 clamp cannot be posted at all, whatever it saves in gold.
  const inCap = LADDER.slice(LADDER.indexOf(floor))
    .map((c) => choiceFor(c, unitDiv, qty, rates))
    .filter((c) => c.ratio <= RATIO_CAP);
  const whole = inCap.filter((c) => c.receiveUnits >= 1);
  const fine = whole.filter((c) => c.gridPct <= maxGridStepPct);
  if (fine.length > 0) return cheapest(fine);
  if (whole.length > 0) return cheapest(whole);
  return choiceFor(floor, unitDiv, qty, rates);
}

function etaHours(qty: number, unitsPerHour: number | null, flowSharePct: number): number | null {
  const fill = unitsPerHour == null ? 0 : unitsPerHour * (flowSharePct / 100);
  return fill > 0 ? qty / fill : null;
}

interface QuoteWarningInput {
  choice: DenomChoice;
  midDiv: number;
  rates: ExchangeRates;
  maxGridStepPct: number;
  observed: boolean;
  eta: number | null;
  flowSharePct: number;
  feeComplete: boolean;
}

function quoteWarnings(w: QuoteWarningInput): string[] {
  const out: string[] = [];
  // formatDenom rounds Divines to whole orbs ("2.5 Div" → "3 Div") — wrong exactly where the grid bites.
  const perUnit = formatObservedDenom(denominateIn(w.midDiv, w.choice.unit, w.rates));
  if (w.choice.gridPct > w.maxGridStepPct) {
    out.push(`coarse price grid: at ${perUnit} each the exchange only moves in ~${Math.round(w.choice.gridPct)}% steps (N:1 ratios)`);
  }
  if (w.choice.ratio > RATIO_CAP) {
    out.push(`~${Math.round(w.choice.ratio).toLocaleString("en-US")}:1 is past the exchange's 65000:1 cap — this order cannot be posted as is`);
  }
  if (w.choice.receiveUnits < 1) out.push(`the whole order is worth under 1 ${CCY_UNIT[w.choice.unit]} — the exchange cannot pay a fraction`);
  if (!w.observed) out.push("no fresh exchange history — mid is poe.ninja, time to sell unknown");
  if (w.eta != null && w.eta > SPLIT_ORDER_HOURS) {
    out.push(`~${(w.eta / 24).toFixed(1)} days to clear at ${w.flowSharePct}% of the observed flow — large order walks the book (split it, or take market)`);
  }
  if (!w.feeComplete) out.push("gold fee could not be priced — the net figures exclude it");
  return out;
}

/**
 * Quote selling `qty` units on the exchange. `cx` is the item's stored exchange market (null =
 * none): its newest-hour VWAP and observed flow win over the ninja mid. Fast/patient sit the
 * volume-adaptive offset below/above mid (priceEngine.recommendOffsets — a heuristic).
 */
export function cxSellQuote(
  item: PricedLine,
  cx: CxItemStats | null,
  qty: number,
  rates: ExchangeRates,
  goldPerExalt: number,
  flowSharePct: number,
  maxGridStepPct: number,
): CxSellQuote {
  const observed = cx != null;
  const midDiv = cx != null ? cx.midDiv : item.baseValue;
  const offsets = recommendOffsets(item.volume);
  const choice = chooseDenomination(midDiv, qty, rates, maxGridStepPct);
  const feeDiv = choice.feeGold == null ? null : goldToDivine(choice.feeGold, rates.exaltPerDivine, goldPerExalt);
  const feeComplete = feeDiv != null;
  const unitsPerHour = cx != null ? cx.marketUnitsPerHour : null;
  const eta = etaHours(qty, unitsPerHour, flowSharePct);
  // Unobserved: ninja volume stands in for turnover exactly as flipMarket's estimate does.
  const turnover = cx != null ? cx.marketUnitsPerHour * cx.midDiv : item.volume;
  return {
    midDiv,
    midSource: observed ? "cx" : "ninja",
    fastDiv: midDiv * offsets.buyDiscount,
    patientDiv: midDiv * offsets.sellBonus,
    denom: denominateIn(midDiv, choice.unit, rates),
    receiveUnits: choice.receiveUnits,
    gridStepPct: choice.gridPct,
    feeGold: choice.feeGold,
    feeDivPerUnit: feeDiv == null ? null : feeDiv / qty,
    feeComplete,
    unitsPerHour,
    etaHours: eta,
    tier: liquidityTier(turnover),
    observed,
    warnings: quoteWarnings({ choice, midDiv, rates, maxGridStepPct, observed, eta, flowSharePct, feeComplete }),
  };
}
