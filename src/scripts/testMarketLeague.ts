/* League-scoping of the real market queries, against a TEMP DB.
 * Run: npm run test:market-league (src/scripts/runWithTestEnv.ts sets DB_PATH). */
import assert from "node:assert/strict";
import { getDb } from "../db/database";
import { config } from "../config/env";
import {
  insertSnapshots,
  itemSpark,
  itemValuesAgeHours,
  latestFetchedAt,
  latestSnapshots,
  observedPrices,
  priceHistory,
  pruneSnapshots,
  recordObservation,
  searchItems,
  uniqueValueMap,
  upsertItemValues,
} from "../db/marketQueries";
import {
  getCraftMargins,
  getCurrencyDivMap,
  getMarginHistory,
  getMaterialPrices,
  insertMarginHistory,
  upsertCraftMargin,
} from "../db/craftQueries";
import type { PricedItem } from "../api/types";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

const A = "League Alpha";
const B = "League Beta";

const db = getDb();
db.exec(`
  DELETE FROM price_snapshots; DELETE FROM item_spark; DELETE FROM item_values;
  DELETE FROM price_book_obs; DELETE FROM craft_margin_reports; DELETE FROM craft_margin_history;
`);

const item = (id: string, name: string, price: number, volume = 100): PricedItem => ({
  itemId: id,
  itemName: name,
  category: "Currency",
  baseValue: price,
  volume,
  change7d: price,
  spark7d: [price],
  icon: null,
});

testSnapshotsAreScoped();
testValuationCacheIsScoped();
testPriceBookIsScoped();
testCraftTablesAreScoped();
testPruneIsLeagueAgnostic();

db.close();
console.log("ALL PASS — market queries are league-scoped and prunes stay league-agnostic");

/**
 * The same item id exists in every league at a different price. Reading one league must never
 * surface the other's number — that cross-league leak is what the old purge existed to prevent.
 */
function testSnapshotsAreScoped(): void {
  assert.equal(insertSnapshots(A, [item("divine", "Divine Orb", 1), item("exalted", "Exalted Orb", 0.002)]), 2);
  assert.equal(insertSnapshots(B, [item("divine", "Divine Orb", 1), item("exalted", "Exalted Orb", 0.009)]), 2);

  // A second league's rows are additional, never a replacement.
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM price_snapshots").get() as { c: number }).c, 4);

  const a = latestSnapshots(A);
  const b = latestSnapshots(B);
  assert.equal(a.length, 2);
  assert.equal(a.find((r) => r.itemId === "exalted")?.baseValue, 0.002);
  assert.equal(b.find((r) => r.itemId === "exalted")?.baseValue, 0.009);

  // Dedupe is per league: A already has these exact prices, B is untouched by A's write.
  assert.equal(insertSnapshots(A, [item("divine", "Divine Orb", 1)]), 0);
  assert.equal(insertSnapshots(A, [item("divine", "Divine Orb", 2)]), 1);
  assert.equal(latestSnapshots(B).find((r) => r.itemId === "divine")?.baseValue, 1);

  assert.equal(priceHistory(A, "divine").length, 2);
  assert.equal(priceHistory(B, "divine").length, 1);

  // item_spark is keyed (league, item_id), so each league keeps its own latest series.
  assert.equal(itemSpark(A, "divine").baseValue, 2);
  assert.equal(itemSpark(B, "divine").baseValue, 1);
  assert.equal(itemSpark("No Such League", "divine").baseValue, null);

  assert.deepEqual(
    searchItems(A, "Divine").map((r) => r.itemId),
    ["divine"],
  );
  assert.deepEqual(searchItems("No Such League", "Divine"), []);
  assert.notEqual(latestFetchedAt(A), null);
  assert.equal(latestFetchedAt("No Such League"), null);
}

function testValuationCacheIsScoped(): void {
  upsertItemValues(A, [{ nameKey: "igniferis", div: 2.5, source: "scout" }]);
  upsertItemValues(B, [{ nameKey: "igniferis", div: 40, source: "scout" }]);
  assert.equal(uniqueValueMap(A).get("igniferis"), 2.5);
  assert.equal(uniqueValueMap(B).get("igniferis"), 40);
  assert.equal(uniqueValueMap("No Such League").size, 0);

  // Re-upsert updates in place rather than colliding across leagues.
  upsertItemValues(A, [{ nameKey: "igniferis", div: 3, source: "scout" }]);
  assert.equal(uniqueValueMap(A).get("igniferis"), 3);
  assert.equal(uniqueValueMap(B).get("igniferis"), 40);

  assert.notEqual(itemValuesAgeHours(A), null);
  assert.equal(itemValuesAgeHours("No Such League"), null);
}

function testPriceBookIsScoped(): void {
  recordObservation(A, "sig-1", "Sapphire Ring", 5, "listing-a");
  recordObservation(B, "sig-1", "Sapphire Ring", 90, "listing-b");
  assert.deepEqual(observedPrices(A, "sig-1"), [5]);
  assert.deepEqual(observedPrices(B, "sig-1"), [90]);
  assert.deepEqual(observedPrices("No Such League", "sig-1"), []);

  // listing ids are globally unique on trade2, so the dedupe stays global on purpose.
  recordObservation(A, "sig-1", "Sapphire Ring", 7, "listing-a");
  assert.deepEqual(observedPrices(A, "sig-1"), [5]);
}

function testCraftTablesAreScoped(): void {
  upsertCraftMargin(A, "recipe-1", '{"a":1}', 10, 50);
  upsertCraftMargin(B, "recipe-1", '{"b":1}', 99, 1);
  insertMarginHistory(A, "recipe-1", 10, 50);
  insertMarginHistory(B, "recipe-1", 99, 1);

  assert.equal(getCraftMargins(A).length, 1);
  assert.equal(getCraftMargins(A)[0]?.ev_div, 10);
  assert.equal(getCraftMargins(B)[0]?.ev_div, 99);
  assert.equal(getCraftMargins("No Such League").length, 0);
  assert.deepEqual(
    getMarginHistory(A, "recipe-1").map((h) => h.ev_div),
    [10],
  );
  assert.deepEqual(
    getMarginHistory(B, "recipe-1").map((h) => h.ev_div),
    [99],
  );

  // Material/currency price maps read price_snapshots, so they are scoped the same way.
  assert.equal(getCurrencyDivMap(A).get("exalted"), 0.002);
  assert.equal(getCurrencyDivMap(B).get("exalted"), 0.009);
  assert.equal(getMaterialPrices(A, ["divine"]).get("divine")?.priceDiv, 2);
  assert.equal(getMaterialPrices(B, ["divine"]).get("divine")?.priceDiv, 1);
  assert.equal(getMaterialPrices("No Such League", ["divine"]).size, 0);
}

/** Retention is a storage ceiling measured in days — it has nothing to say about leagues. */
function testPruneIsLeagueAgnostic(): void {
  db.prepare("UPDATE price_snapshots SET fetched_at = datetime('now', '-40 days') WHERE item_id = 'exalted'").run();
  const deleted = pruneSnapshots(30);
  assert.equal(deleted, 2, "both leagues' aged rows should be pruned in one sweep");
  assert.deepEqual(
    latestSnapshots(A).map((r) => r.itemId),
    ["divine"],
  );
  assert.deepEqual(
    latestSnapshots(B).map((r) => r.itemId),
    ["divine"],
  );
}
