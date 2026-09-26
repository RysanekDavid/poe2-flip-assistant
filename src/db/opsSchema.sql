-- Operational telemetry. Executed by getDb() after schema.sql and coachSchema.sql; references no
-- other table, so its position in the list is not load-bearing.

-- One row per background loop (and per league for per-league loops; '' = not league-scoped).
-- The poller writes it after every completed run; the owner System panel derives staleness from
-- last_ok_at against each loop's expected cadence. last_error is truncated and secret-scrubbed
-- before it is stored, because the panel renders it verbatim.
CREATE TABLE IF NOT EXISTS subsystem_heartbeat (
  name TEXT NOT NULL,
  league TEXT NOT NULL DEFAULT '',
  last_ok_at TEXT,
  last_error_at TEXT,
  last_error TEXT,
  duration_ms INTEGER,
  runs INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (name, league)
);
