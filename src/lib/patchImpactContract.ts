import { z } from "zod";
import { patchThreadIdSchema } from "./patchesContract";

/**
 * GET /api/patches/:threadId/impact — how exchange prices moved around a patch. Pure zod: the
 * route parses its response with it and PatchImpactPanel parses it again in the browser.
 *
 * Every Div and % is nullable: null means "no snapshot close enough" (or the horizon has not
 * happened yet), never 0 — a 0 % move is a real, flat market.
 */

export const patchImpactParamsSchema = z.object({ threadId: patchThreadIdSchema });

export const PATCH_TEXT_SOURCES = ["title", "body", "summary"] as const;
export type PatchTextSource = (typeof PATCH_TEXT_SOURCES)[number];
const sourcesSchema = z.array(z.enum(PATCH_TEXT_SOURCES)).min(1);

export const HORIZON_KEYS = ["h24", "h72", "d7"] as const;
export type HorizonKey = (typeof HORIZON_KEYS)[number];

export const HORIZON_HOURS: Record<HorizonKey, number> = { h24: 24, h72: 72, d7: 168 };
export const HORIZON_LABEL: Record<HorizonKey, string> = { h24: "+24h", h72: "+72h", d7: "+7d" };

/** How the patch instant was derived — shown as "patch time ≈ …". */
export const PATCH_TIME_SOURCES = ["published_at", "published_text", "first_seen"] as const;
export type PatchTimeSource = (typeof PATCH_TIME_SOURCES)[number];

const pointSchema = z.object({ div: z.number().positive().nullable(), pct: z.number().nullable() });
const pointsSchema = z.object({ h24: pointSchema, h72: pointSchema, d7: pointSchema });
export type ImpactPoint = z.infer<typeof pointSchema>;

export const impactItemSchema = z.object({
  itemId: z.string().min(1),
  name: z.string().min(1),
  category: z.string(),
  icon: z.string().nullable(),
  sources: sourcesSchema,
  preDiv: z.number().positive().nullable(),
  points: pointsSchema,
});
export type ImpactItem = z.infer<typeof impactItemSchema>;

const medianSchema = z.object({ pct: z.number().nullable(), n: z.number().int().nonnegative() });

export const impactCategorySchema = z.object({
  category: z.string().min(1),
  /** Keywords that pointed at the category (empty when only a named item did). */
  keywords: z.array(z.string()),
  sources: sourcesSchema,
  /** Median % over every item of the category with both a pre and a horizon price. */
  medians: z.object({ h24: medianSchema, h72: medianSchema, d7: medianSchema }),
});
export type ImpactCategory = z.infer<typeof impactCategorySchema>;

export const LIKELY_KINDS = ["unique", "base", "exchange"] as const;
export const likelyAffectedSchema = z.object({
  name: z.string().min(1),
  /** unique = poe2scout (no stored history); base = craft catalog; exchange = CX name ninja never priced. */
  kind: z.enum(LIKELY_KINDS),
  sources: sourcesSchema,
});
export type LikelyAffected = z.infer<typeof likelyAffectedSchema>;

export const IMPACT_BANNERS = ["history_not_retained", "no_pre_data", "no_history_league"] as const;
export type ImpactBanner = (typeof IMPACT_BANNERS)[number];

export const patchImpactResponseSchema = z.object({
  threadId: z.number().int().positive(),
  patchTime: z.object({
    at: z.string().datetime(),
    source: z.enum(PATCH_TIME_SOURCES),
    /** The raw text it came from (forum date text or a stored timestamp). */
    raw: z.string(),
  }),
  /** Polled league with the most snapshots around the patch; null when none were stored. */
  league: z.string().nullable(),
  /** Horizons already reached (a 3-day-old patch has no +7d yet). */
  due: z.object({ h24: z.boolean(), h72: z.boolean(), d7: z.boolean() }),
  banner: z.enum(IMPACT_BANNERS).nullable(),
  retentionDays: z.number().int().positive(),
  items: z.array(impactItemSchema),
  categories: z.array(impactCategorySchema),
  likelyAffected: z.array(likelyAffectedSchema),
  computedAt: z.string().datetime(),
});
export type PatchImpactResponse = z.infer<typeof patchImpactResponseSchema>;

const PATCH_TIME_LABEL: Record<PatchTimeSource, string> = {
  published_at: "forum timestamp",
  published_text: "forum date read as UTC",
  first_seen: "when our watcher first saw the thread",
};

export function patchTimeSourceLabel(source: PatchTimeSource): string {
  return PATCH_TIME_LABEL[source];
}

const BANNER_TEXT: Record<ImpactBanner, string> = {
  history_not_retained: "Price history before this patch is no longer kept — snapshots are pruned after the retention window.",
  no_pre_data: "No price snapshot from just before this patch, so moves cannot be measured.",
  no_history_league: "No league had price snapshots around this patch.",
};

export function impactBannerText(banner: ImpactBanner, retentionDays: number): string {
  return banner === "history_not_retained" ? `${BANNER_TEXT[banner]} (${retentionDays} days)` : BANNER_TEXT[banner];
}
