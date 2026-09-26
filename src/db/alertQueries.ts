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
 * This user's feed for the league they view. Market alerts (spreads, trends, spikes) from another
 * economy are noise at best and a wrong trade at worst, so those are filtered; pre-league-scoping
 * rows (league NULL) can't be attributed and stay visible rather than vanish.
 */
export function getAlerts(userId: number, league: string, unseenOnly = false, limit = 100): AlertFeedRow[] {
  const unseen = unseenOnly ? "AND seen = 0" : "";
  const everyView = EVERY_VIEW_ALERT_TYPES.map((t) => `'${t}'`).join(", ");
  return getDb()
    .prepare(
      `SELECT *, CASE WHEN league IS NOT NULL AND league != @league COLLATE NOCASE THEN league END AS foreign_league
       FROM alerts
       WHERE user_id = @userId AND (league = @league COLLATE NOCASE OR league IS NULL OR type IN (${everyView})) ${unseen}
       ORDER BY created_at DESC, id DESC LIMIT @limit`,
    )
    .all({ userId, league, limit }) as AlertFeedRow[];
}

/** Mark alerts seen — scoped to the user so one account can't touch another's feed. */
export function markAlertsSeen(userId: number, ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  getDb()
    .prepare(`UPDATE alerts SET seen = 1 WHERE user_id = ? AND id IN (${placeholders})`)
    .run(userId, ...ids);
}
