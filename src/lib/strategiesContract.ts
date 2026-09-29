/*
 * GET /api/farm/strategies response: every curated strategy (src/core/strategies/schema.ts) plus
 * what the viewer's league adds — yield art and live exchange price, and a trade2 search link per
 * tablet mod. The route validates on the way out and the client on the way in.
 */
import { z } from "zod";
import { farmStrategySchema, tabletModSchema, tabletSchema, yieldSchema } from "../core/strategies/schema";

export const yieldPriceSchema = z
  .object({
    /** Divine per item; an unpriced yield is null, never 0. */
    div: z.number().positive(),
    ageMin: z.number().min(0),
    source: z.literal("ninja"),
  })
  .strict();
export type YieldPrice = z.infer<typeof yieldPriceSchema>;

export const yieldViewSchema = yieldSchema.extend({
  icon_url: z.string().url().nullable(),
  price: yieldPriceSchema.nullable(),
});

export const tabletModViewSchema = tabletModSchema.extend({
  /** Prefilled trade2 search for this tablet base with this mod; null when no stat id is known. */
  search_url: z.string().url().nullable(),
});

export const tabletViewSchema = tabletSchema.extend({ mods: z.array(tabletModViewSchema).min(1) });

export const strategyViewSchema = farmStrategySchema.extend({
  yields: z.array(yieldViewSchema).min(1),
  tablets: z.array(tabletViewSchema),
});

export const strategiesResponseSchema = z
  .object({
    computedLeague: z.string().min(1),
    /** Exalted per Divine for sub-Div prices; null before the first rate is known. */
    exPerDiv: z.number().positive().nullable(),
    /** Latest exchange snapshot time for the league (SQLite UTC text); null = never polled. */
    pricesFetchedAt: z.string().nullable(),
    strategies: z.array(strategyViewSchema),
  })
  .strict();

export type StrategyView = z.infer<typeof strategyViewSchema>;
export type YieldView = z.infer<typeof yieldViewSchema>;
export type TabletView = z.infer<typeof tabletViewSchema>;
export type StrategiesResponse = z.infer<typeof strategiesResponseSchema>;
