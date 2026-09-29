import type Database from "better-sqlite3";
import { getDb } from "./database";
import { latestPriceRows } from "./latestSnapshotQueries";
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
 * poe.ninja's Divine line is the base unit (always 1) and the insert dedupe heartbeats every item
 * at least hourly, so a polled league has ~1 divine row per hour. Counting that one item rides the
 * (league, item_id, fetched_at) index instead of scanning every snapshot of every league.
 */
export const SENTINEL_ITEM_ID = "divine";

function sentinelRows(league: string, fromMs: number, toMs: number, db: Db): number {
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM price_snapshots
    WHERE league = ? AND item_id = ? AND fetched_at BETWEEN ? AND ?
  `).get(league, SENTINEL_ITEM_ID, toSqliteTime(fromMs), toSqliteTime(toMs)) as { n: number };
  return row.n;
}

/**
 * The league polled most densely between two times, or null when none was. Candidates are every
 * registered league plus `extra` (the default league may predate its registry row).
 */
export function busiestLeagueBetween(fromMs: number, toMs: number, extra: readonly string[], db: Db = getDb()): string | null {
  const registry = (db.prepare("SELECT league FROM league_registry").all() as Array<{ league: string }>).map((r) => r.league);
  let best: { league: string; n: number } | null = null;
  for (const league of [...new Set([...registry, ...extra])].sort()) {
    const n = sentinelRows(league, fromMs, toMs, db);
    if (n > 0 && (best === null || n > best.n)) best = { league, n };
  }
  return best?.league ?? null;
}

/** Did the poller store anything for the league in [fromMs, toMs]? */
export function polledBetween(league: string, fromMs: number, toMs: number, db: Db = getDb()): boolean {
  return sentinelRows(league, fromMs, toMs, db) > 0;
}

export interface NinjaCatalogRow {
  itemId: string;
  itemName: string;
  category: string;
  icon: string | null;
}

const CATALOG_TTL_MS = 3_600_000;
const CATALOG_MAX_LEAGUES = 8;
// Keyed by connection so a test's in-memory database never sees another database's rows.
const catalogMemo = new WeakMap<Db, Map<string, { atMs: number; rows: NinjaCatalogRow[] }>>();

/** Name, category and art from each item's latest row: the shared latest-row read. */
function readNinjaCatalog(league: string, db: Db): NinjaCatalogRow[] {
  return latestPriceRows(league, db).map((r) => ({ itemId: r.itemId, itemName: r.itemName, category: r.category, icon: r.icon }));
}

/**
 * Every item the league has ever had a snapshot for, with its latest name/category/art. The
 * read walks the league's whole index range, so it is memoized for an hour — names and
 * categories change only when ninja adds an item.
 */
export function ninjaCatalog(league: string, nowMs: number, db: Db = getDb()): NinjaCatalogRow[] {
  const perDb = catalogMemo.get(db) ?? new Map<string, { atMs: number; rows: NinjaCatalogRow[] }>();
  catalogMemo.set(db, perDb);
  const hit = perDb.get(league);
  if (hit && nowMs - hit.atMs < CATALOG_TTL_MS) return hit.rows;
  const rows = readNinjaCatalog(league, db);
  perDb.delete(league);
  perDb.set(league, { atMs: nowMs, rows });
  const oldest = perDb.keys().next();
  if (perDb.size > CATALOG_MAX_LEAGUES && !oldest.done) perDb.delete(oldest.value);
  return rows;
}

/** Resolved Currency Exchange names (league-agnostic: GGG base id → in-game name). */
export function cxItemNames(db: Db = getDb()): string[] {
  const rows = db.prepare("SELECT name FROM cx_items").all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/** Lowercased unique names poe2scout priced for the league (item_values keeps no history). */
export function scoutUniqueKeys(league: string, db: Db = getDb()): string[] {
  const rows = db.prepare("SELECT name_key AS nameKey FROM item_values WHERE league = ? AND source = 'scout' AND value_div > 0")
    .all(league) as Array<{ nameKey: string }>;
  return rows.map((r) => r.nameKey);
}

export interface PricePoint {
  ms: number;
  div: number;
}

export interface TimeRange {
  fromMs: number;
  toMs: number;
}

// SQLite's bound-parameter ceiling is 32 766; a league has ~600 exchange items.
const IDS_PER_QUERY = 500;

/**
 * Each item's snapshots inside the given ranges, oldest first (ranges must be chronological and
 * disjoint). Only the few hours around each lookup are read — `item_id IN (…)` lets SQLite seek
 * the (league, item_id, fetched_at) index once per item inside one statement — instead of the
 * whole week after the patch for every category member.
 */
export function itemPricesIn(league: string, itemIds: readonly string[], ranges: readonly TimeRange[], db: Db = getDb()): Map<string, PricePoint[]> {
  const out = new Map<string, PricePoint[]>(itemIds.map((id) => [id, []]));
  for (let i = 0; i < itemIds.length; i += IDS_PER_QUERY) {
    const chunk = itemIds.slice(i, i + IDS_PER_QUERY);
    const stmt = db.prepare(`
      SELECT item_id AS itemId, chaos_equiv AS div, fetched_at AS fetchedAt FROM price_snapshots
      WHERE league = ? AND item_id IN (${chunk.map(() => "?").join(",")}) AND fetched_at BETWEEN ? AND ?
      ORDER BY fetched_at ASC, id ASC
    `);
    for (const r of ranges) {
      const rows = stmt.all(league, ...chunk, toSqliteTime(r.fromMs), toSqliteTime(r.toMs)) as Array<{ itemId: string; div: number; fetchedAt: string }>;
      for (const row of rows) out.get(row.itemId)?.push({ ms: parseSqliteTimestamp(row.fetchedAt), div: row.div });
    }
  }
  return out;
}
