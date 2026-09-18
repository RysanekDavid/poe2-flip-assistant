import { getDb } from "./database";
import { leagueForUser } from "../core/leagueUsers";

/**
 * The per-user watchlist. Split out of queries.ts when league filtering landed: a watched row
 * belongs to the market it was added under, and the poller now reads it back through that lens.
 *
 * `league` is written at INSERT time from the adding user's view, never backfilled — after a
 * switch there is no way to recover which market an untagged row belonged to.
 */

export interface WatchItem {
  id: number;
  user_id: number;
  league: string | null;
  item_id: string;
  item_name: string;
  category: string;
  buy_threshold_pct: number;
  sell_threshold_pct: number;
  manual_buy_exalt: number | null;
  manual_sell_chaos: number | null;
  manual_buy_ccy: string | null;
  manual_sell_ccy: string | null;
  manual_set_at: string | null;
  active: number;
}

/** Age of manual prices in ms, or null if never set. */
export function manualAgeMs(setAt: string | null): number | null {
  if (!setAt) return null;
  return Date.now() - new Date(setAt.replace(" ", "T") + "Z").getTime();
}

/** Everything this user watches, in every league — what the watchlist UI lists. */
export function getWatchlist(userId: number, activeOnly = true): WatchItem[] {
  const db = getDb();
  const sql = activeOnly
    ? "SELECT * FROM watchlist WHERE user_id = ? AND active = 1 ORDER BY item_name"
    : "SELECT * FROM watchlist WHERE user_id = ? ORDER BY item_name";
  return db.prepare(sql).all(userId) as WatchItem[];
}

/**
 * The rows the poller may alert on for a given market: manual Ange prices and thresholds were
 * recorded against one league's economy, so re-firing them against another league's numbers
 * would alert on a spread that never existed.
 */
export function getWatchlistForLeague(userId: number, league: string): WatchItem[] {
  // COLLATE NOCASE: league names are matched as exact SQL values everywhere, so a row stamped
  // "standard" against a swept "Standard" would be a row that can never fire again.
  return getDb()
    .prepare(
      "SELECT * FROM watchlist WHERE user_id = ? AND active = 1 AND league = ? COLLATE NOCASE ORDER BY item_name",
    )
    .all(userId, league) as WatchItem[];
}

export function addWatch(
  userId: number,
  item: {
    itemId: string;
    itemName: string;
    category: string;
    buyThresholdPct?: number;
    sellThresholdPct?: number;
  },
): void {
  getDb()
    .prepare(
      `INSERT INTO watchlist (user_id, league, item_id, item_name, category, buy_threshold_pct, sell_threshold_pct)
       VALUES (@userId, @league, @itemId, @itemName, @category, @buy, @sell)
       ON CONFLICT(user_id, item_id) DO UPDATE SET
         league = excluded.league,
         buy_threshold_pct = excluded.buy_threshold_pct,
         sell_threshold_pct = excluded.sell_threshold_pct,
         active = 1`,
    )
    .run({
      userId,
      // The ADDING user's view, not the app default: they picked this item off their own market.
      league: leagueForUser(userId),
      itemId: item.itemId,
      itemName: item.itemName,
      category: item.category,
      buy: item.buyThresholdPct ?? 15,
      sell: item.sellThresholdPct ?? 10,
    });
}

export function removeWatch(userId: number, itemId: string): void {
  getDb().prepare("UPDATE watchlist SET active = 0 WHERE user_id = ? AND item_id = ?").run(userId, itemId);
}

/** Set or clear (null) real observed Ange prices for an item — drives REAL-mode spread. */
export function setManualPrices(
  userId: number,
  itemId: string,
  buyAmount: number | null,
  buyCcy: string | null,
  sellAmount: number | null,
  sellCcy: string | null,
): void {
  const setAt = buyAmount != null && sellAmount != null ? new Date().toISOString().replace("T", " ").slice(0, 19) : null;
  getDb()
    .prepare(
      `UPDATE watchlist SET manual_buy_exalt = ?, manual_sell_chaos = ?, manual_buy_ccy = ?, manual_sell_ccy = ?, manual_set_at = ?
       WHERE user_id = ? AND item_id = ?`,
    )
    .run(buyAmount, sellAmount, buyCcy, sellCcy, setAt, userId, itemId);
}
