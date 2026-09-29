import type Database from "better-sqlite3";

/**
 * POESESSID health columns on `users`. Additive and idempotent: runs on every boot from getDb(),
 * adding only what is missing, so the web and poller processes can both start it safely.
 *
 * 'unknown' is the honest default: nobody has seen a trade2 answer for this cookie yet, and a row
 * that predates the column says nothing about whether its cookie still works.
 */
export const CRED_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["poe_cred_state", "TEXT NOT NULL DEFAULT 'unknown'"],
  ["poe_cred_checked_at", "TEXT"],
  ["poe_cred_error", "TEXT"],
];

export function ensureCredColumns(conn: Database.Database): void {
  const existing = new Set((conn.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((r) => r.name));
  for (const [name, def] of CRED_COLUMNS) {
    if (!existing.has(name)) conn.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`);
  }
}
