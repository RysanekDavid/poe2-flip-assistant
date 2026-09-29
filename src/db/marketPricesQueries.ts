import type Database from "better-sqlite3";
import { getDb } from "./database";

type Db = Database.Database;

/** One item's newest snapshot plus its latest 7-day trend, as the Prices overview reads it. */
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
 * Newest snapshot of every item in one league, with its trend, in ONE statement.
 *
 * A loose index scan (the pattern of priceAtQueries' ninja catalog): hop item_id → next item_id
 * with one seek on (league, item_id, fetched_at DESC), then seek each item's newest row. The
 * GROUP BY MAX(id) form that latestSnapshots uses walks every snapshot of the league, which grows
 * with the 30-day retention; this one costs two seeks per item whatever the history length.
 */
export function latestPriceRows(league: string, db: Db = getDb()): LatestPriceRow[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE ids(itemId) AS (
         SELECT MIN(item_id) FROM price_snapshots WHERE league = @league
         UNION ALL
         SELECT (SELECT MIN(item_id) FROM price_snapshots WHERE league = @league AND item_id > ids.itemId)
         FROM ids WHERE ids.itemId IS NOT NULL
       )
       SELECT s.item_id AS itemId, s.item_name AS itemName, s.category, s.chaos_equiv AS baseValue,
              s.volume, s.icon, s.fetched_at AS fetchedAt,
              sp.change_7d AS change7d, sp.spark_7d AS spark7dJson, sp.updated_at AS trendAt
       FROM ids
       JOIN price_snapshots s ON s.id = (
         SELECT id FROM price_snapshots WHERE league = @league AND item_id = ids.itemId
         ORDER BY fetched_at DESC, id DESC LIMIT 1
       )
       LEFT JOIN item_spark sp ON sp.league = s.league AND sp.item_id = s.item_id`,
    )
    .all({ league }) as RawRow[];
  return rows.map(({ spark7dJson, ...r }) => ({ ...r, spark7d: parseSpark(spark7dJson, r.itemId) }));
}
