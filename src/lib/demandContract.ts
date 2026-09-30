import { z } from "zod";

/*
 * Market › board "Unique demand" contract, shared by GET /api/demand and the panel so a shape
 * change fails the client parse loudly. Log-derived figures are null when poe2scout has no
 * history to compute them from — never 0, which would read as "nothing sells".
 */

/**
 * ok = enough listings and log points; thin = too few listings, or a log too short to trust;
 * noisy = the headline ask was an outlier vs the recent log; no-history = poe2scout has no recent
 * log for it at all, which says nothing about the market, so it is not "thin".
 */
export const demandTrustSchema = z.enum(["ok", "thin", "noisy", "no-history"]);
export type DemandTrust = z.infer<typeof demandTrustSchema>;

export const demandRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  category: z.string(),
  icon: z.string().nullable(),
  /** Cheapest listed ask (poe2scout CurrentPrice, outlier-guarded) in Divine — NOT a sale price. */
  marketDivine: z.number(),
  /** ISO time poe2scout last set this price; null = unknown. */
  priceAt: z.string().nullable(),
  quantity: z.number(), // live listing count
  listedAvg: z.number().nullable(), // average listing count over the log (supply, not flow)
  sellThrough: z.number().nullable(), // avg per-step FRACTION of listings gone (0..1) — a proxy
  momentumPct: z.number().nullable(),
  spark: z.array(z.number()), // log prices oldest→newest — row sparkline
  heat: z.number().nullable(), // 0–100: sell-through proxy + positive momentum (core/demandHeat)
  trust: demandTrustSchema,
  divergePct: z.number(), // |shown − headline| / shown, % — >0 only when the outlier guard fired
  tradeUrl: z.string(),
});
export type DemandRow = z.infer<typeof demandRowSchema>;

export const demandResponseSchema = z.object({
  rows: z.array(demandRowSchema),
  computedLeague: z.string(),
  fetchedAt: z.string(),
  exaltPerDivine: z.number(),
  /** False when no row has a single recent log point: sell-through, trend and heat are unknown board-wide. */
  historyAvailable: z.boolean(),
  /** Degradations the board must show: a failed category, missing price ages. */
  warnings: z.array(z.string()),
});
export type DemandResponse = z.infer<typeof demandResponseSchema>;
