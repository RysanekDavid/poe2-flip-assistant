/**
 * Listing price → Divine, typed. The old `toDivine` returned NaN for currencies outside the rates
 * ladder, and callers variously filtered it, coerced it to 0 (`price_div: 0` in hunt hits) or fed
 * it straight into comparisons. An unrated ask is now a distinct result a caller must handle.
 */
export interface DivRates {
  exaltPerDivine: number;
  chaosPerDivine: number;
}

export type ListingDiv = { kind: "rated"; div: number } | { kind: "unrated"; currency: string; reason: string };

/** Divine value of `amount` of a ladder currency, or null when the currency isn't on the ladder. */
export function amountInDivine(amount: number, currency: string, rates: DivRates): number | null {
  const unit = divPerUnit(currency, rates);
  return unit == null || !Number.isFinite(amount) ? null : amount * unit;
}

function divPerUnit(currency: string, rates: DivRates): number | null {
  switch (currency) {
    case "divine":
      return 1;
    case "exalted":
    case "exalt":
      return rates.exaltPerDivine > 0 ? 1 / rates.exaltPerDivine : null;
    case "chaos":
      return rates.chaosPerDivine > 0 ? 1 / rates.chaosPerDivine : null;
    default:
      return null;
  }
}

/** A listing ask in Divine. Non-positive amounts and off-ladder currencies are `unrated`. */
export function listingDiv(price: { amount: number; currency: string }, rates: DivRates): ListingDiv {
  if (!(price.amount > 0)) return { kind: "unrated", currency: price.currency, reason: `non-positive amount ${price.amount}` };
  const div = amountInDivine(price.amount, price.currency, rates);
  if (div == null || !(div > 0)) {
    return { kind: "unrated", currency: price.currency, reason: `currency "${price.currency}" not on the rates ladder` };
  }
  return { kind: "rated", div };
}

/** Divine value or null — for aggregations that only count rated asks (and count the rest). */
export function ratedDiv(price: { amount: number; currency: string } | null, rates: DivRates): number | null {
  if (!price) return null;
  const r = listingDiv(price, rates);
  return r.kind === "rated" ? r.div : null;
}
