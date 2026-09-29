import type Database from "better-sqlite3";

/**
 * Storage for the Learn tab. Kept out of schema.sql like featureMigrations; IF NOT EXISTS makes it
 * idempotent for the web and poller processes that both run migrations on boot.
 *
 * learn_progress: which atlas-checklist steps a user has ticked. A row means "done"; unticking
 * deletes it. step_id is not a foreign key — the steps live in src/data/poe2/learn/atlas-checklist.json,
 * so the route validates ids against that file and a step retired from the file simply stops showing.
 * done_at is epoch milliseconds from the caller's clock (featureMigrations convention).
 */
export function ensureLearnTables(conn: Database.Database): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS learn_progress (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL CHECK (length(step_id) BETWEEN 1 AND 64),
      done_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, step_id)
    ) WITHOUT ROWID;
  `);
}
