import type Database from "better-sqlite3";
import { getDb } from "./database";

type Db = Database.Database;

/**
 * The ONE definition of "an item's current price": its newest price_snapshots row in a league by
 * fetched_at, ties broken by the higher id. Every current-price reader (positions, valuation,
 * flips, spreads, craft, the insert dedupe, the Prices overview) goes through here, so two panels
 * can never disagree about which row is "latest".
 */
export interface LatestPriceRow {
  itemId: string;
  itemName: string;
  category: string;
  /** Divine per item (poe.ninja primaryValue, stored in the legacy chaos_equiv column). */
  baseValue: number;
  volume: number | null;
  icon: string | null;
  /** SQLite UTC write time of the snapshot row. */
  fetchedAt: string;
  change7d: number | null;
  spark7d: number[] | null;
  /** SQLite UTC time item_spark was last refreshed; null when no trend row exists. */
  trendAt: string | null;
}

type RawRow = Omit<LatestPriceRow, "spark7d"> & { spark7dJson: string | null };

function parseSpark(json: string | null, itemId: string): number[] | null {
  if (json === null) return null;
  const parsed: unknown = JSON.parse(json);
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

const LATEST_ROW_SELECT = `
  SELECT s.item_id AS itemId, s.item_name AS itemName, s.category, s.chaos_equiv AS baseValue,
         s.volume, s.icon, s.fetched_at AS fetchedAt,
         sp.change_7d AS change7d, sp.spark_7d AS spark7dJson, sp.updated_at AS trendAt
  FROM ids
  JOIN price_snapshots s ON s.id = (
    SELECT id FROM price_snapshots WHERE league = @league AND item_id = ids.itemId
    ORDER BY fetched_at DESC, id DESC LIMIT 1
  )
  LEFT JOIN item_spark sp ON sp.league = s.league AND sp.item_id = s.item_id`;

function toRows(raw: RawRow[]): LatestPriceRow[] {
  return raw.map(({ spark7dJson, ...r }) => ({ ...r, spark7d: parseSpark(spark7dJson, r.itemId) }));
}

/** Newest snapshot of every item in one league, with its trend, in ONE statement. */
export function latestPriceRows(league: string, db: Db = getDb()): LatestPriceRow[] {
  return toRows(db.prepare(`${ALL_ITEM_IDS} ${LATEST_ROW_SELECT}`).all({ league }) as RawRow[]);
}

/** Same rows for a known id set (craft materials): a seek per id, no scan of the league's ids.
 *  Ids with no snapshot in the league are absent from the result. */
export function latestPriceRowsFor(league: string, itemIds: readonly string[], db: Db = getDb()): LatestPriceRow[] {
  if (itemIds.length === 0) return [];
  const stmt = db.prepare(`${GIVEN_ITEM_IDS} ${LATEST_ROW_SELECT}`);
  return toRows(stmt.all({ league, itemIds: JSON.stringify(itemIds) }) as RawRow[]);
}
