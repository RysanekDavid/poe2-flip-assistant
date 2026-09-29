import type Database from "better-sqlite3";
import { getDb } from "./database";
import { parseStoredList } from "./patchSummaryMigrations";
import { parseSqliteTimestamp } from "../lib/sqliteTime";

/**
 * Point-in-time reads for Patches › price impact. Every query takes an explicit `db` (default
 * getDb()) so the feature tests run against an in-memory schema, like patchSummaryQueries.
 *
 * Times cross this boundary as SQLite text ("YYYY-MM-DD HH:MM:SS", UTC): price_snapshots.fetched_at
 * is CURRENT_TIMESTAMP text, and comparing text to text keeps the (league, item_id, fetched_at)
 * index usable.
 */

type Db = Database.Database;

/** Epoch ms → SQLite CURRENT_TIMESTAMP text. */
export function toSqliteTime(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

export interface PatchImpactSourceRow {
  threadId: number;
  title: string;
  publishedAt: string | null;
  publishedText: string;
  firstSeenAt: string;
  headings: string[];
  listItems: string[];
  bodyText: string | null;
  summaryJson: string | null;
}

type RawSourceRow = Omit<PatchImpactSourceRow, "headings" | "listItems"> & {
  headingsJson: string | null;
  listItemsJson: string | null;
};

/**
 * The patch texts and every timestamp the impact view may anchor on. first_seen_at lives here
 * rather than in patchSummaryQueries because only the impact view needs it (the fallback when
 * the forum's zone-less date text will not parse).
 */
export function patchImpactSource(threadId: number, db: Db = getDb()): PatchImpactSourceRow | null {
  const row = db.prepare(`
    SELECT p.thread_id AS threadId, p.title, p.published_at AS publishedAt, p.published_text AS publishedText,
      p.first_seen_at AS firstSeenAt, p.headings_json AS headingsJson, p.list_items_json AS listItemsJson,
      p.body_text AS bodyText, CASE WHEN s.status = 'done' THEN s.summary_json END AS summaryJson
    FROM official_patch p LEFT JOIN patch_summary s ON s.thread_id = p.thread_id
    WHERE p.thread_id = ?
  `).get(threadId) as RawSourceRow | undefined;
  if (!row) return null;
  const { headingsJson, listItemsJson, ...rest } = row;
  return {
    ...rest,
    headings: parseStoredList(headingsJson, "headings_json", threadId),
    listItems: parseStoredList(listItemsJson, "list_items_json", threadId),
  };
}

/**
 * The league that was polled most densely between two times, or null when nothing was stored.
 * Only polled leagues ever get price_snapshots rows, so "most rows" = the league the poller
 * actually followed across the patch.
 */
export function busiestLeagueBetween(fromMs: number, toMs: number, db: Db = getDb()): string | null {
  const row = db.prepare(`
    SELECT league, COUNT(*) AS n FROM price_snapshots
    WHERE fetched_at BETWEEN ? AND ? AND league <> ''
    GROUP BY league ORDER BY n DESC, league ASC LIMIT 1
  `).get(toSqliteTime(fromMs), toSqliteTime(toMs)) as { league: string; n: number } | undefined;
  return row?.league ?? null;
}

export interface NinjaCatalogRow {
  itemId: string;
  itemName: string;
  category: string;
  icon: string | null;
}

/** Every item the league has ever had a snapshot for, with its latest name/category/art. */
export function ninjaCatalog(league: string, db: Db = getDb()): NinjaCatalogRow[] {
  return db.prepare(`
    SELECT s.item_id AS itemId, s.item_name AS itemName, s.category, s.icon
    FROM price_snapshots s
    JOIN (SELECT item_id, MAX(id) AS mx FROM price_snapshots WHERE league = ? GROUP BY item_id) m
      ON m.item_id = s.item_id AND m.mx = s.id
  `).all(league) as NinjaCatalogRow[];
}

/** Resolved Currency Exchange names (league-agnostic: GGG base id → in-game name). */
export function cxItemNames(db: Db = getDb()): string[] {
  const rows = db.prepare("SELECT name FROM cx_items").all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/** Lowercased unique names poe2scout priced for the league (item_values keeps no history). */
export function scoutUniqueKeys(league: string, db: Db = getDb()): string[] {
  const rows = db.prepare("SELECT name_key AS nameKey FROM item_values WHERE league = ? AND source = 'scout'")
    .all(league) as Array<{ nameKey: string }>;
  return rows.map((r) => r.nameKey);
}

export interface PricePoint {
  ms: number;
  div: number;
}

/**
 * One item's snapshots in [fromMs, toMs], oldest first. Per-item reads ride the
 * (league, item_id, fetched_at) index; a league-wide window scan would read ~30 days of rows.
 */
export function itemPricesBetween(league: string, itemIds: readonly string[], fromMs: number, toMs: number, db: Db = getDb()): Map<string, PricePoint[]> {
  const stmt = db.prepare(`
    SELECT chaos_equiv AS div, fetched_at AS fetchedAt FROM price_snapshots
    WHERE league = ? AND item_id = ? AND fetched_at BETWEEN ? AND ?
    ORDER BY fetched_at ASC, id ASC
  `);
  const from = toSqliteTime(fromMs);
  const to = toSqliteTime(toMs);
  const out = new Map<string, PricePoint[]>();
  for (const itemId of itemIds) {
    const rows = stmt.all(league, itemId, from, to) as Array<{ div: number; fetchedAt: string }>;
    out.set(itemId, rows.map((r) => ({ ms: parseSqliteTimestamp(r.fetchedAt), div: r.div })));
  }
  return out;
}

/** Oldest stored snapshot for the league — before it the market history simply does not exist. */
export function oldestSnapshotMs(league: string, db: Db = getDb()): number | null {
  const row = db.prepare("SELECT MIN(fetched_at) AS mn FROM price_snapshots WHERE league = ?")
    .get(league) as { mn: string | null };
  return row.mn == null ? null : parseSqliteTimestamp(row.mn);
}
