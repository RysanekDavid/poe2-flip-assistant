import { z } from "zod";
import { SnipeCardSchema, Trade2Url } from "./snipeCard";
import { NearMissSchema } from "./snipeScanContract";
import { UNIQUE_VALUE_SOURCES } from "./marketUniquesContract";

/**
 * GET /api/market/opportunities and GET /api/market/opportunities/listings — Trade › Opportunities,
 * "what to buy on the trade site now". Pure zod, client-safe: each route parses its body on the way
 * out and the tool parses it on the way in.
 *
 * Units: every `…Div` is the Divine price of ONE item, never inverted. Unknown is null, never 0.
 */

const finite = z.number().finite();
const iso = z.string().datetime();
const count = z.number().int().nonnegative();

/**
 * The automatic budget: a share of the viewer's latest net worth. No net worth yet → no cap, and the
 * tool says so instead of inventing one.
 */
export const budgetSchema = z
  .object({
    netWorthDiv: finite.positive().nullable(),
    /** When that net worth was read (sqlite UTC text); null with no net worth. */
    netWorthAt: z.string().nullable(),
    capDiv: finite.positive().nullable(),
    /** The share of net worth the cap is, in percent (BUDGET_SHARE_OF_NET_WORTH × 100). */
    sharePct: finite.positive(),
  })
  .refine((b) => (b.netWorthDiv === null) === (b.capDiv === null), "budget: a cap needs a net worth and a net worth gives a cap");
export type Budget = z.infer<typeof budgetSchema>;

/** A SNIPE alert of the viewer whose listing is still fresh and not known to be gone. */
export const liveSnipeSchema = z.object({
  alertId: z.number().int(),
  listingId: z.string().min(1),
  seen: z.number().int(),
  /** When the alert fired (sqlite UTC text, as the Alerts feed carries it). */
  createdAt: z.string(),
  /** The alert's league when it differs from the viewer's. */
  foreignLeague: z.string().nullable(),
  card: SnipeCardSchema,
});
export type LiveSnipe = z.infer<typeof liveSnipeSchema>;

export const snipeSectionSchema = z.object({
  cards: z.array(liveSnipeSchema),
  nearMisses: z.array(NearMissSchema),
  /** Snipes and near-misses hidden because they cost more than the budget cap. */
  overBudget: count,
  /** Whether the background scanner runs at all (off → the empty state says so). */
  scannerEnabled: z.boolean(),
  /** Why the last scan report cannot be read; null when it can (or there is none yet). */
  reportError: z.string().nullable(),
});
export type SnipeSection = z.infer<typeof snipeSectionSchema>;

export const risingUniqueSchema = z.object({
  /** poe2scout ItemId as text. */
  id: z.string().min(1),
  name: z.string().min(1),
  base: z.string(),
  icon: z.string().nullable(),
  valueDiv: finite.positive(),
  valueSource: z.enum(UNIQUE_VALUE_SOURCES),
  /** Price change older half → newer half of the recent points (medians), in percent. */
  priceChangePct: finite,
  /** Median listing count of the older half, then the newer half — supply, never sales. */
  listedThen: count,
  listedNow: count,
  spark: z.array(finite),
  /** Recent points the trend stands on. */
  points: z.number().int().positive(),
  newestAt: iso,
});
export type RisingUnique = z.infer<typeof risingUniqueSchema>;

export const risingSectionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    items: z.array(risingUniqueSchema),
    overBudget: count,
    /** The newest poe2scout point of any unique; null when scout has none this league. */
    newestPointAt: iso.nullable(),
    /** Why the list is empty, in one sentence; null when it has rows. */
    emptyReason: z.string().min(1).nullable(),
  }),
  z.object({ status: z.literal("error"), error: z.string().min(1) }),
]);
export type RisingSection = z.infer<typeof risingSectionSchema>;

export const opportunitiesResponseSchema = z.object({
  /** The market the data describes: the scanner, scout and net worth all run in the default league. */
  league: z.string().min(1),
  viewerLeague: z.string().min(1),
  generatedAt: iso,
  budget: budgetSchema,
  snipes: snipeSectionSchema,
  rising: risingSectionSchema,
});
export type OpportunitiesResponse = z.infer<typeof opportunitiesResponseSchema>;

export const liveListingSchema = z.object({
  price: z.object({ amount: finite.positive(), currency: z.string().min(1).max(40) }).nullable(),
  account: z.string(),
  online: z.boolean(),
  indexed: z.string().nullable(),
  mods: z.array(z.string()),
});
export type LiveListing = z.infer<typeof liveListingSchema>;

export const LIVE_LISTINGS_SHOWN = 5;

export const listingsResponseSchema = z.object({
  name: z.string().min(1),
  total: count,
  searchUrl: Trade2Url,
  listings: z.array(liveListingSchema).max(LIVE_LISTINGS_SHOWN),
  /** A shared cache hit: it spent nothing and did not count against the hourly cap. */
  cached: z.boolean(),
  fetchedAt: iso,
});
export type ListingsResponse = z.infer<typeof listingsResponseSchema>;

/** A unique name as the listings route accepts it. */
export const listingsQuerySchema = z.object({ name: z.string().trim().min(1).max(120), base: z.string().trim().max(120).optional() });
