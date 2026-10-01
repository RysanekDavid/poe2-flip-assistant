/*
 * The 7-day price trend of what a strategy drops — the card's headline. It is a price move of the
 * drops, never a profit per hour: drop rates are unknown, so nothing here is scaled by quantity.
 * Pure, so the node tests pin it without a database.
 */

export interface TrendItem {
  /** Divine per item, today. */
  div: number;
  /** poe.ninja 7-day change in percent; null when ninja has no trend for the item. */
  change7d: number | null;
  volume: number;
}

export interface BasketTrend {
  /** How much the basket's value moved over 7 days, percent. */
  change7d: number;
  /** Drops the trend is computed from (priced, liquid, with a 7-day change). */
  counted: number;
}

/** Below this poe.ninja volume an item is noise that cannot really be sold (rankFarms' MIN_VOLUME). */
export const TREND_MIN_VOLUME = 50;

/** The item's price 7 days ago; null when the change cannot have come from a positive price. */
function priceWeekAgo(it: TrendItem): number | null {
  if (!(it.div > 0) || it.change7d === null || !Number.isFinite(it.change7d) || it.change7d <= -100) return null;
  return it.div / (1 + it.change7d / 100);
}

/**
 * The basket's value change over 7 days: each item weighted by what it was worth a week ago times
 * a log-volume liquidity factor (the factor rankFarms uses). Weighting by the START price makes the
 * mean equal (value now ÷ value then − 1) of that basket. Weighting by today's price instead would
 * let the item that rose most also count most, and inflate every rising headline.
 */
export function basketTrend(items: readonly TrendItem[]): BasketTrend | null {
  let then = 0;
  let now = 0;
  let counted = 0;
  for (const it of items) {
    const before = priceWeekAgo(it);
    if (before === null || !Number.isFinite(it.volume) || it.volume < TREND_MIN_VOLUME) continue;
    const liquidity = Math.log10(it.volume + 10);
    then += before * liquidity;
    now += it.div * liquidity;
    counted += 1;
  }
  if (counted === 0 || !(then > 0)) return null;
  return { change7d: (now / then - 1) * 100, counted };
}
