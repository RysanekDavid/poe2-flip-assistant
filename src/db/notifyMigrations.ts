import type Database from "better-sqlite3";
import { defaultDiscordSql } from "../core/notify/prefs";

/**
 * Notification tables + the enqueue trigger. Idempotent; runs on every boot after
 * `users.discord_webhook_enc` has been ensured (the trigger reads it).
 *
 * The enqueue is a TRIGGER on `alerts` rather than a call in insertAlert: alerts are written
 * from several places (fireAlert, league news fanned out on an arbitrary connection, tests), and
 * a trigger makes the queue row part of the same statement as the alert — no writer can forget
 * it, and an alert can never exist without its delivery (or vice versa).
 */
export function ensureNotifySchema(conn: Database.Database): void {
  conn.exec(TABLES_SQL);
  // The default routing is compiled into the trigger from core/notify/prefs, so it is replaced
  // whenever its SQL changes — and only then: web + poller boot together and an unconditional
  // DROP/CREATE would be a schema write racing the other process on every start.
  const wanted = triggerSql().trim();
  const current = conn.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_alerts_notify'").get() as
    | { sql: string }
    | undefined;
  if (current?.sql.trim() === wanted) return;
  conn.transaction(() => {
    conn.exec("DROP TRIGGER IF EXISTS trg_alerts_notify");
    conn.exec(wanted);
  })();
}

const TABLES_SQL = `
  -- Per-user, per-alert-type routing. A missing row means "use the default" (core/notify/prefs).
  CREATE TABLE IF NOT EXISTS notify_prefs (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    discord INTEGER NOT NULL,
    ticker INTEGER NOT NULL,
    PRIMARY KEY (user_id, type)
  );

  -- Per-user notification settings that are not per type.
  CREATE TABLE IF NOT EXISTS notify_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    digest INTEGER NOT NULL DEFAULT 1,  -- daily Discord digest on/off
    last_digest_at INTEGER              -- epoch ms of the last digest window end (NULL = never)
  );

  -- Outbound Discord deliveries. Times are epoch ms from the drainer's clock (injectable in tests).
  CREATE TABLE IF NOT EXISTS notify_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'alert',          -- 'alert' | 'digest'
    alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE, -- set for kind='alert'
    payload_json TEXT,                           -- prebuilt embeds for kind='digest'
    status TEXT NOT NULL DEFAULT 'pending',      -- 'pending' | 'sent' | 'failed'
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,  -- 0 = due now
    last_attempt_at INTEGER,
    last_error TEXT,                             -- token-free; shown in Settings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_notify_queue_due ON notify_queue(status, next_attempt_at);
  CREATE INDEX IF NOT EXISTS idx_notify_queue_user ON notify_queue(user_id, status, id);
  CREATE INDEX IF NOT EXISTS idx_notify_queue_alert ON notify_queue(alert_id); -- FK cascade lookups
`;

function triggerSql(): string {
  const stored = "(SELECT discord FROM notify_prefs WHERE user_id = NEW.user_id AND type = NEW.type)";
  return `
    CREATE TRIGGER trg_alerts_notify AFTER INSERT ON alerts
    WHEN (SELECT discord_webhook_enc FROM users WHERE id = NEW.user_id) IS NOT NULL
      AND COALESCE(${stored}, ${defaultDiscordSql("NEW.type")}) = 1
    BEGIN
      INSERT INTO notify_queue (user_id, kind, alert_id) VALUES (NEW.user_id, 'alert', NEW.id);
    END
  `;
}
