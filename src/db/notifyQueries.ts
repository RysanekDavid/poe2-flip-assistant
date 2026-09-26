import type Database from "better-sqlite3";
import { getDb } from "./database";
import { encryptSecret, decryptSecret } from "../auth/secretbox";
import { resolvePrefs, type NotifyType, type PrefRow, defaultPrefs } from "../core/notify/prefs";
import type { NotifyAlert } from "../core/notify/discordMessage";

/**
 * Per-user notification storage: the encrypted Discord webhook, per-type routing, the digest
 * switch, and the outbound delivery queue (rows are enqueued by the trg_alerts_notify trigger —
 * see notifyMigrations). Queue times are epoch ms supplied by the caller's clock.
 */

// ---------- webhook ----------

export type StoredWebhook = { state: "none" } | { state: "set"; url: string } | { state: "unreadable" };

/** Replace (url) or clear (null) the webhook. Clearing drops undelivered rows: they have nowhere to go. */
export function setWebhook(userId: number, url: string | null, db: Database.Database = getDb()): void {
  db.transaction(() => {
    db.prepare("UPDATE users SET discord_webhook_enc = ? WHERE id = ?").run(url ? encryptSecret(url) : null, userId);
    db.prepare("DELETE FROM notify_queue WHERE user_id = ? AND status = 'pending'").run(userId);
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
  const stored = db.prepare("SELECT type, discord, ticker FROM notify_prefs WHERE user_id = ?").all(userId) as Array<{
    type: string;
    discord: number;
    ticker: number;
  }>;
  return resolvePrefs(stored);
}

/** Change one channel of one type; the untouched channel keeps its stored value or default. */
export function setPref(
  userId: number,
  type: NotifyType,
  change: { discord?: boolean; ticker?: boolean },
  db: Database.Database = getDb(),
): void {
  const base = getPrefs(userId, db).find((p) => p.type === type) ?? { ...defaultPrefs(type), type };
  const discord = change.discord ?? base.discord;
  const ticker = change.ticker ?? base.ticker;
  db.prepare(
    `INSERT INTO notify_prefs (user_id, type, discord, ticker) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, type) DO UPDATE SET discord = excluded.discord, ticker = excluded.ticker`,
  ).run(userId, type, discord ? 1 : 0, ticker ? 1 : 0);
}

/** Types this user muted in the ticker/popover badge. */
export function tickerMutedTypes(userId: number, db: Database.Database = getDb()): NotifyType[] {
  return getPrefs(userId, db)
    .filter((p) => !p.ticker)
    .map((p) => p.type);
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

export interface QueueRow {
  queue_id: number;
  kind: "alert" | "digest";
  attempts: number;
  payload_json: string | null;
  alert: NotifyAlert | null; // null for digests
}

interface RawQueueRow extends Omit<NotifyAlert, "id"> {
  queue_id: number;
  kind: "alert" | "digest";
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
              a.type, a.item_id, a.item_name, a.message, a.value, a.threshold, a.whisper, a.link, a.league, a.created_at
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

/** One more failed attempt for a row: back to pending at `nextAt`, or failed when out of attempts. */
export function markRetry(
  id: number,
  now: number,
  nextAt: number,
  error: string,
  giveUp: boolean,
  db: Database.Database = getDb(),
): void {
  db.prepare(
    `UPDATE notify_queue SET attempts = attempts + 1, last_attempt_at = ?, last_error = ?,
       next_attempt_at = ?, status = ? WHERE id = ?`,
  ).run(now, error, nextAt, giveUp ? "failed" : "pending", id);
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
      `SELECT id, type, item_id, item_name, message, value, threshold, whisper, link, league, created_at FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY type ORDER BY value DESC, id DESC) AS rn FROM alerts
         WHERE user_id = @userId AND created_at > @from AND created_at <= @to AND type IN (${types}) AND value IS NOT NULL
       ) WHERE rn <= 3 ORDER BY type, value DESC`,
    )
    .all(range) as NotifyAlert[];
  return { counts, top };
}
