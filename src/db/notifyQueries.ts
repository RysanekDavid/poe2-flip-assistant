import type Database from "better-sqlite3";
import { getDb } from "./database";
import { encryptSecret, decryptSecret } from "../auth/secretbox";
import { resolvePrefs, typesWith, type ChannelPrefs, type NotifyType, type PrefRow, type StoredPref, defaultPrefs } from "../core/notify/prefs";
import type { NotifyAlert } from "../core/notify/discordMessage";

/**
 * Per-user notification storage: the encrypted Discord webhook, per-type routing, the digest
 * switch, and the outbound delivery queue (rows are enqueued by the trg_alerts_notify trigger —
 * see notifyMigrations). Queue times are epoch ms supplied by the caller's clock.
 */

// ---------- webhook ----------

export type StoredWebhook = { state: "none" } | { state: "set"; url: string } | { state: "unreadable" };

/**
 * Replace (url) or clear (null) the webhook. Replacing keeps queued alerts — the drainer reads
 * the webhook at send time, so they go to the new URL. Clearing drops undelivered rows (they have
 * nowhere to go) and forgets the digest baseline, so a webhook re-added weeks later starts a
 * fresh day instead of summarising the gap.
 *
 * The live board message was posted through one webhook and can only be edited through it, so
 * any change of URL forgets its id (and its timestamp — the board is re-posted on the next pass).
 */
export function setWebhook(userId: number, url: string | null, db: Database.Database = getDb()): void {
  const before = readWebhook(userId, db);
  db.transaction(() => {
    db.prepare("UPDATE users SET discord_webhook_enc = ? WHERE id = ?").run(url ? encryptSecret(url) : null, userId);
    if (!(before.state === "set" && before.url === url)) {
      db.prepare("UPDATE notify_settings SET board_message_id = NULL, board_updated_at = NULL WHERE user_id = ?").run(userId);
    }
    if (url != null) return;
    db.prepare("DELETE FROM notify_queue WHERE user_id = ? AND status = 'pending'").run(userId);
    db.prepare("UPDATE notify_settings SET last_digest_at = NULL WHERE user_id = ?").run(userId);
  })();
}

export function readWebhook(userId: number, db: Database.Database = getDb()): StoredWebhook {
  const row = db.prepare("SELECT discord_webhook_enc AS enc FROM users WHERE id = ?").get(userId) as
    | { enc: string | null }
    | undefined;
  if (!row?.enc) return { state: "none" };
  try {
    return { state: "set", url: decryptSecret(row.enc) };
  } catch (e) {
    // SECRET_KEY rotated or the token is corrupt — surfaced as a state the UI and drainer report
    console.warn(`[notify] user ${userId}: stored webhook cannot be decrypted (${e instanceof Error ? e.message : e})`);
    return { state: "unreadable" };
  }
}

// ---------- preferences ----------

export function getPrefs(userId: number, db: Database.Database = getDb()): PrefRow[] {
  const stored = db
    .prepare("SELECT type, ticker, sound, popup, discord FROM notify_prefs WHERE user_id = ?")
    .all(userId) as StoredPref[];
  return resolvePrefs(stored);
}

/**
 * Change some channels of one type; untouched channels keep their stored value or default. All
 * four are written, so a row never mixes explicit choices with NULL "whatever the default is".
 */
export function setPref(
  userId: number,
  type: NotifyType,
  change: Partial<ChannelPrefs>,
  db: Database.Database = getDb(),
): void {
  const base = getPrefs(userId, db).find((p) => p.type === type) ?? { ...defaultPrefs(type), type };
  const next: ChannelPrefs = {
    ticker: change.ticker ?? base.ticker,
    sound: change.sound ?? base.sound,
    popup: change.popup ?? base.popup,
    discord: change.discord ?? base.discord,
  };
  db.prepare(
    `INSERT INTO notify_prefs (user_id, type, ticker, sound, popup, discord) VALUES (@userId, @type, @ticker, @sound, @popup, @discord)
     ON CONFLICT(user_id, type) DO UPDATE SET
       ticker = excluded.ticker, sound = excluded.sound, popup = excluded.popup, discord = excluded.discord`,
  ).run({
    userId,
    type,
    ticker: next.ticker ? 1 : 0,
    sound: next.sound ? 1 : 0,
    popup: next.popup ? 1 : 0,
    discord: next.discord ? 1 : 0,
  });
}

/** Types this user muted in the ticker/popover badge. */
export function tickerMutedTypes(userId: number, db: Database.Database = getDb()): NotifyType[] {
  return typesWith(getPrefs(userId, db), "ticker", false);
}

