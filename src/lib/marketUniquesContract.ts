import { z } from "zod";

/**
 * GET /api/market/prices/uniques — the UNIQUES group of Trade › Prices. Pure zod, client-safe:
 * the route parses its own body on the way out and the Prices tool parses it on the way in.
 *
 * Units: `valueDiv` is the Divine price of ONE unique (poe2scout's Exalted ask ÷ scout's own
 * Exalted-per-Divine, or a trade2 fallback already in Divine); never inverted, never 0 — unknown
 * is null with a reason. Timestamps are ISO-8601 UTC.
 */

const finite = z.number().finite();
const iso = z.string().datetime();

/** scout = poe2scout's current price; trade = the trade-site fallback scout had no price for. */
export const UNIQUE_VALUE_SOURCES = ["scout", "trade"] as const;
export type UniqueValueSource = (typeof UNIQUE_VALUE_SOURCES)[number];

export const marketUniqueItemSchema = z
  .object({
    /** poe2scout ItemId as text: the row key. */
    id: z.string().min(1),
    name: z.string().min(1),
    /** Base type ("Silk Robe"); empty when scout sends none. */
    base: z.string(),
    /** poe2scout CategoryApiId (weapon, armour, …). */
    category: z.string().min(1),
    icon: z.string().nullable(),
    valueDiv: finite.positive().nullable(),
    valueSource: z.enum(UNIQUE_VALUE_SOURCES).nullable(),
    /** Why there is no value (null while there is one). */
    unpricedReason: z.string().min(1).nullable(),
    /** When the shown price was set: scout's newest history point, or the trade search. */
    priceAt: iso.nullable(),
    /** Listings behind the shown price (scout's live count, or what the trade search saw). */
    listings: z.number().int().nonnegative().nullable(),
    /** Price change over poe2scout's last 7 days; null when that history is too thin. */
    change7d: finite.nullable(),
    /** poe2scout price points inside the 7-day window, oldest → newest. */
    spark7d: z.array(finite),
  })
  .superRefine((item, ctx) => {
    if ((item.valueDiv === null) !== (item.valueSource === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${item.name}: valueDiv and valueSource must both be set or both null` });
    }
    if ((item.valueDiv === null) !== (item.unpricedReason !== null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${item.name}: an unpriced unique needs a reason, a priced one none` });
    }
  });
export type MarketUniqueItem = z.infer<typeof marketUniqueItemSchema>;

export const marketUniqueCategorySchema = z.object({
  /** poe2scout CategoryApiId. */
  id: z.string().min(1),
  slug: z.string().min(1),
  label: z.string().min(1),
  /** The priciest unique's art; null when no row of the category has any. */
  icon: z.string().nullable(),
});
export type MarketUniqueCategory = z.infer<typeof marketUniqueCategorySchema>;

export const marketUniquesResponseSchema = z.object({
  /** The league the prices describe: poe2scout is fetched for the app's default league only. */
  league: z.string().min(1),
  /** The caller's own league; differs from `league` when they pinned another one. */
  viewerLeague: z.string().min(1),
  /** When poe2scout was read (the shared demand cache fill). */
  fetchedAt: iso,
  /** poe2scout's Exalted per Divine, the rate every scout value was converted with. */
  exPerDiv: finite.positive(),
  categories: z.array(marketUniqueCategorySchema),
  items: z.array(marketUniqueItemSchema),
  /** Degradations the tool must show: a failed category, missing price history. */
  warnings: z.array(z.string()),
});
export type MarketUniquesResponse = z.infer<typeof marketUniquesResponseSchema>;
