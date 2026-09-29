import { z } from "zod";

/** Trade currencies a manual Ange price may be quoted in. */
export const ManualCcySchema = z.enum(["DIVINE", "EXALT", "CHAOS"]);
export type ManualCcy = z.infer<typeof ManualCcySchema>;

/**
 * One watchlist row as GET /api/watchlist returns it. `manual_stale` = the saved Ange prices are
 * older than MANUAL_STALE_HOURS, so the flip model already ignores them — the UI must not present
 * them as current either.
 */
export const WatchRowSchema = z.object({
  item_id: z.string(),
  item_name: z.string(),
  category: z.string(),
  active: z.number(),
  manual_buy_exalt: z.number().nullable(),
  manual_sell_chaos: z.number().nullable(),
  manual_buy_ccy: ManualCcySchema.nullable(),
  manual_sell_ccy: ManualCcySchema.nullable(),
  manual_stale: z.boolean(),
});
export type WatchRow = z.infer<typeof WatchRowSchema>;

export const WatchlistResponseSchema = z.object({ watchlist: z.array(WatchRowSchema) });
export type WatchlistResponse = z.infer<typeof WatchlistResponseSchema>;
