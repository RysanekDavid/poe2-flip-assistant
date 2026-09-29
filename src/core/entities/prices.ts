/*
 * Current poe.ninja exchange prices keyed by entity `exchange_id` (the trade2 static id, which is
 * also the ninja exchange item id), so entity-facing views price a row without a name join.
 */
import { latestSnapshotPrices } from "../../db/marketQueries";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";

export interface ExchangePrice {
  /** Divine per item. */
  div: number;
  /** ISO-8601 UTC time the value was last stored (not the last poll: flat repeats are deduped). */
  fetchedAt: string;
}

/** One league's latest stored price per exchange item. Non-positive values are dropped, never shown as 0. */
export function exchangePriceMap(league: string): Map<string, ExchangePrice> {
  const prices = new Map<string, ExchangePrice>();
  for (const row of latestSnapshotPrices(league)) {
    if (!(row.baseValue > 0)) continue;
    prices.set(row.itemId, { div: row.baseValue, fetchedAt: new Date(parseSqliteTimestamp(row.fetchedAt)).toISOString() });
  }
  return prices;
}
