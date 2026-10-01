/*
 * The 7-day price trend of what a strategy drops — the card's headline. It is a price move of the
 * drops, never a profit per hour: drop rates are unknown, so nothing here is scaled by quantity.
 * Pure, so the node tests pin it without a database.
 */

export interface TrendItem {
  /** Divine per item. */
  div: number;
  /** poe.ninja 7-day change in percent; null when ninja has no trend for the item. */
  change7d: number | null;
  volume: number;
}

export interface BasketTrend {
  /** Value×liquidity-weighted 7-day change, percent. */
  change7d: number;
  /** Drops the trend is computed from (priced, with a 7-day change). */
  counted: number;
}

/**
 * Same weighting as rankFarms (farmAdvisor.ts): a valuable, liquid item moves the basket more than
 * a cheap or thin one. Kept local because the Coach drift test pins farmAdvisor's source text.
 */
const weight = (it: TrendItem): number => it.div * Math.log10(it.volume + 10);

/** Weighted 7-day change over the items that have both a price and a trend; null when none do. */
export function basketTrend(items: readonly TrendItem[]): BasketTrend | null {
  const counted = items.filter((it) => it.div > 0 && it.change7d !== null && Number.isFinite(it.change7d) && Number.isFinite(it.volume));
  const total = counted.reduce((sum, it) => sum + weight(it), 0);
  if (counted.length === 0 || !(total > 0)) return null;
  const change7d = counted.reduce((sum, it) => sum + (it.change7d ?? 0) * weight(it), 0) / total;
  return { change7d, counted: counted.length };
}
