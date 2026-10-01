import { z } from "zod";

/*
 * Stash › Sell contract, shared by the routes, the pure planner (core/wealth) and the panel, so a
 * server-side shape change fails the client parse loudly instead of rendering blanks. Every Div
 * figure is PER UNIT unless its name says total. Unpriced is null — never 0.
 */

/** One stash item to plan: the planner merges duplicates by name. */
export interface PlanInput {
  name: string;
  qty: number;
}

export const currencySchema = z.enum(["DIVINE", "EXALT", "CHAOS"]);
export const denomSchema = z.object({ amount: z.number(), unit: currencySchema });
export const tierSchema = z.enum(["safe", "risky", "thin"]);

export const cxQuoteSchema = z.object({
  midDiv: z.number(),
  /** cx = GGG exchange VWAP of the newest stored hour; ninja = poe.ninja mid (no exchange history). */
  midSource: z.enum(["cx", "ninja"]),
  fastDiv: z.number(),
  patientDiv: z.number(),
  /** Per-unit mid in the currency to ask for — the one with the lowest gold fee within the cap. */
  denom: denomSchema,
  /** Currency units you receive for the whole order at mid (what the gold fee is charged on). */
  receiveUnits: z.number(),
  gridStepPct: z.number(),
  feeGold: z.number().nullable(),
  feeDivPerUnit: z.number().nullable(),
  /** False when the fee could not be priced — it is then unknown, never 0. */
  feeComplete: z.boolean(),
  unitsPerHour: z.number().nullable(),
  etaHours: z.number().nullable(),
  tier: tierSchema,
  /** True when flow and mid come from GGG's exchange history, false for the ninja fallback. */
  observed: z.boolean(),
  warnings: z.array(z.string()),
});
export type CxSellQuote = z.infer<typeof cxQuoteSchema>;

export const competitionSchema = z.object({
  listed: z.number(),
  /** Share of listings gone per poe2scout scrape; null when scout has too little history to say. */
  sellThrough: z.number().nullable(),
  samples: z.number(),
});
export type ListingCompetition = z.infer<typeof competitionSchema>;

export const tradeQuoteSchema = z.object({
  quickDiv: z.number(),
  fairDiv: z.number(),
  patientDiv: z.number(),
  /** Stash-tab note for one unit at the fair price, e.g. "~price 3 divine". */
  note: z.string(),
  noteDenom: denomSchema,
  competition: competitionSchema.nullable(),
  competitionNote: z.string().nullable(),
});
export type TradeListingQuote = z.infer<typeof tradeQuoteSchema>;

/** trade = the fair value of your own listing's trade2 comparables (reprice check). */
export const valueSourceSchema = z.enum(["cx", "ninja", "scout", "trade", "none"]);
export type ValueSource = z.infer<typeof valueSourceSchema>;
export const routeSchema = z.enum(["cx", "trade", "unpriced"]);
export type SellRoute = z.infer<typeof routeSchema>;

export const planRowSchema = z.object({
  name: z.string(),
  qty: z.number().int(),
  icon: z.string().nullable(),
  valueSource: valueSourceSchema,
  unitDiv: z.number().nullable(),
  cx: cxQuoteSchema.nullable(),
  trade: tradeQuoteSchema.nullable(),
  recommended: routeSchema,
  reason: z.string(),
  /** Totals for the recommended route, net of the gold fee we could price. Null when unpriced. */
  fastTotalDiv: z.number().nullable(),
  patientTotalDiv: z.number().nullable(),
  feeTotalDiv: z.number().nullable(),
  warnings: z.array(z.string()),
});
export type PlanRow = z.infer<typeof planRowSchema>;

export const planTotalsSchema = z.object({
  fastDiv: z.number(),
  patientDiv: z.number(),
  feeDiv: z.number(),
  unpricedCount: z.number().int(),
  /** Rows whose exchange fee could not be priced, so feeDiv understates the real cost. */
  feeIncompleteCount: z.number().int(),
});
export type PlanTotals = z.infer<typeof planTotalsSchema>;

export const planSchema = z.object({ rows: z.array(planRowSchema), totals: planTotalsSchema });
export type LiquidationPlan = z.infer<typeof planSchema>;

/** Where every number came from and how old it is — the panel shows these as chips. */
export const provenanceSchema = z.object({
  league: z.string(),
  rates: z.object({ exaltPerDivine: z.number(), chaosPerDivine: z.number() }),
  ratesSource: z.string(),
  ratesFetchedAt: z.string().nullable(),
  ninjaFetchedAt: z.string().nullable(),
  /** Unix seconds of the newest stored exchange hour, or null when there is no fresh history. */
  cxHour: z.number().nullable(),
  scoutAgeHours: z.number().nullable(),
});
export type SellProvenance = z.infer<typeof provenanceSchema>;

