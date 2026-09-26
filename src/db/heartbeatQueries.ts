import type Database from "better-sqlite3";
import { z } from "zod";
import { getDb } from "./database";

/** One background loop's last known outcome, as stored in subsystem_heartbeat. */
export const HeartbeatRowSchema = z.object({
  name: z.string(),
  league: z.string(),
  last_ok_at: z.string().nullable(),
  last_error_at: z.string().nullable(),
  last_error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  runs: z.number().int(),
});
export type HeartbeatRow = z.infer<typeof HeartbeatRowSchema>;

/** What one completed run contributes; `error` null means the run succeeded. */
export interface HeartbeatOutcome {
  name: string;
  league: string;
  at: string;
  durationMs: number;
  error: string | null;
}

/**
 * Upsert one run. A success clears nothing from the error columns on purpose: the panel compares
 * last_ok_at with last_error_at, so the most recent failure stays readable after a recovery.
 */
export function recordHeartbeat(outcome: HeartbeatOutcome, db: Database.Database = getDb()): void {
  const ok = outcome.error == null;
  db.prepare(
    `INSERT INTO subsystem_heartbeat (name, league, last_ok_at, last_error_at, last_error, duration_ms, runs)
     VALUES (@name, @league, @okAt, @errAt, @error, @durationMs, 1)
     ON CONFLICT(name, league) DO UPDATE SET
       last_ok_at = COALESCE(excluded.last_ok_at, subsystem_heartbeat.last_ok_at),
       last_error_at = COALESCE(excluded.last_error_at, subsystem_heartbeat.last_error_at),
       last_error = COALESCE(excluded.last_error, subsystem_heartbeat.last_error),
       duration_ms = excluded.duration_ms,
       runs = subsystem_heartbeat.runs + 1`,
  ).run({
    name: outcome.name,
    league: outcome.league,
    okAt: ok ? outcome.at : null,
    errAt: ok ? null : outcome.at,
    error: outcome.error,
    durationMs: Math.max(0, Math.round(outcome.durationMs)),
  });
}

/** Every stored heartbeat, validated — a malformed row is a bug and must surface, not render blank. */
export function listHeartbeats(db: Database.Database = getDb()): HeartbeatRow[] {
  const rows: unknown = db
    .prepare(
      `SELECT name, league, last_ok_at, last_error_at, last_error, duration_ms, runs
       FROM subsystem_heartbeat ORDER BY name, league`,
    )
    .all();
  return z.array(HeartbeatRowSchema).parse(rows);
}
