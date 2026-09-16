/**
 * One-time price_snapshots compaction. Two wins:
 *   1. migrate the latest sparkline per item into item_spark, then NULL the spark_7d/change_7d
 *      blobs duplicated across every historical row (the row-SIZE bug);
 *   2. downsample history to one row per item per hour (the row-COUNT bug — ninja only updates
 *      hourly, so sub-hour rows are redundant).
 * Then VACUUM to actually shrink the file.
 *
 * Every grouping here is keyed by (league, item_id): market history is league-scoped, so
 * grouping on item_id alone would treat two leagues' rows for the same orb as duplicates of
 * each other and delete the live league's row in favour of a retired one.
 *
 * Dry-run by default (prints the plan). Apply for real:
 *   DB_PATH=./data/poe2flip.db npx tsx src/scripts/compactDb.ts --apply
 * BACK UP / stop the poller first — this rewrites the table.
 */
import { getDb } from "../db/database";
import { config } from "../config/env";

const apply = process.argv.includes("--apply");
const db = getDb(); // runs schema → ensures item_spark exists

const mb = (pages: number, size: number) => Math.round((pages * size) / 1024 / 1024);
const pageSize = (db.prepare("PRAGMA page_size").get() as { page_size: number }).page_size;
const before = (db.prepare("PRAGMA page_count").get() as { page_count: number }).page_count;
const rowsBefore = (db.prepare("SELECT COUNT(*) AS c FROM price_snapshots").get() as { c: number }).c;

const dupHourly = (
  db
    .prepare(
      `SELECT COUNT(*) AS c FROM price_snapshots
       WHERE id NOT IN (
         SELECT MAX(id) FROM price_snapshots
         GROUP BY league, item_id, strftime('%Y-%m-%d %H', fetched_at)
       )`,
    )
    .get() as { c: number }
).c;
const withSpark = (db.prepare("SELECT COUNT(*) AS c FROM price_snapshots WHERE spark_7d IS NOT NULL").get() as { c: number }).c;

console.log(`DB: ${config.dbPath}`);
console.log(`file ~${mb(before, pageSize)} MB · price_snapshots ${rowsBefore} rows`);
console.log(`  → hourly downsample would delete ${dupHourly} rows (keep ~${rowsBefore - dupHourly})`);
console.log(`  → ${withSpark} rows carry a spark_7d blob to clear`);

if (!apply) {
  console.log("\nDRY RUN — re-run with --apply to execute (stop the poller / back up first).");
  db.close();
  process.exit(0);
}

console.log("\napplying…");

// 1. preserve the latest spark per item into item_spark before we clear the column
const migrated = db
  .prepare(
    `INSERT INTO item_spark (league, item_id, spark_7d, change_7d, updated_at)
     SELECT s.league, s.item_id, s.spark_7d, s.change_7d, CURRENT_TIMESTAMP
     FROM price_snapshots s
     JOIN (SELECT league, item_id, MAX(fetched_at) AS mx FROM price_snapshots
           GROUP BY league, item_id) m
       ON m.league = s.league AND m.item_id = s.item_id AND m.mx = s.fetched_at
     WHERE s.spark_7d IS NOT NULL
     ON CONFLICT(league, item_id) DO NOTHING`,
  )
  .run().changes;
console.log(`  item_spark: migrated ${migrated} item(s)`);

// 2. hourly downsample
const deleted = db
  .prepare(
    `DELETE FROM price_snapshots
     WHERE id NOT IN (
       SELECT MAX(id) FROM price_snapshots
       GROUP BY league, item_id, strftime('%Y-%m-%d %H', fetched_at)
     )`,
  )
  .run().changes;
console.log(`  downsample: deleted ${deleted} rows`);

// 3. clear the duplicated blobs from the survivors
const cleared = db.prepare("UPDATE price_snapshots SET spark_7d = NULL, change_7d = NULL WHERE spark_7d IS NOT NULL OR change_7d IS NOT NULL").run().changes;
console.log(`  cleared spark/change on ${cleared} surviving rows`);

// 4. reclaim space
console.log("  VACUUM…");
db.exec("VACUUM");

const after = (db.prepare("PRAGMA page_count").get() as { page_count: number }).page_count;
const rowsAfter = (db.prepare("SELECT COUNT(*) AS c FROM price_snapshots").get() as { c: number }).c;
console.log(`\ndone: ${mb(before, pageSize)} MB → ${mb(after, pageSize)} MB · ${rowsBefore} → ${rowsAfter} rows`);
db.close();
