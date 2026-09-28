/* Price regex scaffold: regex_presets exists in the temp DB, loads after its FK target, and is
 * unique per (user, name) with a cascade on user delete. Run: npm run test:tools:regex */
import assert from "node:assert/strict";
import { applicationSchemaSql } from "../../db/schemaFiles";
import { assertToolPanel, columnsOf, freshToolsDb, insertUser } from "./toolsTestKit";

function testSchemaOrder(): void {
  const ddl = applicationSchemaSql();
  const users = ddl.indexOf("CREATE TABLE IF NOT EXISTS users");
  const snapshots = ddl.indexOf("CREATE TABLE IF NOT EXISTS balance_snapshots");
  const presets = ddl.indexOf("CREATE TABLE IF NOT EXISTS regex_presets");
  const items = ddl.indexOf("CREATE TABLE IF NOT EXISTS balance_items");
  assert.ok(users >= 0 && snapshots >= 0 && presets >= 0 && items >= 0, "all four tables must be in the application DDL");
  assert.ok(users < presets && snapshots < items, "FK targets must be created before the tools tables");
}

function testPresets(): void {
  const db = freshToolsDb();
  assert.deepEqual(columnsOf(db, "regex_presets"), [
    "id", "user_id", "league", "name", "params_json", "created_at", "updated_at",
  ]);
  const insert = db.prepare("INSERT INTO regex_presets (user_id, league, name, params_json) VALUES (?, 'L', ?, '{}')");
  const alice = insertUser(db, "regex-alice");
  const bob = insertUser(db, "regex-bob");
  insert.run(alice, "chaos 5+");
  insert.run(bob, "chaos 5+"); // same name, different user — allowed
  assert.throws(() => insert.run(alice, "chaos 5+"), /UNIQUE/, "name is unique per user");
  assert.throws(() => insert.run(999_999, "orphan"), /FOREIGN KEY/, "preset needs a real user");

  db.prepare("DELETE FROM users WHERE id = ?").run(alice);
  const left = db.prepare("SELECT user_id FROM regex_presets").all() as Array<{ user_id: number }>;
  assert.deepEqual(left.map((r) => r.user_id), [bob], "deleting a user cascades to their presets only");
}

testSchemaOrder();
testPresets();
assertToolPanel("regex", "RegexTool");
console.log("ALL PASS — regex_presets schema order, per-user uniqueness, user cascade, panel wiring");
