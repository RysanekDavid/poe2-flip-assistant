import { z } from "zod";

/*
 * Liquidate tool contract, shared by the routes, the pure planner (core/tools/liquidate) and the
 * panel, so a server-side shape change fails the client parse loudly instead of rendering blanks.
 * Every Div figure is PER UNIT unless its name says total.
 */

export const LIQUIDATE_MAX_ITEMS = 200;
export const LIQUIDATE_MAX_QTY = 100_000;
export const LIQUIDATE_MAX_NAME = 120;

export const liquidateInputSchema = z.object({
  name: z.string().trim().min(1).max(LIQUIDATE_MAX_NAME),
  qty: z.number().int().min(1).max(LIQUIDATE_MAX_QTY),
  /** Your own per-unit value — the only way a rare (or anything the market can't see) gets priced. */
  manualDiv: z.number().finite().positive().optional(),
});
export type LiquidateInput = z.infer<typeof liquidateInputSchema>;

export const liquidateRequestSchema = z.object({
  items: z.array(liquidateInputSchema).min(1).max(LIQUIDATE_MAX_ITEMS),
});

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
  sellThrough: z.number(),
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

export const valueSourceSchema = z.enum(["cx", "ninja", "scout", "manual", "none"]);
export type ValueSource = z.infer<typeof valueSourceSchema>;
export const routeSchema = z.enum(["cx", "trade", "manual"]);
export type LiquidateRoute = z.infer<typeof routeSchema>;

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

export const bundleSchema = z.object({
  /** Trade-chat WTS lines, each within the chat length bound (core/tools/liquidate/bundle). */
  lines: z.array(z.string()),
  notes: z.array(z.object({ name: z.string(), note: z.string() })),
});
export type LiquidateBundle = z.infer<typeof bundleSchema>;

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
export type LiquidateProvenance = z.infer<typeof provenanceSchema>;

export const currencyIconsSchema = z.object({
  DIVINE: z.string().nullable(),
  EXALT: z.string().nullable(),
  CHAOS: z.string().nullable(),
});
export type CurrencyIcons = z.infer<typeof currencyIconsSchema>;

export const liquidateResponseSchema = z.object({
  provenance: provenanceSchema,
  currencyIcons: currencyIconsSchema,
  plan: planSchema,
  bundle: bundleSchema,
  warnings: z.array(z.string()),
});
export type LiquidateResponse = z.infer<typeof liquidateResponseSchema>;

export const suggestionSchema = z.object({
  name: z.string(),
  kind: z.enum(["exchange", "unique"]),
  icon: z.string().nullable(),
});
export type LiquidateSuggestion = z.infer<typeof suggestionSchema>;
export const suggestResponseSchema = z.object({ items: z.array(suggestionSchema), warning: z.string().nullable() });

export const stashItemSchema = z.object({
  name: z.string(),
  qty: z.number().int(),
  rarity: z.string().nullable(),
  tabs: z.array(z.string()),
  /**
   * Your own per-unit ask, in Div (a stash note on a stack prices one unit), stack-weighted across
   * listings of the same item; null unless every listing of it was priced on the ladder. It is
   * what you ask, not what the market pays, so the panel shows it as a hint, never as a value.
   */
  askDiv: z.number().nullable(),
});
export type StashItem = z.infer<typeof stashItemSchema>;

export const stashResponseSchema = z.object({
  league: z.string(),
  items: z.array(stashItemSchema),
  /** Why there is nothing to import (null when items were found). */
  reason: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  ageMin: z.number().nullable(),
  skippedOrbs: z.number().int(),
});
export type StashResponse = z.infer<typeof stashResponseSchema>;

/** A draft row in the panel (persisted to localStorage). */
export const draftItemSchema = liquidateInputSchema.extend({ askDiv: z.number().nullable().optional() });
export type DraftItem = z.infer<typeof draftItemSchema>;
export const draftSchema = z.array(draftItemSchema).max(LIQUIDATE_MAX_ITEMS);
