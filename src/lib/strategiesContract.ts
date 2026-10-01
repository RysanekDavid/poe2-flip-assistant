/*
 * GET /api/farm/strategies response: every curated strategy of every kind
 * (src/core/strategies/schema.ts) plus what the viewer's league adds — art and the live exchange
 * price of each catalog ref, the live EV of each priced conversion, and a trade2 search link per
 * target mod. One route serves Farm › Strategies (kind farm), Craft › Roll & sell and Trade ›
 * Methods; each filters by kind client-side. The route validates on the way out and the client on
 * the way in.
 */
import { z } from "zod";
import {
  conversionSchema,
  entityRefSchema,
  farmStrategySchema,
  mechanicSchema,
  rollAndSellStrategySchema,
  rollStepSchema,
  tabletModSchema,
  tabletSchema,
  tradeLegSchema,
  tradeStrategySchema,
  yieldSchema,
} from "../core/strategies/schema";

export const yieldPriceSchema = z
  .object({
    /** Divine per item; an unpriced item is null, never 0. */
    div: z.number().positive(),
    ageMin: z.number().min(0),
    /** poe.ninja 7-day change, percent; null when ninja has no trend for the item. */
    change7d: z.number().nullable(),
    source: z.literal("ninja"),
  })
  .strict();

/** Weighted 7-day price move of a set of drops (core/strategies/trend.ts) — a price move, never Div/hour. */
export const trendSchema = z
  .object({
    change7d: z.number(),
    /** Drops with a price and a 7-day change that the trend is computed from. */
    counted: z.number().int().min(1),
    /** Every drop in the set, priced or not. */
    total: z.number().int().min(1),
  })
  .strict();
export type Trend = z.infer<typeof trendSchema>;

/** One mechanic chip of the filter: the trend over the drops of every farm strategy that touches it. */
export const mechanicTrendSchema = z
  .object({
    mechanic: mechanicSchema,
    trend: trendSchema.nullable(),
  })
  .strict();
export type MechanicTrend = z.infer<typeof mechanicTrendSchema>;
export type YieldPrice = z.infer<typeof yieldPriceSchema>;

export const yieldViewSchema = yieldSchema.extend({
  icon_url: z.string().url().nullable(),
  price: yieldPriceSchema.nullable(),
});

export const tabletModViewSchema = tabletModSchema.extend({
  /** Prefilled trade2 search for this base with this mod; null when no stat id is known. */
  search_url: z.string().url().nullable(),
});

export const tabletViewSchema = tabletSchema.extend({ mods: z.array(tabletModViewSchema).min(1) });

export const strategyViewSchema = farmStrategySchema.extend({
  yields: z.array(yieldViewSchema).min(1),
  tablets: z.array(tabletViewSchema),
  /** The card headline; null when no drop has both a price and a 7-day change. */
  trend: trendSchema.nullable(),
});

/** A catalog item as a card draws it: art and today's exchange price (null = unpriced, never 0). */
export const pricedRefSchema = entityRefSchema.extend({
  icon_url: z.string().url().nullable(),
  price: yieldPriceSchema.nullable(),
});

/** core/strategies/ev.ts: EV only when every leg is priced, else the legs that are not. */
export const conversionEvSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("priced"), cost_div: z.number().min(0), value_div: z.number().min(0), ev_div: z.number() }).strict(),
  z.object({ status: z.literal("unpriced"), missing: z.array(z.string().min(1)).min(1) }).strict(),
]);
export type ConversionEvView = z.infer<typeof conversionEvSchema>;

const conversionLegViewSchema = z.object({ ref: pricedRefSchema, qty: z.number().int().min(1) }).strict();

export const conversionViewSchema = conversionSchema.extend({
  inputs: z.array(conversionLegViewSchema).min(1),
  outputs: z.array(conversionLegViewSchema).min(1),
  ev: conversionEvSchema,
});

export const tradeLegViewSchema = tradeLegSchema.extend({ ref: pricedRefSchema.nullable() });

export const rollSellViewSchema = rollAndSellStrategySchema.extend({
  target_mods: z.array(tabletModViewSchema),
  roll_steps: z.array(rollStepSchema.extend({ currencies: z.array(pricedRefSchema) })).min(1),
  sell_ref: pricedRefSchema.nullable(),
  price_refs: z.array(conversionViewSchema),
});

export const tradeMethodViewSchema = tradeStrategySchema.extend({
  inputs: z.array(tradeLegViewSchema).min(1),
  outputs: z.array(tradeLegViewSchema).min(1),
  price_refs: z.array(conversionViewSchema),
});

export const anyStrategyViewSchema = z.discriminatedUnion("kind", [strategyViewSchema, rollSellViewSchema, tradeMethodViewSchema]);

export const strategiesResponseSchema = z
  .object({
    computedLeague: z.string().min(1),
    /** Exalted per Divine for sub-Div prices; null before the first rate is known. */
    exPerDiv: z.number().positive().nullable(),
    /** Latest exchange snapshot time for the league (SQLite UTC text); null = never polled. */
    pricesFetchedAt: z.string().nullable(),
    strategies: z.array(anyStrategyViewSchema),
    /** Mechanics at least one farm strategy covers, in schema order. */
    mechanics: z.array(mechanicTrendSchema),
  })
  .strict();

/** A farm strategy's view (Farm › Strategies). */
export type StrategyView = z.infer<typeof strategyViewSchema>;
export type AnyStrategyView = z.infer<typeof anyStrategyViewSchema>;
export type RollSellView = z.infer<typeof rollSellViewSchema>;
export type TradeMethodView = z.infer<typeof tradeMethodViewSchema>;
export type ConversionView = z.infer<typeof conversionViewSchema>;
export type TradeLegView = z.infer<typeof tradeLegViewSchema>;
export type PricedRef = z.infer<typeof pricedRefSchema>;
export type YieldView = z.infer<typeof yieldViewSchema>;
export type TabletView = z.infer<typeof tabletViewSchema>;
export type TabletModView = z.infer<typeof tabletModViewSchema>;
export type StrategiesResponse = z.infer<typeof strategiesResponseSchema>;

/** The views of one kind, narrowed to that kind's type. */
export function viewsOfKind<K extends AnyStrategyView["kind"]>(views: readonly AnyStrategyView[], kind: K): Extract<AnyStrategyView, { kind: K }>[] {
  return views.filter((v): v is Extract<AnyStrategyView, { kind: K }> => v.kind === kind);
}
