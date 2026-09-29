import { z } from "zod";

/** Trade currencies a manual Ange price may be quoted in. */
export const ManualCcySchema = z.enum(["DIVINE", "EXALT", "CHAOS"]);
export type ManualCcy = z.infer<typeof ManualCcySchema>;

/**
 * One watchlist row as GET /api/watchlist returns it. `manual_stale` = the saved Ange prices are
 * older than MANUAL_STALE_HOURS, so the flip model already ignores them — the UI must not present
 * them as current either. `league` = the market the row (and its prices) belongs to; null for
 * legacy rows from before league stamping.
 */
export const WatchRowSchema = z.object({
  item_id: z.string(),
  item_name: z.string(),
  category: z.string(),
  league: z.string().nullable(),
  active: z.number(),
  manual_buy_exalt: z.number().nullable(),
  manual_sell_chaos: z.number().nullable(),
  manual_buy_ccy: ManualCcySchema.nullable(),
  manual_sell_ccy: ManualCcySchema.nullable(),
  manual_stale: z.boolean(),
});
export type WatchRow = z.infer<typeof WatchRowSchema>;

/** Every row in every league, plus the league the caller is viewing now. */
export const WatchlistResponseSchema = z.object({ league: z.string(), watchlist: z.array(WatchRowSchema) });
export type WatchlistResponse = z.infer<typeof WatchlistResponseSchema>;

/** Same market, compared the way SQL does (COLLATE NOCASE); an untagged row is no market's. */
export function inLeague(row: Pick<WatchRow, "league">, league: string): boolean {
  return row.league != null && row.league.toLowerCase() === league.toLowerCase();
}

const QuoteSchema = z.object({ amount: z.number().positive(), ccy: ManualCcySchema });

/**
 * PATCH /api/watchlist. `set` records prices observed in the caller's CURRENT league (the server
 * re-stamps the row there, so it needs the item's name and category to create it); `clear` drops
 * the row's saved prices.
 */
export const ManualPricesBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set"),
    itemId: z.string().min(1),
    itemName: z.string().min(1),
    category: z.string().min(1),
    buy: QuoteSchema,
    sell: QuoteSchema,
  }),
  z.object({ action: z.literal("clear"), itemId: z.string().min(1) }),
]);
export type ManualPricesBody = z.infer<typeof ManualPricesBodySchema>;