export const currencyIconsSchema = z.object({
  DIVINE: z.string().nullable(),
  EXALT: z.string().nullable(),
  CHAOS: z.string().nullable(),
});
export type CurrencyIcons = z.infer<typeof currencyIconsSchema>;

export const stashItemSchema = z.object({
  name: z.string(),
  qty: z.number().int(),
  rarity: z.string().nullable(),
  tabs: z.array(z.string()),
  /**
   * Your own per-unit ask, in Div (a stash note on a stack prices one unit), stack-weighted across
   * listings of the same item; null unless every listing of it was priced on the ladder. It is
   * what you ask, not what the market pays, so it never stands in for a value.
   */
  askDiv: z.number().nullable(),
  /** The item's longest-listed listing (the one most likely stuck) and when trade2 indexed it. */
  listingId: z.string().nullable(),
  listedAt: z.string().nullable(),
});
export type StashItem = z.infer<typeof stashItemSchema>;

export const listingCompSchema = z.object({
  listingId: z.string(),
  /** Trimmed median of the cheapest buyable comparables, per unit; null = none usable. */
  fairDiv: z.number().nullable(),
  cheapestDiv: z.number().nullable(),
  samples: z.number().int(),
  searchUrl: z.string().nullable(),
  checkedAt: z.string(),
});
export type ListingComp = z.infer<typeof listingCompSchema>;

export const VERDICTS = ["sell-cx", "list", "reprice", "hold", "unpriced"] as const;
export const verdictSchema = z.enum(VERDICTS);
export type SellVerdict = z.infer<typeof verdictSchema>;

export const sellRowSchema = planRowSchema.omit({ reason: true }).extend({
  rarity: z.string().nullable(),
  tabs: z.array(z.string()),
  askDiv: z.number().nullable(),
  /** poe.ninja 7-day change in %, exchange items only. */
  change7d: z.number().nullable(),
  verdict: verdictSchema,
  /** Per-unit price to post (exchange mid, list or reprice target); null for hold / unpriced and for an ask already under fair. */
  targetDiv: z.number().nullable(),
  /** The verdict in ≤80 characters, number-backed. */
  reason: z.string().max(80),
  /** Why the planner picked the exchange or trade route. */
  routeReason: z.string(),
  /** Stash note for targetDiv ("~price 3.2 divine"); null when nothing is to be listed. */
  note: z.string().nullable(),
  listingId: z.string().nullable(),
  listedAt: z.string().nullable(),
  comp: listingCompSchema.nullable(),
});
export type SellRow = z.infer<typeof sellRowSchema>;

export const sellTotalsSchema = planTotalsSchema.extend({
  // an object, not z.record: every verdict is always counted (a record of an enum types as partial)
  byVerdict: z.object({
    "sell-cx": z.number().int(),
    list: z.number().int(),
    reprice: z.number().int(),
    hold: z.number().int(),
    unpriced: z.number().int(),
  }),
});
export type SellTotals = z.infer<typeof sellTotalsSchema>;

export const soldSinceSchema = z.object({
  /** Listings in the previous read that are gone now: sold, or delisted/moved to a private tab. */
  count: z.number().int(),
  /** Σ your asks on those listings, in Div; null when none of them carried a ladder-priced ask. */
  askDiv: z.number().nullable(),
  names: z.array(z.string()),
  previousAt: z.string(),
});
export type SoldSince = z.infer<typeof soldSinceSchema>;

/** running = the poller took it; lost = unfinished but neither queued nor running (poller restart). */
export const REPRICE_STATES = ["idle", "queued", "running", "lost", "done", "failed"] as const;
export const repriceStatusSchema = z.object({
  state: z.enum(REPRICE_STATES),
  requestedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  /** Listings compared in the last finished run. */
  checked: z.number().int(),
  error: z.string().nullable(),
  /** End of the 6h cooldown; null when a check may be requested now. */
  nextAt: z.string().nullable(),
  /** Listings that qualify for a check right now (ask ≥ 1 Div, listed > 24h). */
  candidates: z.number().int(),
});
export type RepriceStatus = z.infer<typeof repriceStatusSchema>;

export const sellResponseSchema = z.object({
  league: z.string(),
  snapshot: z.object({ fetchedAt: z.string(), ageMin: z.number() }).nullable(),
  /** Why there is nothing to plan (null when rows were found). */
  reason: z.string().nullable(),
  rows: z.array(sellRowSchema),
  totals: sellTotalsSchema,
  provenance: provenanceSchema,
  currencyIcons: currencyIconsSchema,
  sold: soldSinceSchema.nullable(),
  reprice: repriceStatusSchema,
  warnings: z.array(z.string()),
});
export type SellResponse = z.infer<typeof sellResponseSchema>;

export const repriceResponseSchema = z.object({ queued: z.literal(true), nextAt: z.string() });
export type RepriceResponse = z.infer<typeof repriceResponseSchema>;
