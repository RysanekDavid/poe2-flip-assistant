/* Seven-features storage (db/featureMigrations) against a FRESH temp DB: every table and column
 * lands through the real migration chain, a second full run changes nothing, a pre-board
 * notify_settings upgrades in place, FKs cascade, and CHECK constraints reject impossible rows.
 * Also the new config keys: defaults and loud failure on a bad flag. No network.
 * Run: npm run test:features-schema (runWithTestEnv.ts features-schema sets DB_PATH). */
import { rmSync } from "node:fs";
import Database from "better-sqlite3";
import { config, flag } from "../config/env";
import { getDb, runMigrations } from "../db/database";
import { ensureFeatureTables, SNIPE_OUTCOME_CHECK_COLUMNS } from "../db/featureMigrations";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}
// A leftover file from an earlier run would hide first-migration bugs behind IF NOT EXISTS.
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${config.dbPath}${suffix}`, { force: true });

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const KEYED_TABLES = ["farm_user_speed", "mod_value_cache", "snipe_outcomes", "cx_start_days", "cx_start_ingest", "cx_start_meta"];

const db = getDb();

testTablesCreated();
testDoubleRunIdempotent();
testLegacyNotifySettingsUpgrade();
testLegacySnipeOutcomesUpgrade();
testMissingNotifySettingsFailsLoudly();
testChecks();
testBoardColumns();
testConfig();

if (fail > 0) {
  console.error(`\n${fail} FAILED`);
  process.exit(1);
}
console.log("\nALL PASS — feature schema");

function schemaSnapshot(conn: Database.Database): string {
  const objects = conn.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all();
  const board = conn.prepare("PRAGMA table_info(notify_settings)").all();
  return JSON.stringify({ objects, board });
}

function columns(conn: Database.Database, table: string): Array<{ name: string; notnull: number; dflt_value: string | null }> {
  return conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; notnull: number; dflt_value: string | null }>;
}

function throws(fn: () => unknown, pattern: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return pattern.test(e instanceof Error ? e.message : String(e));
  }
}

function testTablesCreated(): void {
  for (const table of KEYED_TABLES) {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string } | undefined;
    ok(`${table} created`, row != null);
    ok(`${table} is WITHOUT ROWID`, row != null && /WITHOUT ROWID/i.test(row.sql));
  }
  const index = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_snipe_outcomes_alerted'").get();
  ok("snipe_outcomes alerted_at index created", index != null);
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT listing_id FROM snipe_outcomes WHERE alerted_at <= ?").all(0) as Array<{ detail: string }>;
  ok("due-row scan uses the alerted_at index", plan.some((p) => /idx_snipe_outcomes_alerted/.test(p.detail)), JSON.stringify(plan));
  const fks = db.prepare("PRAGMA foreign_key_list(farm_user_speed)").all() as Array<{ table: string; on_delete: string }>;
  ok("farm_user_speed → users ON DELETE CASCADE", fks.length === 1 && fks[0]?.table === "users" && fks[0]?.on_delete === "CASCADE");
}

function testDoubleRunIdempotent(): void {
  const before = schemaSnapshot(db);
  ensureFeatureTables(db);
  ensureFeatureTables(db);
  ok("ensureFeatureTables twice more changes nothing", schemaSnapshot(db) === before);

  // The whole chain again on a second connection — what a web + poller double boot does.
  const second = new Database(config.dbPath);
  second.pragma("foreign_keys = ON");
  let error = "";
  try {
    runMigrations(second);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  ok("full migration chain re-runs without error", error === "", error);
  ok("full migration chain re-run changes nothing", schemaSnapshot(second) === before);
  second.close();
}

/** A DB whose snipe_outcomes is Wave 0's shape (no checker columns) with a tracked row. */
function testLegacySnipeOutcomesUpgrade(): void {
  const legacy = new Database(":memory:");
  legacy.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE notify_settings (user_id INTEGER PRIMARY KEY);
    CREATE TABLE snipe_outcomes (
      listing_id TEXT PRIMARY KEY, league TEXT NOT NULL, profile TEXT NOT NULL, base_type TEXT NOT NULL,
      item_name TEXT NOT NULL, ask_div REAL NOT NULL, value_div REAL NOT NULL, margin_pct REAL NOT NULL,
      samples INTEGER NOT NULL, query_id TEXT, alerted_at INTEGER NOT NULL,
      check_2h TEXT, check_2h_at INTEGER, check_2h_ask_div REAL,
      check_24h TEXT, check_24h_at INTEGER, check_24h_ask_div REAL, last_error TEXT
    ) WITHOUT ROWID;
    INSERT INTO snipe_outcomes (listing_id, league, profile, base_type, item_name, ask_div, value_div, margin_pct, samples, query_id, alerted_at, check_2h)
      VALUES ('old1', 'L', 'ring', 'Ruby Ring', 'x', 1, 2, 50, 5, 'q', 1, 'gone');
  `);
  ensureFeatureTables(legacy);
  ensureFeatureTables(legacy);
  const have = new Set(columns(legacy, "snipe_outcomes").map((c) => c.name));
  ok("legacy snipe_outcomes gains every checker column", SNIPE_OUTCOME_CHECK_COLUMNS.every(([name]) => have.has(name)));
  const r = legacy.prepare("SELECT check_2h, attempts, check_2h_method FROM snipe_outcomes WHERE listing_id = 'old1'").get() as Record<string, unknown>;
  ok("legacy tracked row kept; attempts 0, method NULL", r.check_2h === "gone" && r.attempts === 0 && r.check_2h_method === null);
  ok("legacy DB gets snipe_outcome_meta", legacy.prepare("SELECT 1 FROM sqlite_master WHERE name = 'snipe_outcome_meta'").get() != null);
  legacy.close();
}

