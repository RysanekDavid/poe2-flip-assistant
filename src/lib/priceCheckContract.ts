import { z } from "zod";

/**
 * POST /api/pricecheck and POST /api/pricecheck/live. Shared by the routes, core/pricecheck and the
 * Trade › Price check panel, so a server-side shape change fails the client parse loudly instead
 * of rendering blanks. Client-safe: no server imports. Every Div figure is nullable — unknown is
 * null, never 0 — and per unit unless its name says total.
 */

export const PRICE_CHECK_MAX_TEXT = 8000;

export const priceCheckRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "paste an item (Ctrl+C in game)")
    .max(PRICE_CHECK_MAX_TEXT, `item text is over ${PRICE_CHECK_MAX_TEXT} characters`),
});

export const valueOriginSchema = z.enum(["cx", "ninja", "scout", "book", "trade"]);
export type ValueOrigin = z.infer<typeof valueOriginSchema>;

/** Where the value came from, how many prices stand behind it and how old they are. */
export const confidenceSchema = z.object({
  /** Null when nothing priced the item. */
  source: valueOriginSchema.nullable(),
  /** Prices behind the value; null when the source does not expose a count (poe.ninja, exchange). */
  samples: z.number().int().nonnegative().nullable(),
  /** Minutes since the source's data was observed; null when unknown. */
  ageMin: z.number().nonnegative().nullable(),
});
export type PriceConfidence = z.infer<typeof confidenceSchema>;

export const hintActionSchema = z.enum(["sell-cx", "list", "hold", "none"]);
export type HintAction = z.infer<typeof hintActionSchema>;

/** Sell now on the exchange (after the gold fee), list on trade at a price, or hold. */
export const sellHintSchema = z.object({
  action: hintActionSchema,
  reason: z.string(),
  /** Whole stack sold into the exchange at the fast / patient price, net of the fee we could price. */
  cxFastTotalDiv: z.number().nullable(),
  cxPatientTotalDiv: z.number().nullable(),
  feeTotalDiv: z.number().nullable(),
  /** Exchange liquidity tier and time to fill, when the item trades there. */
  tier: z.enum(["safe", "risky", "thin"]).nullable(),
  etaHours: z.number().nullable(),
  /** Per-unit trade listing prices. */
  listAtDiv: z.number().nullable(),
  quickDiv: z.number().nullable(),
  patientDiv: z.number().nullable(),
  /** Stash-tab note for one unit at the fair price, e.g. "~price 3 divine". */
  note: z.string().nullable(),
  competitionNote: z.string().nullable(),
});
export type SellHint = z.infer<typeof sellHintSchema>;

/** Whether the "value live · 1 search" button may run, and why not when it may not. */
export const liveGateSchema = z.object({ allowed: z.boolean(), reason: z.string().nullable() });
export type LiveGate = z.infer<typeof liveGateSchema>;

const baseSchema = z.object({
  league: z.string(),
  name: z.string(),
  baseType: z.string(),
  icon: z.string().nullable(),
  qty: z.number().int().positive(),
  unitDiv: z.number().positive().nullable(),
  totalDiv: z.number().positive().nullable(),
  exPerDiv: z.number().positive().nullable(),
  confidence: confidenceSchema,
  hint: sellHintSchema,
  /** Trade-site search for this item (0 budget: a prefilled URL, not a search); null for exchange items. */
  tradeUrl: z.string().url().nullable(),
  /** Query string of the Craft › Paste item deep link; null when the item cannot be crafted on or is too long. */
  craftQuery: z.string().nullable(),
  live: liveGateSchema,
  warnings: z.array(z.string()),
});

/** Fields every kind carries. */
export type PriceCheckBase = z.infer<typeof baseSchema>;

export const priceCheckResponseSchema = z.discriminatedUnion("kind", [
  baseSchema.extend({
    kind: z.literal("currency"),
    /** False for a Currency-rarity stack poe.ninja does not list: it is priced and sold on trade. */
    onExchange: z.boolean(),
  }),
  baseSchema.extend({ kind: z.literal("unique") }),
  baseSchema.extend({
    kind: z.literal("rare"),
    /** Mods resolved to trade stats for the book signature; null when the book was not read. */
    resolvedMods: z.number().int().nonnegative().nullable(),
    bookError: z.string().nullable(),
  }),
  baseSchema.extend({ kind: z.literal("other") }),
]);
export type PriceCheckResponse = z.infer<typeof priceCheckResponseSchema>;

export const priceCheckLiveResponseSchema = z.object({
  kind: z.enum(["currency", "unique", "rare"]),
  valueDiv: z.number().positive().nullable(),
  minDiv: z.number().positive().nullable(),
  samples: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  dropped: z.number().int().nonnegative(),
  unrated: z.number().int().nonnegative(),
  searchUrl: z.string().url(),
  /** How the comparables became one value, for the tooltip. */
  method: z.string(),
  hint: sellHintSchema,
});
export type PriceCheckLiveResponse = z.infer<typeof priceCheckLiveResponseSchema>;
