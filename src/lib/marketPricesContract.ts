import { z } from "zod";

/**
 * GET /api/market/prices — every exchange item of the caller's league, poe.ninja-style. Pure zod,
 * client-safe: the route parses its own body on the way out and the Prices tool parses it on the
 * way in, so a drifted field fails with its name instead of rendering as a blank cell.
 *
 * Units: every `*Div` is the Divine price of ONE item (poe.ninja primaryValue, never inverted).
 * Unknown is null, never 0. Timestamps are SQLite UTC text ("YYYY-MM-DD HH:MM:SS").
 */

const finite = z.number().finite();
const stamp = z.string().min(1);

export const PRICE_VOLUME_SOURCES = ["cx", "ninja"] as const;
export type PriceVolumeSource = (typeof PRICE_VOLUME_SOURCES)[number];

export const marketPriceItemSchema = z.object({
  itemId: z.string().min(1),
  name: z.string().min(1),
  /** poe.ninja exchange type (price_snapshots.category), as stored: what the watchlist persists. */
  category: z.string().min(1),
  /** The rail category the item is filed under: `category`, or "Other" when nobody labelled it. */
  railCategory: z.string().min(1),
  icon: z.string().nullable(),
  /** poe.ninja value; null when ninja lists the item without a price. */
  valueDiv: finite.positive().nullable(),
  /** When the value row was written (source: poe.ninja). */
  valueAt: stamp,
  /** poe.ninja 7-day % change and its cumulative-% sparkline. */
  change7d: finite.nullable(),
  spark7d: z.array(finite).nullable(),
  /** When the 7-day trend was last refreshed; null when ninja never sent one. */
  trendAt: stamp.nullable(),
  /** Units per hour: Currency Exchange 6h mean (cx), else poe.ninja volume ÷ value (unit unverified). */
  volumePerHour: finite.nonnegative().nullable(),
  volumeSource: z.enum(PRICE_VOLUME_SOURCES).nullable(),
  /** Currency Exchange mid and band, when the exchange has a fresh market for the item. */
  cxMidDiv: finite.positive().nullable(),
  cxBand: z.object({ low: finite, high: finite }).nullable(),
});
export type MarketPriceItem = z.infer<typeof marketPriceItemSchema>;

export const marketPriceCategorySchema = z.object({
  /** poe.ninja exchange type, or "Other" for the bucket of unlabelled types. */
  type: z.string().min(1),
  slug: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().nullable(),
});
export type MarketPriceCategory = z.infer<typeof marketPriceCategorySchema>;

export const marketPricesResponseSchema = z.object({
  league: z.string().min(1),
  /** Newest value row of the league; null when nothing was ever polled. */
  fetchedAt: stamp.nullable(),
  rates: z
    .object({
      exPerDiv: finite.positive(),
      chaosPerDiv: finite.positive(),
      source: z.enum(["cx", "ninja", "scout"]),
      fetchedAt: stamp.nullable(),
    })
    .nullable(),
  /** Unix seconds of the Currency Exchange hour the cx fields describe; null = no fresh exchange data. */
  cxHour: z.number().int().positive().nullable(),
  categories: z.array(marketPriceCategorySchema),
  items: z.array(marketPriceItemSchema),
});
export type MarketPricesResponse = z.infer<typeof marketPricesResponseSchema>;