/** A DB from before the live board: notify_settings exists with a row, without the board columns. */
function testLegacyNotifySettingsUpgrade(): void {
  const legacy = new Database(":memory:");
  legacy.pragma("foreign_keys = ON");
  legacy.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE notify_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      digest INTEGER NOT NULL DEFAULT 1,
      last_digest_at INTEGER
    );
    INSERT INTO users (id, name) VALUES (1, 'owner');
    INSERT INTO notify_settings (user_id, digest, last_digest_at) VALUES (1, 0, 123);
  `);
  ensureFeatureTables(legacy);
  ensureFeatureTables(legacy);
  const row = legacy.prepare("SELECT * FROM notify_settings WHERE user_id = 1").get() as Record<string, unknown>;
  ok("legacy row keeps its digest settings", row.digest === 0 && row.last_digest_at === 123);
  ok("legacy row gets board = 0 (opt-in)", row.board === 0, String(row.board));
  ok("legacy row board_message_id / board_updated_at NULL", row.board_message_id === null && row.board_updated_at === null);
  legacy.close();
}

function testMissingNotifySettingsFailsLoudly(): void {
  const bare = new Database(":memory:");
  bare.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
  ok("missing notify_settings throws (wiring bug, not a no-op)", throws(() => ensureFeatureTables(bare), /notify_settings missing/));
  bare.close();
}

function count(fromWhere: string): number {
  return (db.prepare(`SELECT COUNT(*) c FROM ${fromWhere}`).get() as { c: number }).c;
}

function testChecks(): void {
  const CHECK = /CHECK constraint failed/i;
  const farm = (kind: string, minutes: number, div: number | null) => () =>
    db
      .prepare("INSERT INTO farm_user_speed (user_id, kind, key, minutes_per_run, div_per_run, updated_at) VALUES (1, ?, 'k', ?, ?, 1)")
      .run(kind, minutes, div);
  ok("farm kind outside boss|mechanic rejected", throws(farm("loot", 4, null), CHECK));
  ok("farm minutes_per_run = 0 rejected", throws(farm("mechanic", 0, null), CHECK));
  ok("farm negative div_per_run rejected", throws(farm("mechanic", 4, -1), CHECK));
  ok("farm div_per_run on a boss rejected", throws(farm("boss", 4, 2), CHECK));

  const mod = (value: number | null) => () =>
    db
      .prepare(
        "INSERT OR REPLACE INTO mod_value_cache (league, base_type, stat_id, min_roll, value_div, min_div, samples, total, search_url, checked_at) VALUES ('L', 'Ruby Ring', 'explicit.stat_1', 20, ?, NULL, 0, 0, NULL, 1)",
      )
      .run(value);
  ok("mod value_div = 0 rejected (NULL, never 0)", throws(mod(0), CHECK));
  ok("mod value_div NULL accepted", !throws(mod(null), /./));

  testSnipeOutcomeChecks(CHECK);
  testLeagueStartChecks(CHECK);
  ok("notify_settings board = 2 rejected", throws(() => db.prepare("INSERT INTO notify_settings (user_id, board) VALUES (1, 2)").run(), CHECK));
}

function testSnipeOutcomeChecks(CHECK: RegExp): void {
  db.prepare(
    `INSERT INTO snipe_outcomes (listing_id, league, profile, base_type, item_name, ask_div, value_div, margin_pct, samples, query_id, alerted_at)
     VALUES ('lst1', 'L', 'ring', 'Ruby Ring', 'Doom Loop', 2, 5, 60, 7, 'q1', 1000)`,
  ).run();
  const set = (column: "check_2h" | "check_24h", value: string) => () =>
    db.prepare(`UPDATE snipe_outcomes SET ${column} = ? WHERE listing_id = 'lst1'`).run(value);
  ok("check_2h 'sold' rejected (unobservable)", throws(set("check_2h", "sold"), CHECK));
  const upd = (column: string, value: unknown) => () => db.prepare(`UPDATE snipe_outcomes SET ${column} = ? WHERE listing_id = 'lst1'`).run(value);
  ok("check_2h_method outside fetch|search rejected", throws(upd("check_2h_method", "guess"), CHECK));
  ok("check_24h_method 'search' accepted", !throws(upd("check_24h_method", "search"), /./));
  ok("check_24h_ask_amount = 0 rejected (NULL, never 0)", throws(upd("check_24h_ask_amount", 0), CHECK));
  ok("attempts negative rejected", throws(upd("attempts", -1), CHECK));
  ok("attempts NULL rejected", throws(upd("attempts", null), /NOT NULL/i));
  const meta = (id: number, state: string) => () => db.prepare("INSERT OR REPLACE INTO snipe_outcome_meta (id, fetch_method) VALUES (?, ?)").run(id, state);
  ok("fetch method outside unverified|verified|broken rejected", throws(meta(1, "maybe"), CHECK));
  ok("fetch method meta is a single row", throws(meta(2, "verified"), CHECK));
  ok("fetch method 'broken' accepted", !throws(meta(1, "broken"), /./));
  ok("check_24h 'delisted' rejected", throws(set("check_24h", "delisted"), CHECK));
  for (const state of ["listed", "gone", "error"]) ok(`check_2h '${state}' accepted`, !throws(set("check_2h", state), /./));
}

function testLeagueStartChecks(CHECK: RegExp): void {
  const day = (d: number, mid: number, hours: number) => () =>
    db
      .prepare("INSERT OR REPLACE INTO cx_start_days (league, day, item, mid_div, volume_units, hours) VALUES ('L', ?, 'x', ?, 10, ?)")
      .run(d, mid, hours);
  ok("cx_start_days negative day rejected", throws(day(-1, 1, 3), CHECK));
  ok("cx_start_days mid_div = 0 rejected", throws(day(0, 0, 3), CHECK));
  ok("cx_start_days hours = 0 rejected", throws(day(0, 1, 0), CHECK));
  ok("cx_start_days valid row accepted", !throws(day(0, 0.5, 24), /./));
  ok(
    "cx_start_ingest negative markets rejected",
    throws(() => db.prepare("INSERT INTO cx_start_ingest (league, hour, markets) VALUES ('L', 3600, -1)").run(), CHECK),
  );
  ok(
    "cx_start_meta negative days_available rejected",
    throws(() => db.prepare("INSERT INTO cx_start_meta (league, start_hour, days_available) VALUES ('L', 3600, -1)").run(), CHECK),
  );
}

function testBoardColumns(): void {
  const cols = new Map(columns(db, "notify_settings").map((c) => [c.name, c]));
  ok("notify_settings.board NOT NULL DEFAULT 0", cols.get("board")?.notnull === 1 && cols.get("board")?.dflt_value === "0");
  ok("notify_settings.board_message_id added", cols.has("board_message_id"));
  ok("notify_settings.board_updated_at added", cols.has("board_updated_at"));
  db.prepare("INSERT OR REPLACE INTO notify_settings (user_id) VALUES (1)").run();
  const row = db.prepare("SELECT board, board_message_id, board_updated_at FROM notify_settings WHERE user_id = 1").get() as Record<string, unknown>;
  ok("new settings row: board off, no message yet", row.board === 0 && row.board_message_id === null && row.board_updated_at === null);
}

function testConfig(): void {
  ok("snipeOutcomes defaults", config.snipeOutcomes.enabled === true && config.snipeOutcomes.maxFetchesPerRun === 5 && config.snipeOutcomes.maxSearchesPerRun === 3);
  ok("leagueStart defaults", config.leagueStart.days === 14 && config.leagueStart.backfillEnabled === true);
  ok("discordBoard.intervalMin default 60", config.discordBoard.intervalMin === 60);
  ok("modPool.cacheHours default 24", config.modPool.cacheHours === 24);
  process.env.TEST_FEATURE_FLAG = "ture";
  ok("flag() throws on a typo instead of reading false", throws(() => flag("TEST_FEATURE_FLAG", true), /must be true or false/));
  process.env.TEST_FEATURE_FLAG = "FALSE";
  ok("flag() is case-insensitive", flag("TEST_FEATURE_FLAG", true) === false);
  delete process.env.TEST_FEATURE_FLAG;
  ok("flag() unset → fallback", flag("TEST_FEATURE_FLAG", true) === true);
}