/** What the browser needs from the routing table: muted ticker types, chime types, popup types. */
export function browserPrefs(
  userId: number,
  db: Database.Database = getDb(),
): { tickerMuted: NotifyType[]; soundTypes: NotifyType[]; popupTypes: NotifyType[] } {
  const prefs = getPrefs(userId, db);
  return {
    tickerMuted: typesWith(prefs, "ticker", false),
    soundTypes: typesWith(prefs, "sound", true),
    popupTypes: typesWith(prefs, "popup", true),
  };
}

export function getDigestEnabled(userId: number, db: Database.Database = getDb()): boolean {
  const row = db.prepare("SELECT digest FROM notify_settings WHERE user_id = ?").get(userId) as { digest: number } | undefined;
  return row ? row.digest === 1 : true;
}

export function setDigestEnabled(userId: number, enabled: boolean, db: Database.Database = getDb()): void {
  db.prepare(
    `INSERT INTO notify_settings (user_id, digest) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET digest = excluded.digest`,
  ).run(userId, enabled ? 1 : 0);
}

// ---------- queue ----------

/** 'board' rows carry no payload: the board is rendered at send time so a retry shows current numbers. */
export type QueueKind = "alert" | "digest" | "board";

export interface QueueRow {
  queue_id: number;
  kind: QueueKind;
  attempts: number;
  payload_json: string | null;
  alert: NotifyAlert | null; // null for digests and boards
}

interface RawQueueRow extends Omit<NotifyAlert, "id"> {
  queue_id: number;
  kind: QueueKind;
  attempts: number;
  payload_json: string | null;
  alert_id: number | null;
}

/** Users with at least one delivery due at `now`. */
export function dueUserIds(now: number, db: Database.Database = getDb()): number[] {
  const rows = db
    .prepare("SELECT DISTINCT user_id FROM notify_queue WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY user_id")
    .all(now) as Array<{ user_id: number }>;
  return rows.map((r) => r.user_id);
}

/** When this user's webhook was last POSTed to (any outcome) — the 30 s window reads it. */
export function lastAttemptAt(userId: number, db: Database.Database = getDb()): number | null {
  const row = db.prepare("SELECT MAX(last_attempt_at) AS t FROM notify_queue WHERE user_id = ?").get(userId) as {
    t: number | null;
  };
  return row.t;
}

/** Oldest due deliveries for one user, alert columns joined in. */
export function dueRows(userId: number, now: number, limit: number, db: Database.Database = getDb()): QueueRow[] {
  const rows = db
    .prepare(
      `SELECT q.id AS queue_id, q.kind, q.attempts, q.payload_json, q.alert_id,
              a.type, a.item_id, a.item_name, a.message, a.value, a.threshold, a.whisper, a.link, a.details, a.league, a.created_at
       FROM notify_queue q LEFT JOIN alerts a ON a.id = q.alert_id
       WHERE q.user_id = ? AND q.status = 'pending' AND q.next_attempt_at <= ?
       ORDER BY q.id LIMIT ?`,
    )
    .all(userId, now, limit) as RawQueueRow[];
  return rows.map(({ queue_id, kind, attempts, payload_json, alert_id, ...a }) => ({
    queue_id,
    kind,
    attempts,
    payload_json,
    alert: kind === "alert" && alert_id != null ? { ...a, id: alert_id } : null,
  }));
}

const inList = (ids: readonly number[]): string => ids.map(() => "?").join(",");

export function markSent(ids: readonly number[], now: number, db: Database.Database = getDb()): void {
  if (ids.length === 0) return;
  db.prepare(
    `UPDATE notify_queue SET status = 'sent', attempts = attempts + 1, last_attempt_at = ?, last_error = NULL
     WHERE id IN (${inList(ids)})`,
  ).run(now, ...ids);
}

/** Terminal failure: kept (not deleted) so Settings can show why deliveries stopped. */
export function markFailed(ids: readonly number[], now: number, error: string, db: Database.Database = getDb()): void {
  if (ids.length === 0) return;
  db.prepare(
    `UPDATE notify_queue SET status = 'failed', attempts = attempts + 1, last_attempt_at = ?, last_error = ?
     WHERE id IN (${inList(ids)})`,
  ).run(now, error, ...ids);
}

/**
 * Put a row back for a later attempt at `nextAt`, or fail it when out of attempts. `counts` is
 * false for a 429: the POST is still stamped (the 30 s window sees it) but no retry budget is spent.
 */
