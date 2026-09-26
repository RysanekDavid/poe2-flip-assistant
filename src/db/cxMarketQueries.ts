import { getDb } from "./database";

/**
 * Persistence for GGG's hourly currency-exchange digest (tables in cxMigrations.ts).
 *
 * GGG only serves past hours and does not promise to keep them, so this is our own copy of the
 * market history the Top Flips edge, persistence and liquidity numbers are computed from.
 * Every read is scoped by an explicit league, like marketQueries.
 */

/** One stored market-hour. `_a`/`_b` follow item_a/item_b, with item_a < item_b. */
export interface CxMarketRow {
  league: string;
  hour: number;
  item_a: string;
  item_b: string;
  volume_a: number;
  volume_b: number;
  low_ratio_a: number | null;
  low_ratio_b: number | null;
  high_ratio_a: number | null;
  high_ratio_b: number | null;
  low_stock_a: number | null;
  low_stock_b: number | null;
  high_stock_a: number | null;
  high_stock_b: number | null;
}

const COLUMNS = [
  "league",
  "hour",
  "item_a",
  "item_b",
  "volume_a",
  "volume_b",
  "low_ratio_a",
  "low_ratio_b",
  "high_ratio_a",
  "high_ratio_b",
  "low_stock_a",
  "low_stock_b",
  "high_stock_a",
  "high_stock_b",
] as const;

const KEY = new Set(["league", "hour", "item_a", "item_b"]);

/**
 * Store one league-hour's markets and mark that hour ingested, in ONE transaction: a crash
 * between the two would otherwise leave an hour that has rows but is re-downloaded forever, or
 * one marked done with half its markets. Idempotent — a re-ingest overwrites the same keys.
 */
export function storeCxHour(league: string, hour: number, rows: readonly CxMarketRow[]): void {
  const db = getDb();
  const updates = COLUMNS.filter((c) => !KEY.has(c)).map((c) => `${c} = excluded.${c}`);
  const upsert = db.prepare(
    `INSERT INTO cx_markets (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map((c) => `@${c}`).join(", ")})
     ON CONFLICT(league, hour, item_a, item_b) DO UPDATE SET ${updates.join(", ")}`,
  );
  const mark = db.prepare(
    `INSERT INTO cx_ingest (league, hour, markets) VALUES (?, ?, ?)
     ON CONFLICT(league, hour) DO UPDATE SET markets = excluded.markets, ingested_at = CURRENT_TIMESTAMP`,
  );
  db.transaction(() => {
    for (const row of rows) {
      if (row.league !== league || row.hour !== hour) {
        throw new Error(`cx row for ${row.league}@${row.hour} passed to storeCxHour(${league}, ${hour})`);
      }
      upsert.run(row);
    }
    mark.run(league, hour, rows.length);
  })();
}

/** Digest hours already stored for a league at or after `fromHour`. */
export function ingestedCxHours(league: string, fromHour: number): Set<number> {
  const rows = getDb()
    .prepare("SELECT hour FROM cx_ingest WHERE league = ? AND hour >= ?")
    .all(league, fromHour) as Array<{ hour: number }>;
  return new Set(rows.map((r) => r.hour));
}

/** Every stored market-hour for a league at or after `fromHour`, oldest first. */
export function cxMarketsSince(league: string, fromHour: number): CxMarketRow[] {
  return getDb()
    .prepare(`SELECT ${COLUMNS.join(", ")} FROM cx_markets WHERE league = ? AND hour >= ? ORDER BY hour ASC`)
    .all(league, fromHour) as CxMarketRow[];
}

/** Newest digest hour stored for a league, or null when there is no history yet. */
export function newestCxHour(league: string): number | null {
  const row = getDb().prepare("SELECT MAX(hour) AS mx FROM cx_ingest WHERE league = ?").get(league) as {
    mx: number | null;
  };
  return row.mx ?? null;
}

/** Drop history older than `beforeHour` for every league. Returns market rows removed. */
export function pruneCxHistory(beforeHour: number): number {
  const db = getDb();
  const removed = db.prepare("DELETE FROM cx_markets WHERE hour < ?").run(beforeHour).changes;
  db.prepare("DELETE FROM cx_ingest WHERE hour < ?").run(beforeHour);
  return removed;
}

/** Base ids that already have a resolved name — the rest need a catalog lookup. */
export function namedCxItemIds(): Set<string> {
  const rows = getDb().prepare("SELECT base_id FROM cx_items").all() as Array<{ base_id: string }>;
  return new Set(rows.map((r) => r.base_id));
}

/** Record resolved names. Existing rows are refreshed, never duplicated. */
export function upsertCxItemNames(names: ReadonlyMap<string, string>): void {
  if (names.size === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO cx_items (base_id, name) VALUES (?, ?)
     ON CONFLICT(base_id) DO UPDATE SET name = excluded.name, resolved_at = CURRENT_TIMESTAMP`,
  );
  db.transaction(() => {
    for (const [id, name] of names) stmt.run(id, name);
  })();
}

/** Every resolved base id → name. */
export function cxItemNames(): Map<string, string> {
  const rows = getDb().prepare("SELECT base_id, name FROM cx_items").all() as Array<{ base_id: string; name: string }>;
  return new Map(rows.map((r) => [r.base_id, r.name]));
}
