/**
 * Demand-board "Heat" — pure math, kept out of the route so it is testable without scout.
 *
 * poe2scout exposes no sales, only a periodic listing COUNT per unique. Averaging that count
 * (the old "flow") ranked the most over-supplied items as the hottest. The honest proxy we can
 * build is sell-through: how much the listed count DROPS between consecutive scrapes. Increases
 * (new supply) are clipped to 0 so a flood of listings never reads as demand. It is still a
 * proxy — a delisting or a price-edit re-index is not a sale — which the UI tooltip says.
 */

/**
 * Mean per-step FRACTIONAL decrease in listing count, oldest→newest: each step contributes
 * max(0, prev − next) / prev. Fractional, not absolute — a 900-listing unique that loses 10
 * listings per scrape (1%) is churn, a 12-listing unique that loses 3 (25%) is selling through.
 * Increases (new supply) are clipped at 0. Result is 0..1.
 */
export function sellThroughProxy(qtys: readonly number[]): number {
  if (qtys.length < 2) return 0;
  let drops = 0;
  for (let i = 1; i < qtys.length; i++) {
    const prev = qtys[i - 1]!;
    if (prev > 0) drops += Math.max(0, prev - qtys[i]!) / prev;
  }
  return drops / (qtys.length - 1);
}

/** A per-step drop of this fraction (20% of the listings gone each scrape) counts as fully hot. */
export const SELL_THROUGH_SATURATION = 0.2;

/** Sell-through contribution 0..1, saturating at SELL_THROUGH_SATURATION. */
export function sellThroughNorm(fraction: number): number {
  if (!(fraction > 0)) return 0;
  return Math.min(1, fraction / SELL_THROUGH_SATURATION);
}

/** Momentum contribution: only RISING price counts, saturating at +50%. */
export function momentumNorm(momentumPct: number): number {
  return Math.min(Math.max(momentumPct, 0) / 50, 1);
}

/** Heat 0–100: half sell-through proxy, half positive momentum. Board-independent, so an item's
 *  heat does not move just because another item on the board changed. */
export function heatScore(sellThrough: number, momentumPct: number): number {
  return Math.round(100 * (0.5 * sellThroughNorm(sellThrough) + 0.5 * momentumNorm(momentumPct)));
}