export function markRetry(
  id: number,
  now: number,
  nextAt: number,
  error: string,
  opts: { counts: boolean; giveUp: boolean },
  db: Database.Database = getDb(),
): void {
  db.prepare(
    `UPDATE notify_queue SET attempts = attempts + ?, last_attempt_at = ?, last_error = ?,
       next_attempt_at = ?, status = ? WHERE id = ?`,
  ).run(opts.counts ? 1 : 0, now, error, nextAt, opts.giveUp ? "failed" : "pending", id);
}

/** Drop a user's undelivered rows (webhook cleared between enqueue and delivery). */
export function dropPending(userId: number, db: Database.Database = getDb()): number {
  return db.prepare("DELETE FROM notify_queue WHERE user_id = ? AND status = 'pending'").run(userId).changes;
}

export function enqueueDigest(userId: number, payloadJson: string, db: Database.Database = getDb()): void {
  db.prepare("INSERT INTO notify_queue (user_id, kind, payload_json) VALUES (?, 'digest', ?)").run(userId, payloadJson);
}

/** Sent/failed rows are history only; keep two weeks so Settings can still show the last error. */
export function pruneQueue(days = 14, db: Database.Database = getDb()): number {
  return db
    .prepare("DELETE FROM notify_queue WHERE status != 'pending' AND created_at < datetime('now', ?)")
    .run(`-${days} days`).changes;
}

export interface NotifyStatus {
  pending: number;
  lastSentAt: number | null;
  failed7d: number;
  lastError: string | null;
  lastErrorAt: number | null;
}

/** Delivery health for Settings. `lastError` is the newest terminal failure (token-free). */
export function notifyStatus(userId: number, db: Database.Database = getDb()): NotifyStatus {
  const counts = db
    .prepare(
      `SELECT SUM(status = 'pending') AS pending,
              MAX(CASE WHEN status = 'sent' THEN last_attempt_at END) AS last_sent,
              SUM(status = 'failed' AND created_at >= datetime('now', '-7 days')) AS failed7d
       FROM notify_queue WHERE user_id = ?`,
    )
    .get(userId) as { pending: number | null; last_sent: number | null; failed7d: number | null };
  const err = db
    .prepare(
      `SELECT last_error, last_attempt_at FROM notify_queue
       WHERE user_id = ? AND status = 'failed' ORDER BY last_attempt_at DESC, id DESC LIMIT 1`,
    )
    .get(userId) as { last_error: string | null; last_attempt_at: number | null } | undefined;
  // A failure older than the newest success is resolved — do not keep alarming about it.
  const stale = err?.last_attempt_at != null && counts.last_sent != null && counts.last_sent > err.last_attempt_at;
  return {
    pending: counts.pending ?? 0,
    lastSentAt: counts.last_sent,
    failed7d: counts.failed7d ?? 0,
    lastError: stale ? null : (err?.last_error ?? null),
    lastErrorAt: stale ? null : (err?.last_attempt_at ?? null),
  };
}

// ---------- daily digest ----------

/** Users who get a digest: webhook set and the digest switch on (default on). */
export function digestCandidates(db: Database.Database = getDb()): Array<{ user_id: number; last_digest_at: number | null }> {
  return db
    .prepare(
      `SELECT u.id AS user_id, s.last_digest_at FROM users u LEFT JOIN notify_settings s ON s.user_id = u.id
       WHERE u.discord_webhook_enc IS NOT NULL AND COALESCE(s.digest, 1) = 1 ORDER BY u.id`,
    )
    .all() as Array<{ user_id: number; last_digest_at: number | null }>;
}

export function setLastDigestAt(userId: number, at: number, db: Database.Database = getDb()): void {
  db.prepare(
    `INSERT INTO notify_settings (user_id, last_digest_at) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET last_digest_at = excluded.last_digest_at`,
  ).run(userId, at);
}

/** alerts.created_at is SQLite UTC text; compare against the same shape. */
function sqliteTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export interface DigestData {
  counts: Array<{ type: string; n: number }>;
  top: NotifyAlert[]; // best few per actionable type, by value
}

