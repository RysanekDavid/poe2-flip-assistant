import { getDb } from "./database";

/**
 * Per-user alert feed. Rows carry the league of the pipeline that produced them (the caller
 * passes it — see queries.ts header), and the feed is read back filtered to the viewer's league.
 */
export interface AlertRow {
  id: number;
  league: string | null;
  type: string;
  item_id: string;
  item_name: string | null;
  message: string;
  value: number | null;
  threshold: number | null;
  whisper: string | null;
  link: string | null;
  seen: number;
  created_at: string;
}

export function insertAlert(
  userId: number,
  league: string,
  a: {
    type: string;
    itemId: string;
    itemName: string;
    message: string;
    value: number;
    threshold: number;
    whisper?: string | null;
    link?: string | null;
  },
): void {
  getDb()
    .prepare(
      `INSERT INTO alerts (user_id, league, type, item_id, item_name, message, value, threshold, whisper, link)
       VALUES (@userId, @league, @type, @itemId, @itemName, @message, @value, @threshold, @whisper, @link)`,
    )
    .run({ ...a, whisper: a.whisper ?? null, link: a.link ?? null, userId, league });
}

/** True if an alert for this user's item+type fired within the last `minutes` — throttles repeats. */
export function hasRecentAlert(userId: number, itemId: string, type: string, minutes: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 FROM alerts WHERE user_id = ? AND item_id = ? AND type = ? AND created_at >= datetime('now', ?) LIMIT 1`,
    )
    .get(userId, itemId, type, `-${minutes} minutes`);
  return row != null;
}

/** True if this user was EVER alerted for this item+type — snipe listings alert once per listing id. */
export function hasAlertEver(userId: number, itemId: string, type: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 FROM alerts WHERE user_id = ? AND item_id = ? AND type = ? LIMIT 1`)
    .get(userId, itemId, type);
  return row != null;
}

/**
 * Alert types produced by the shared trade2 pipelines (hunts, autosnipe, craft margins), which
 * only ever run in the app DEFAULT league on the owner's/user's creds. They are the user's own
 * watches — hiding them because the user is viewing another league would silently swallow a
 * snipe — so they show in every view, labeled with their league (`foreign_league`). LEAGUE news
 * ("a new league started") likewise matters most to someone still viewing the old one.
 */
export const EVERY_VIEW_ALERT_TYPES = ["LEAGUE", "SNIPE", "CRAFT_BASE", "RESELL", "CRAFT_MARGIN"] as const;

export interface AlertFeedRow extends AlertRow {
  foreign_league: string | null; // the alert's league when it differs from the viewed one
}

/**
 * What a user's feed shows for the league they view — shared by the feed, counts and mark-seen.
 * Market alerts (spreads, trends, spikes) from another economy are noise at best and a wrong
 * trade at worst, so those are filtered; pre-league-scoping rows (league NULL) can't be
 * attributed and stay visible rather than vanish.
 */
const VISIBLE_SQL = `user_id = @userId AND (league = @league COLLATE NOCASE OR league IS NULL OR type IN (${EVERY_VIEW_ALERT_TYPES.map((t) => `'${t}'`).join(", ")}))`;
const FOREIGN_LEAGUE_SQL = "CASE WHEN league IS NOT NULL AND league != @league COLLATE NOCASE THEN league END";
const FEED_COLUMNS =
  "id, league, type, item_id, item_name, message, value, threshold, whisper, link, seen, created_at, foreign_league";

/**
 * The alert center's feed for the viewed league: the newest `perType` alerts OF EACH TYPE. A flat
 * newest-100 list let one chatty type (TREND on a busy market) push every snipe out of the popover.
 */
export function getAlertFeed(userId: number, league: string, perType = 15): AlertFeedRow[] {
  return getDb()
    .prepare(
      `SELECT ${FEED_COLUMNS} FROM (
         SELECT *, ${FOREIGN_LEAGUE_SQL} AS foreign_league,
                ROW_NUMBER() OVER (PARTITION BY type ORDER BY created_at DESC, id DESC) AS rn
         FROM alerts WHERE ${VISIBLE_SQL}
       ) WHERE rn <= @perType ORDER BY created_at DESC, id DESC`,
    )
    .all({ userId, league, perType }) as AlertFeedRow[];
}

export interface AlertTypeCount {
  type: string;
  total: number;
  unseen: number;
}

/** Exact per-type totals for the visible feed (the row list above is capped per type). */
export function getAlertCounts(userId: number, league: string): AlertTypeCount[] {
  return getDb()
    .prepare(
      `SELECT type, COUNT(*) AS total, SUM(seen = 0) AS unseen FROM alerts
       WHERE ${VISIBLE_SQL} GROUP BY type ORDER BY type`,
    )
    .all({ userId, league }) as AlertTypeCount[];
}

/**
 * "Mark all seen" (type = null) or per type, over everything the viewer's feed shows — not just
 * the capped rows the client holds. Scoped to the user (one account can't touch another's feed);
 * alerts hidden from this league view stay unseen.
 */
export function markVisibleSeen(userId: number, league: string, type: string | null): number {
  const byType = type == null ? "" : "AND type = @type";
  const params = type == null ? { userId, league } : { userId, league, type };
  return getDb()
    .prepare(`UPDATE alerts SET seen = 1 WHERE ${VISIBLE_SQL} AND seen = 0 ${byType}`)
    .run(params).changes;
}
