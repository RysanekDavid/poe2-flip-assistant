/* Liquidate scaffold: balance_items exists in the temp DB, is indexed by snapshot, defaults a
 * stack to 1 and cascades when its balance snapshot is deleted. Run: npm run test:tools:liquidate */
import assert from "node:assert/strict";
import type Database from "better-sqlite3";
import { assertToolPanel, columnsOf, freshToolsDb } from "./toolsTestKit";

function insertSnapshot(db: Database.Database): number {
  const result = db
    .prepare(
      `INSERT INTO balance_snapshots (user_id, league, exalt_per_div, chaos_per_div, net_worth_div, source)
       VALUES (1, 'L', 400, 20, 0, 'manual')`,
    )
    .run();
  return Number(result.lastInsertRowid);
}

function testBalanceItems(): void {
  const db = freshToolsDb();
  assert.deepEqual(columnsOf(db, "balance_items"), [
    "id", "snapshot_id", "tab", "item_name", "base_type", "rarity", "stack_size",
    "market_div", "market_source", "ask_amount", "ask_currency",
  ]);
  const index = db.prepare("SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = 'idx_balance_items_snap'").get();
  assert.deepEqual(index, { tbl_name: "balance_items" });

  const insert = db.prepare("INSERT INTO balance_items (snapshot_id, item_name) VALUES (?, ?)");
  const keep = insertSnapshot(db);
  const drop = insertSnapshot(db);
  insert.run(keep, "Divine Orb");
  insert.run(drop, "Exalted Orb");
  assert.throws(() => insert.run(999_999, "orphan"), /FOREIGN KEY/, "item needs a real snapshot");
  const stack = db.prepare("SELECT stack_size FROM balance_items WHERE snapshot_id = ?").get(keep);
  assert.deepEqual(stack, { stack_size: 1 }, "stack_size defaults to 1");

  db.prepare("DELETE FROM balance_snapshots WHERE id = ?").run(drop);
  const left = db.prepare("SELECT item_name FROM balance_items").all() as Array<{ item_name: string }>;
  assert.deepEqual(left.map((r) => r.item_name), ["Divine Orb"], "deleting a snapshot cascades to its items only");
}

testBalanceItems();
assertToolPanel("liquidate", "LiquidateTool");
console.log("ALL PASS — balance_items columns, snapshot index, stack default, snapshot cascade, panel wiring");
