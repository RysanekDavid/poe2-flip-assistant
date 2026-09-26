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
 * This user's feed in ONE league. A snipe or spread alert from another economy is noise at best
 * and a wrong trade at worst. LEAGUE alerts are the exception: "a new league started" is news for
 * whoever is still looking at the old one.
 */
export function getAlerts(userId: number, league: string, unseenOnly = false, limit = 100): AlertRow[] {
  const unseen = unseenOnly ? "AND seen = 0" : "";
  return getDb()
    .prepare(
      `SELECT * FROM alerts
       WHERE user_id = ? AND (league = ? COLLATE NOCASE OR type = 'LEAGUE') ${unseen}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(userId, league, limit) as AlertRow[];
}

/** Mark alerts seen — scoped to the user so one account can't touch another's feed. */
export function markAlertsSeen(userId: number, ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  getDb()
    .prepare(`UPDATE alerts SET seen = 1 WHERE user_id = ? AND id IN (${placeholders})`)
    .run(userId, ...ids);
}
