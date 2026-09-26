/**
 * Demand-board "Heat" — pure math, kept out of the route so it is testable without scout.
 *
 * poe2scout exposes no sales, only a periodic listing COUNT per unique. Averaging that count
 * (the old "flow") ranked the most over-supplied items as the hottest. The honest proxy we can
 * build is sell-through: how much the listed count DROPS between consecutive scrapes. Increases
 * (new supply) are clipped to 0 so a flood of listings never reads as demand. It is still a
 * proxy — a delisting or a price-edit re-index is not a sale — which the UI tooltip says.
 */

/** Mean per-step decrease in listing count, oldest→newest, increases clipped at 0. */
export function sellThroughProxy(qtys: readonly number[]): number {
  if (qtys.length < 2) return 0;
  let drops = 0;
  for (let i = 1; i < qtys.length; i++) drops += Math.max(0, qtys[i - 1]! - qtys[i]!);
  return drops / (qtys.length - 1);
}

/** log-normalize a non-negative value against the board maximum → 0..1 (long-tailed counts). */
export function logNorm(v: number, max: number): number {
  if (!(max > 0) || !(v > 0)) return 0;
  return Math.min(1, Math.log10(v + 1) / Math.log10(max + 1));
}

/** Momentum contribution: only RISING price counts, saturating at +50%. */
export function momentumNorm(momentumPct: number): number {
  return Math.min(Math.max(momentumPct, 0) / 50, 1);
}

/** Heat 0–100: half sell-through proxy (vs the board's max), half positive momentum. */
export function heatScore(sellThrough: number, maxSellThrough: number, momentumPct: number): number {
  return Math.round(100 * (0.5 * logNorm(sellThrough, maxSellThrough) + 0.5 * momentumNorm(momentumPct)));
}
