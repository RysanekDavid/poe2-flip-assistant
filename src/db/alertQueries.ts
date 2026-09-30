import type Database from "better-sqlite3";
import { z } from "zod";
import { getDb } from "./database";
import { parseStoredCard, type SnipeCard } from "../lib/snipeCard";
import type { LastAlert } from "../core/alertRefire";
import type { SnipeAlertRow } from "../core/opportunities/liveSnipes";

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

/** A row as stored: `details` is the card JSON text (SNIPE), parsed on the way out. */
interface StoredAlertRow extends AlertRow {
  details: string | null;
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
    details?: string | null; // SnipeCard JSON, already validated by the caller
  },
): void {
  getDb()
    .prepare(
      `INSERT INTO alerts (user_id, league, type, item_id, item_name, message, value, threshold, whisper, link, details)
       VALUES (@userId, @league, @type, @itemId, @itemName, @message, @value, @threshold, @whisper, @link, @details)`,
    )
    .run({ ...a, whisper: a.whisper ?? null, link: a.link ?? null, details: a.details ?? null, userId, league });
}

const LastAlertRow = z.object({ ageMin: z.number(), value: z.number().nullable(), message: z.string() });

/**
 * The newest alert for this user's item+type in this league, aged in minutes — the re-fire
 * baseline. League-scoped: a spread alerted in the old economy is no reason to stay quiet about
 * the new one, and legacy NULL-league rows carry no usable baseline.
 */
export function lastAlert(userId: number, league: string, itemId: string, type: string): LastAlert | null {
  const row = getDb()
    .prepare(
      `SELECT (julianday('now') - julianday(created_at)) * 1440 AS ageMin, value, message
       FROM alerts WHERE user_id = ? AND league = ? COLLATE NOCASE AND item_id = ? AND type = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(userId, league, itemId, type);
  return row == null ? null : LastAlertRow.parse(row);
}

/**
 * Retention: drop alerts older than `days`, except unseen ones younger than `unseenKeepDays`
 * (only bites when retention is configured shorter than that). Seen state is per user row, so one
 * statement covers every user. Deliveries still queued for a dropped alert go with it
 * (notify_queue.alert_id cascades). SNIPE once-ever dedupe survives via snipe_outcomes.
 */
export function pruneAlerts(days: number, unseenKeepDays: number, db: Database.Database = getDb()): number {
  return db
    .prepare(
      `DELETE FROM alerts WHERE created_at < datetime('now', ?)
         AND NOT (seen = 0 AND created_at >= datetime('now', ?))`,
    )
    .run(`-${days} days`, `-${unseenKeepDays} days`).changes;
}

/**
 * True if this user was EVER alerted for this item+type — snipe listings alert once per listing id.
 * The feed is pruned after ALERT_RETENTION_DAYS, so for SNIPE the never-pruned snipe_outcomes row
 * (written right after a listing is alerted) keeps "once ever" true past retention.
 */
export function hasAlertEver(userId: number, itemId: string, type: string): boolean {
  const db = getDb();
  if (type === "SNIPE" && db.prepare("SELECT 1 FROM snipe_outcomes WHERE listing_id = ?").get(itemId) != null) return true;
  const row = db.prepare(`SELECT 1 FROM alerts WHERE user_id = ? AND item_id = ? AND type = ? LIMIT 1`).get(userId, itemId, type);
  return row != null;
}

const SnipeAlertSchema = z.object({
  id: z.number().int(),
  item_id: z.string(),
  league: z.string().nullable(),
  seen: z.number().int(),
  created_at: z.string(),
  details: z.string().nullable(),
});

/**
 * A user's SNIPE alerts fired in the last `withinMinutes`, newest first, with their parsed cards
 * (Trade › Opportunities). A row whose card no longer parses is dropped and logged once, as in the
 * feed; the feed still shows it with its error.
 */
export function recentSnipeAlerts(userId: number, withinMinutes: number): SnipeAlertRow[] {
  const raw = getDb()
    .prepare(
      `SELECT id, item_id, league, seen, created_at, details FROM alerts
       WHERE user_id = ? AND type = 'SNIPE' AND created_at >= datetime('now', ?)
       ORDER BY created_at DESC, id DESC LIMIT 200`,
    )
    .all(userId, `-${Math.ceil(withinMinutes)} minutes`);
  const rows: SnipeAlertRow[] = [];
  for (const r of z.array(SnipeAlertSchema).parse(raw)) {
    const { card, error } = parseStoredCard(r.details, r.id, { log: !reportedCorruptCards.has(r.id) });
    if (error) reportedCorruptCards.add(r.id);
    if (card) rows.push({ alertId: r.id, listingId: r.item_id, league: r.league, seen: r.seen, createdAt: r.created_at, card });
  }
  return rows;
}

/**
 * Alert types produced by the shared trade2 pipelines (autosnipe, craft margins), which
 * only ever run in the app DEFAULT league on the owner's/user's creds. They are the user's own
 * watches — hiding them because the user is viewing another league would silently swallow a
 * snipe — so they show in every view, labeled with their league (`foreign_league`). LEAGUE news
 * ("a new league started") likewise matters most to someone still viewing the old one, and PATCH
 * notes apply to every league at once.
 */
export const EVERY_VIEW_ALERT_TYPES = ["LEAGUE", "PATCH", "SNIPE", "CRAFT_MARGIN"] as const;

export interface AlertFeedRow extends AlertRow {
  foreign_league: string | null; // the alert's league when it differs from the viewed one
  details: SnipeCard | null; // the SNIPE item card; null for other types and pre-card rows
  details_error: string | null; // set when a stored card no longer parses — shown, never hidden
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
  "id, league, type, item_id, item_name, message, value, threshold, whisper, link, details, seen, created_at, foreign_league";

/**
 * The alert center's feed for the viewed league: the newest `perType` alerts OF EACH TYPE. A flat
 * newest-100 list let one chatty type (TREND on a busy market) push every snipe out of the popover.
 */
/**
 * Alert ids whose stored card already failed to parse in this process. The feed is polled every
 * 30 s per tab, so without this one corrupt row would log the same error forever; it is still
 * returned as details_error on every read.
 */
const reportedCorruptCards = new Set<number>();

export function getAlertFeed(userId: number, league: string, perType = 15): AlertFeedRow[] {
  const rows = getDb()
    .prepare(
      `SELECT ${FEED_COLUMNS} FROM (
         SELECT *, ${FOREIGN_LEAGUE_SQL} AS foreign_league,
                ROW_NUMBER() OVER (PARTITION BY type ORDER BY created_at DESC, id DESC) AS rn
         FROM alerts WHERE ${VISIBLE_SQL}
       ) WHERE rn <= @perType ORDER BY created_at DESC, id DESC`,
    )
    .all({ userId, league, perType }) as Array<StoredAlertRow & { foreign_league: string | null }>;
  return rows.map((r) => {
    const { card, error } = parseStoredCard(r.details, r.id, { log: !reportedCorruptCards.has(r.id) });
    if (error) reportedCorruptCards.add(r.id);
    return { ...r, details: card, details_error: error };
  });
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
