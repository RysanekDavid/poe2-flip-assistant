import type { CxMarketView } from "./cx/cxItemMarkets";
import type { ResolvedRates } from "./rates";
import type { LatestPriceRow } from "../db/latestSnapshotQueries";
import { ECONOMY_CATEGORIES, economyCategory, OTHER_CATEGORY } from "../lib/economyCategories";
import type { MarketPriceCategory, MarketPriceItem, MarketPricesResponse } from "../lib/marketPricesContract";

/**
 * The Market › Prices body: poe.ninja's latest value per item, its 7-day trend, and the Currency
 * Exchange's own flow where the exchange has a fresh market. Pure over its inputs so the test can
 * pin the null handling (unknown never becomes 0) and the unit (Divine per item, never inverted).
 */

export interface MarketPricesInput {
  league: string;
  rows: readonly LatestPriceRow[];
  cx: CxMarketView | null;
  rates: ResolvedRates | null;
}

const positiveOrNull = (n: number | null | undefined): number | null => (n != null && Number.isFinite(n) && n > 0 ? n : null);

/**
 * Units per hour. The exchange digest counts item units, so it wins. poe.ninja's volume looks
 * Divine-denominated (see core/flipMarket.ts), so its units are volume ÷ value and marked "ninja"
 * for the UI to caveat. ninjaClient stores a missing volume as 0, so 0 reads as unknown here.
 */
function volumeOf(row: LatestPriceRow, cxUnits: number | null): Pick<MarketPriceItem, "volumePerHour" | "volumeSource"> {
  if (cxUnits != null && Number.isFinite(cxUnits) && cxUnits >= 0) return { volumePerHour: cxUnits, volumeSource: "cx" };
  const volume = positiveOrNull(row.volume);
  const value = positiveOrNull(row.baseValue);
  if (volume === null || value === null) return { volumePerHour: null, volumeSource: null };
  return { volumePerHour: volume / value, volumeSource: "ninja" };
}

const warnedTypes = new Set<string>();

/** A stored type with no label goes under Other, warned once per type per process (not per poll). */
function railType(type: string): string {
  if (economyCategory(type) !== null) return type;
  if (!warnedTypes.has(type)) {
    warnedTypes.add(type);
    console.warn(`[market/prices] poe.ninja type "${type}" has no label in ECONOMY_CATEGORIES — listed under Other`);
  }
  return OTHER_CATEGORY.type;
}

function toItem(row: LatestPriceRow, cx: CxMarketView | null): MarketPriceItem {
  const stats = cx?.byItemId.get(row.itemId) ?? null;
  return {
    itemId: row.itemId,
    name: row.itemName,
    category: row.category,
    railCategory: railType(row.category),
    icon: row.icon,
    valueDiv: positiveOrNull(row.baseValue),
    valueAt: row.fetchedAt,
    change7d: row.change7d != null && Number.isFinite(row.change7d) ? row.change7d : null,
    spark7d: row.spark7d,
    trendAt: row.trendAt,
    ...volumeOf(row, stats?.marketUnitsPerHour ?? null),
    cxMidDiv: positiveOrNull(stats?.midDiv),
    cxBand: stats?.bandDiv ?? null,
  };
}

/**
 * Every labelled category (empty ones too, so the rail never reshuffles), plus Other only while it
 * holds something; each with art: the curated item's icon, else the priciest item's.
 */
function categoriesOf(items: readonly MarketPriceItem[]): MarketPriceCategory[] {
  const listed = [...ECONOMY_CATEGORIES, OTHER_CATEGORY].map((c) => {
    const own = items.filter((i) => i.railCategory === c.type);
    const curated = own.find((i) => i.itemId === c.iconItemId && i.icon !== null);
    const priciest = own
      .filter((i) => i.icon !== null)
      .reduce<MarketPriceItem | null>((best, i) => (best === null || (i.valueDiv ?? 0) > (best.valueDiv ?? 0) ? i : best), null);
    return { category: { type: c.type, slug: c.slug, label: c.label, icon: (curated ?? priciest)?.icon ?? null }, count: own.length };
  });
  return listed.filter(({ category, count }) => category.type !== OTHER_CATEGORY.type || count > 0).map(({ category }) => category);
}

/** SQLite UTC text sorts chronologically as a string. */
function newestStamp(items: readonly MarketPriceItem[]): string | null {
  return items.reduce<string | null>((max, i) => (max === null || i.valueAt > max ? i.valueAt : max), null);
}

export function buildMarketPrices({ league, rows, cx, rates }: MarketPricesInput): MarketPricesResponse {
  const items = rows.map((r) => toItem(r, cx));
  return {
    league,
    fetchedAt: newestStamp(items),
    rates:
      rates === null
        ? null
        : {
            exPerDiv: rates.rates.exaltPerDivine,
            chaosPerDiv: rates.rates.chaosPerDivine,
            source: rates.source,
            fetchedAt: rates.fetchedAt,
          },
    cxHour: cx?.newestHour ?? null,
    categories: categoriesOf(items),
    items,
  };
}