/** What a user's feed surfaced in (fromMs, toMs]: counts per type + the top 3 per actionable type. */
export function digestData(
  userId: number,
  fromMs: number,
  toMs: number,
  topTypes: readonly NotifyType[],
  db: Database.Database = getDb(),
): DigestData {
  const range = { userId, from: sqliteTime(fromMs), to: sqliteTime(toMs) };
  const counts = db
    .prepare(
      `SELECT type, COUNT(*) AS n FROM alerts
       WHERE user_id = @userId AND created_at > @from AND created_at <= @to GROUP BY type ORDER BY n DESC`,
    )
    .all(range) as Array<{ type: string; n: number }>;
  // NotifyType values are compile-time identifiers (asserted in prefs.defaultDiscordSql's shape)
  const types = topTypes.map((t) => `'${t}'`).join(", ");
  const top = db
    .prepare(
      `SELECT id, type, item_id, item_name, message, value, threshold, whisper, link, details, league, created_at FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY type ORDER BY value DESC, id DESC) AS rn FROM alerts
         WHERE user_id = @userId AND created_at > @from AND created_at <= @to AND type IN (${types}) AND value IS NOT NULL
       ) WHERE rn <= 3 ORDER BY type, value DESC`,
    )
    .all(range) as NotifyAlert[];
  return { counts, top };
}

// ---------- live board ----------

export interface BoardSettings {
  enabled: boolean;
  messageId: string | null; // the Discord message the board edits; null = the next update posts a new one
  updatedAt: number | null; // epoch ms of the last successful post/edit
}

export function getBoardSettings(userId: number, db: Database.Database = getDb()): BoardSettings {
  const row = db
    .prepare("SELECT board, board_message_id, board_updated_at FROM notify_settings WHERE user_id = ?")
    .get(userId) as { board: number; board_message_id: string | null; board_updated_at: number | null } | undefined;
  if (!row) return { enabled: false, messageId: null, updatedAt: null }; // opt-in: off until switched on
  return { enabled: row.board === 1, messageId: row.board_message_id, updatedAt: row.board_updated_at };
}

/**
 * Switch the live board. Switching off forgets the message and drops a queued update, so switching
 * back on posts a fresh board at the bottom of the channel instead of editing one scrolled away.
 */
export function setBoardEnabled(userId: number, enabled: boolean, db: Database.Database = getDb()): void {
  db.transaction(() => {
    db.prepare(
      `INSERT INTO notify_settings (user_id, board) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET board = excluded.board`,
    ).run(userId, enabled ? 1 : 0);
    if (enabled) return;
    db.prepare("UPDATE notify_settings SET board_message_id = NULL, board_updated_at = NULL WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM notify_queue WHERE user_id = ? AND kind = 'board' AND status = 'pending'").run(userId);
  })();
}

/** Queue one board update unless one is already waiting. True when a row was added. */
export function enqueueBoard(userId: number, db: Database.Database = getDb()): boolean {
  const added = db
    .prepare(
      `INSERT INTO notify_queue (user_id, kind)
       SELECT ?, 'board' WHERE NOT EXISTS (
         SELECT 1 FROM notify_queue WHERE user_id = ? AND kind = 'board' AND status = 'pending')`,
    )
    .run(userId, userId);
  return added.changes > 0;
}

/**
 * Users whose board is due: switched on, webhook set, last update older than the interval, and no
 * board row pending or attempted within the interval — so a webhook that keeps failing costs one
 * attempt cycle per interval, not one per drain tick.
 */
export function dueBoardUserIds(now: number, intervalMs: number, db: Database.Database = getDb()): number[] {
  const rows = db
    .prepare(
      `SELECT u.id AS user_id FROM users u JOIN notify_settings s ON s.user_id = u.id
       WHERE u.discord_webhook_enc IS NOT NULL AND s.board = 1
         AND (s.board_updated_at IS NULL OR s.board_updated_at <= @cutoff)
         AND NOT EXISTS (
           SELECT 1 FROM notify_queue q WHERE q.user_id = u.id AND q.kind = 'board'
             AND (q.status = 'pending' OR q.last_attempt_at > @cutoff))
       ORDER BY u.id`,
    )
    .all({ cutoff: now - intervalMs }) as Array<{ user_id: number }>;
  return rows.map((r) => r.user_id);
}

/**
 * A board post/edit Discord accepted: remember which message to edit next time. Only while the
 * board is still on — the send awaited Discord, and a switch-off in that gap must not be undone
 * by resurrecting the id.
 */
export function recordBoardDelivery(userId: number, messageId: string | null, at: number, db: Database.Database = getDb()): void {
  db.prepare("UPDATE notify_settings SET board_message_id = ?, board_updated_at = ? WHERE user_id = ? AND board = 1").run(messageId, at, userId);
}

/** The board message cannot be edited (deleted in Discord, or the PATCH was refused): the next update posts a new one. */
export function clearBoardMessageId(userId: number, db: Database.Database = getDb()): void {
  db.prepare("UPDATE notify_settings SET board_message_id = NULL WHERE user_id = ?").run(userId);
}
