/* Functional test of the snapshot dedup + item_spark split against a TEMP DB.
 * Run: DB_PATH=<temp>.db AUTH_SECRET=x npx tsx src/scripts/testDbCompact.ts */
import { getDb } from "../db/database";
import { insertSnapshots, latestSnapshots, itemSpark } from "../db/marketQueries";
import { config } from "../config/env";
import { getActiveLeague } from "../core/leagueState";
import type { PricedItem } from "../api/types";

if (!config.dbPath.includes("scratchpad") && !config.dbPath.includes("tmp") && !config.dbPath.includes("temp")) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const db = getDb();
db.exec("DELETE FROM price_snapshots; DELETE FROM item_spark;");
const league = getActiveLeague();

const item = (id: string, price: number, volume: number, spark: number[] | null = [1, 2, 3], change = 5): PricedItem => ({
  itemId: id,
  itemName: id,
  category: "Currency",
  baseValue: price,
  volume,
  change7d: change,
  spark7d: spark,
  icon: null,
});

// 1. first insert → both new
ok("first insert writes 2 rows", insertSnapshots(league, [item("a", 10, 100), item("b", 20, 200)]) === 2);

// 2. same PRICE, different volume + change → deduped (the old bug inserted these)
ok("same price, diff volume → 0 new rows", insertSnapshots(league, [item("a", 10, 999, [9], 99), item("b", 20, 888, [8], 88)]) === 0);

// 3. price change → 1 new row (and fresh spark [7,7]/77 upserted for a)
ok("price change → 1 new row", insertSnapshots(league, [item("a", 11, 100, [7, 7], 77), item("b", 20, 200)]) === 1);

const rows = (db.prepare("SELECT COUNT(*) AS c FROM price_snapshots").get() as { c: number }).c;
ok("total snapshot rows = 3 (a×2, b×1)", rows === 3, String(rows));

// 4. snapshot rows carry NO spark blob (moved to item_spark)
const sparkInSnaps = (db.prepare("SELECT COUNT(*) AS c FROM price_snapshots WHERE spark_7d IS NOT NULL").get() as { c: number }).c;
ok("no spark_7d duplicated into snapshots", sparkInSnaps === 0, String(sparkInSnaps));

// 5. item_spark holds the LATEST spark/change per item (last upsert wins → [7,7]/77)
const sp = itemSpark(league, "a");
ok("itemSpark returns latest spark", JSON.stringify(sp.spark7d) === JSON.stringify([7, 7]), JSON.stringify(sp.spark7d));
ok("itemSpark returns latest change", sp.change7d === 77, String(sp.change7d));
ok("itemSpark returns latest baseValue", sp.baseValue === 11, String(sp.baseValue));

// 6. latestSnapshots joins item_spark + tie-breaks on id (latest price = 11)
const latest = latestSnapshots(league);
const a = latest.find((x) => x.itemId === "a");
ok("latestSnapshots latest price = 11", a?.baseValue === 11, String(a?.baseValue));
ok("latestSnapshots carries spark from item_spark", JSON.stringify(a?.spark7d) === JSON.stringify([7, 7]), JSON.stringify(a?.spark7d));
ok("latestSnapshots carries change from item_spark", a?.change7d === 77, String(a?.change7d));

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
db.close();
process.exit(fail === 0 ? 0 : 1);
