import type { ExchangeRates, Currency } from "./priceEngine";
import { roundPrice } from "../lib/format";

export const CURRENCIES: Currency[] = ["DIVINE", "EXALT", "CHAOS"];
export const CCY_UNIT: Record<Currency, string> = { DIVINE: "Div", EXALT: "Ex", CHAOS: "Ch" };

export interface Denom {
  amount: number;
  unit: Currency;
}

/**
 * Step-up cap. The exchange gold fee scales with the NUMBER of currency items in a
 * trade, so paying 2,096 Exalts costs far more gold than paying ~9 Divines for the
 * same value. Keep any displayed amount ≤ this many items; past it, climb the
 * value ladder (Exalt → Chaos → Divine) to the fewest-items denomination.
 */
const DENOM_STEP = 200;

/** Highest-value currency that keeps the item count within the step cap. */
export function pickUnit(divValue: number, r: ExchangeRates): Currency {
  const v = Math.abs(divValue);
  if (v * r.exaltPerDivine <= DENOM_STEP) return "EXALT";
  if (v * r.chaosPerDivine <= DENOM_STEP) return "CHAOS";
  return "DIVINE";
}

/** Express a Divine value in a specific currency. */
export function denominateIn(divValue: number, unit: Currency, r: ExchangeRates): Denom {
  return { amount: divValue * unitsPerDivine(unit, r), unit };
}

/** Auto-pick the practical (fewest-items, lowest-fee) currency for a value. */
export function denominate(divValue: number, r: ExchangeRates): Denom {
  return denominateIn(divValue, pickUnit(divValue, r), r);
}

/**
 * Divine ≥ 1 shows as a whole number (no fractional orbs); Ex/Ch via roundPrice. A sub-Divine
 * amount is a real exchange price (an item trading several-per-Divine) — rounding it to "0 Div"
 * would erase it, so it keeps two significant digits.
 */
export function formatAmount(d: Denom): string {
  if (d.unit !== "DIVINE") return roundPrice(d.amount);
  return Math.abs(d.amount) >= 1 || d.amount === 0 ? Math.round(d.amount).toLocaleString("en-US") : d.amount.toPrecision(2);
}

export function formatDenom(d: Denom): string {
  return `${formatAmount(d)} ${CCY_UNIT[d.unit]}`;
}

/**
 * An OBSERVED exchange price (VWAP / band leg), where whole-Divine rounding would erase the very
 * edge being shown (8.2 → 8.6 Div reads "8 → 9"). Three significant digits in every currency.
 */
export function formatObservedDenom(d: Denom): string {
  const abs = Math.abs(d.amount);
  const a = abs >= 100 ? Math.round(d.amount).toLocaleString("en-US") : Number(d.amount.toPrecision(3)).toString();
  return `${a} ${CCY_UNIT[d.unit]}`;
}

/** Hard cap on the in-game currency exchange — ratios beyond this get clamped. */
export const RATIO_CAP = 65000;

function unitsPerDivine(c: Currency, r: ExchangeRates): number {
  return c === "DIVINE" ? 1 : c === "EXALT" ? r.exaltPerDivine : r.chaosPerDivine;
}

/** How many `to` you get per 1 `from` (Divine-reconciled mid). */
export function crossRate(from: Currency, to: Currency, r: ExchangeRates): number {
  return unitsPerDivine(to, r) / unitsPerDivine(from, r);
}

/** Full 3×3 directional rate matrix. */
export function rateMatrix(r: ExchangeRates): Record<Currency, Record<Currency, number>> {
  const m = {} as Record<Currency, Record<Currency, number>>;
  for (const f of CURRENCIES) {
    m[f] = {} as Record<Currency, number>;
    for (const t of CURRENCIES) m[f][t] = crossRate(f, t, r);
  }
  return m;
}

/** Effective cross-rate: a live override if provided, else the ninja mid. */
export type RateFn = (from: Currency, to: Currency) => number;

export function makeRateFn(r: ExchangeRates, overrides: Partial<Record<string, number>> = {}): RateFn {
  return (from, to) => overrides[`${from}_${to}`] ?? crossRate(from, to, r);
}

export interface TriLoop {
  path: string; // e.g. "Ex → Div → Ch → Ex"
  profitPct: number; // >0 means a free arbitrage loop exists
}

/**
 * The two 3-currency loops. On reconciled mids profit ≈ 0; a non-zero value only
 * appears once live per-pair ratios (order-book bid/ask) are entered — that's the
 * real arbitrage signal.
 */
export function triangularLoops(eff: RateFn): TriLoop[] {
  const loops: Array<[Currency, Currency, Currency]> = [
    ["DIVINE", "EXALT", "CHAOS"],
    ["DIVINE", "CHAOS", "EXALT"],
  ];
  return loops.map(([x, y, z]) => ({
    path: `${CCY_UNIT[x]} → ${CCY_UNIT[y]} → ${CCY_UNIT[z]} → ${CCY_UNIT[x]}`,
    profitPct: (eff(x, y) * eff(y, z) * eff(z, x) - 1) * 100,
  }));
}

export interface ConvertResult {
  from: Currency;
  to: Currency;
  amount: number;
  rate: number; // `to` per `from`, market
  marketOut: number; // fast — fill at market
  edgeOut: number; // place ~edgePct better, wait for a taker
  third: Currency; // the via-currency
  viaThirdOut: number; // from → third → to at market (== marketOut on consistent mids)
  warnings: string[];
}

/**
 * Plan a currency conversion. Compares the direct route vs hopping through the
 * third currency, gives a fast (market) and an edge (better-but-slower) figure,
 * and flags the practical traps: the 65000:1 exchange cap and bulk slippage.
 *
 * On ninja's reconciled mids `viaThirdOut` == `marketOut`; the gap only opens
 * once live per-pair ratios are supplied (real order-book edge).
 */
export function convert(
  from: Currency,
  to: Currency,
  amount: number,
  r: ExchangeRates,
  edgePct = 0.03,
  eff?: RateFn,
): ConvertResult {
  const rateOf: RateFn = eff ?? ((f, t) => crossRate(f, t, r));
  const rate = rateOf(from, to);
  const marketOut = amount * rate;
  const third = CURRENCIES.find((c) => c !== from && c !== to)!;
  const viaThirdOut = amount * rateOf(from, third) * rateOf(third, to);

  const warnings: string[] = [];
  const maxRatio = Math.max(rate, 1 / rate);
  if (maxRatio >= RATIO_CAP) {
    warnings.push(`ratio ~${Math.round(maxRatio)}:1 hits the 65000:1 exchange cap — hop through a higher denomination`);
  }
  if (amount >= 500 && from !== "DIVINE") {
    warnings.push(`large ${CCY_UNIT[from]} order walks the book — top is thin, expect to fill nearer the deep-liquidity ratio (split it, or take market)`);
  }

  return { from, to, amount, rate, marketOut, edgeOut: marketOut * (1 + edgePct), third, viaThirdOut, warnings };
}
