import type Database from "better-sqlite3";

/**
 * Columns added to balance_items after it first shipped (toolsSchema.sql creates the table; a
 * CREATE TABLE IF NOT EXISTS never adds columns to an existing DB). Additive and idempotent.
 *
 * listing_id / indexed_at identify an own listing across reads (sold-since-snapshot) and how long
 * it has sat unsold; item_json keeps a rare's rolls so a reprice check can search comparables
 * without re-reading the stash. All NULL for rows written before this migration.
 */
export const BALANCE_ITEM_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["listing_id", "TEXT"],
  ["indexed_at", "TEXT"],
  ["item_json", "TEXT"],
];

export function ensureWealthColumns(conn: Database.Database): void {
  const existing = new Set(
    (conn.prepare("PRAGMA table_info(balance_items)").all() as Array<{ name: string }>).map((r) => r.name),
  );
  if (existing.size === 0) throw new Error("ensureWealthColumns: balance_items missing — toolsSchema.sql must run first");
  for (const [name, def] of BALANCE_ITEM_COLUMNS) {
    if (!existing.has(name)) conn.exec(`ALTER TABLE balance_items ADD COLUMN ${name} ${def}`);
  }
  conn.exec("CREATE INDEX IF NOT EXISTS idx_balance_items_listing ON balance_items(listing_id)");
}
