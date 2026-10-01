import type Database from "better-sqlite3";
import { getDb } from "./database";

type Db = Database.Database;

/**
 * The ONE definition of "an item's current price": its newest price_snapshots row in a league by
 * fetched_at, ties broken by the higher id. Every current-price reader (positions, valuation,
 * flips, spreads, craft, the insert dedupe, the Prices overview) goes through here, so two panels
 * can never disagree about which row is "latest".
 *
 * Two shapes on purpose. LatestSnapshotRow never touches item_spark, so the write path (insert
 * dedupe), the catalog and price-only readers cannot be taken down by one corrupt sparkline.
 * LatestPriceRow adds the trend and fails loudly on a bad spark: only readers that render it pay.
 */
export interface LatestSnapshotRow {
  itemId: string;
  itemName: string;
  category: string;
  /** Divine per item (poe.ninja primaryValue, stored in the legacy chaos_equiv column). */
  baseValue: number;
  volume: number | null;
  icon: string | null;
  /** SQLite UTC write time of the snapshot row. */
  fetchedAt: string;
}

export interface LatestPriceRow extends LatestSnapshotRow {
  change7d: number | null;
  spark7d: number[] | null;
  /** SQLite UTC time item_spark was last refreshed; null when no trend row exists. */
  trendAt: string | null;
}

type RawPriceRow = LatestSnapshotRow & { change7d: number | null; spark7dJson: string | null; trendAt: string | null };

/** item_spark.spark_7d JSON → numbers; every failure names the item so a bad row is findable. */
function parseSpark(json: string | null, itemId: string): number[] | null {
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`item_spark.spark_7d for ${itemId} is not valid JSON`, { cause: e });
  }
  if (!Array.isArray(parsed) || !parsed.every((v): v is number => typeof v === "number")) {
    throw new Error(`item_spark.spark_7d for ${itemId} is not a number array`);
  }
  return parsed;
}

/**
 * Every item id of the league via a loose index scan: one seek on (league, item_id, fetched_at
 * DESC) hops to the next distinct item_id. The GROUP BY MAX(id) form this replaced walked every
 * snapshot of the league, which grows with the 30-day retention; this costs a seek per item.
 */
const ALL_ITEM_IDS = `WITH RECURSIVE ids(itemId) AS (
  SELECT MIN(item_id) FROM price_snapshots WHERE league = @league
  UNION ALL
  SELECT (SELECT MIN(item_id) FROM price_snapshots WHERE league = @league AND item_id > ids.itemId)
  FROM ids WHERE ids.itemId IS NOT NULL
)`;

const GIVEN_ITEM_IDS = `WITH ids(itemId) AS (SELECT DISTINCT value FROM json_each(@itemIds))`;

const SNAPSHOT_COLUMNS = `s.item_id AS itemId, s.item_name AS itemName, s.category, s.chaos_equiv AS baseValue,
  s.volume, s.icon, s.fetched_at AS fetchedAt`;

const NEWEST_ROW = `FROM ids
  JOIN price_snapshots s ON s.id = (
    SELECT id FROM price_snapshots WHERE league = @league AND item_id = ids.itemId
    ORDER BY fetched_at DESC, id DESC LIMIT 1
  )`;

const SNAPSHOT_SELECT = `SELECT ${SNAPSHOT_COLUMNS} ${NEWEST_ROW}`;
const PRICE_SELECT = `SELECT ${SNAPSHOT_COLUMNS},
    sp.change_7d AS change7d, sp.spark_7d AS spark7dJson, sp.updated_at AS trendAt
  ${NEWEST_ROW}
  LEFT JOIN item_spark sp ON sp.league = s.league AND sp.item_id = s.item_id`;

function toPriceRows(raw: RawPriceRow[]): LatestPriceRow[] {
  return raw.map(({ spark7dJson, ...r }) => ({ ...r, spark7d: parseSpark(spark7dJson, r.itemId) }));
}

/** Newest snapshot of every item in one league, WITHOUT the trend: cannot fail on item_spark. */
export function latestSnapshotRows(league: string, db: Db = getDb()): LatestSnapshotRow[] {
  return db.prepare(`${ALL_ITEM_IDS} ${SNAPSHOT_SELECT}`).all({ league }) as LatestSnapshotRow[];
}

/** Newest snapshot of every item in one league, with its trend, in ONE statement. */
export function latestPriceRows(league: string, db: Db = getDb()): LatestPriceRow[] {
  return toPriceRows(db.prepare(`${ALL_ITEM_IDS} ${PRICE_SELECT}`).all({ league }) as RawPriceRow[]);
}

/** Same rows for a known id set (craft materials, one chart): a seek per id, no scan of the
 *  league's ids. Ids with no snapshot in the league are absent from the result. */
export function latestPriceRowsFor(league: string, itemIds: readonly string[], db: Db = getDb()): LatestPriceRow[] {
  if (itemIds.length === 0) return [];
  const stmt = db.prepare(`${GIVEN_ITEM_IDS} ${PRICE_SELECT}`);
  return toPriceRows(stmt.all({ league, itemIds: JSON.stringify(itemIds) }) as RawPriceRow[]);
}

/** A newest snapshot plus its 7-day change only: no sparkline, so it cannot fail on a bad spark. */
export interface LatestChangeRow extends LatestSnapshotRow {
  change7d: number | null;
}

const CHANGE_SELECT = `SELECT ${SNAPSHOT_COLUMNS}, sp.change_7d AS change7d
  ${NEWEST_ROW}
  LEFT JOIN item_spark sp ON sp.league = s.league AND sp.item_id = s.item_id`;

/**
 * Price + 7-day change for a known id set, for readers that show a change but never draw the
 * curve (Farm › Strategies): a corrupt spark_7d must not take their whole route down.
 */
export function latestChangeRowsFor(league: string, itemIds: readonly string[], db: Db = getDb()): LatestChangeRow[] {
  if (itemIds.length === 0) return [];
  return db.prepare(`${GIVEN_ITEM_IDS} ${CHANGE_SELECT}`).all({ league, itemIds: JSON.stringify(itemIds) }) as LatestChangeRow[];
}
