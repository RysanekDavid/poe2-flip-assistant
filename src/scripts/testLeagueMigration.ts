import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { config } from "../config/env";
import { migrateLeagueScope } from "../db/leagueMigrations";

/**
 * The league-scope migration, exercised against LEGACY-shaped in-memory databases — the upgrade
 * path that actually ships. Split out of testLeague.ts, which covers detection and switching and
 * was past the file-size cap.
 */

function main(): void {
  testLegacyDatabaseMigratesOntoTheTrackedLeague();
  testTaggedBackfillIsOneShot();
  testMigrationRefusesUnattributableRows();
  console.log("ALL PASS — legacy league-scope migration, one-shot tagging and the unscoped-row guard");
}

/** The pre-league table shapes, verbatim, so the migration runs against the real legacy thing. */
const LEGACY_SCHEMA = `
  CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
  CREATE TABLE price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL, item_name TEXT NOT NULL,
    category TEXT NOT NULL, chaos_equiv REAL NOT NULL, volume REAL, icon TEXT,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_snapshots_item_time ON price_snapshots(item_id, fetched_at DESC);
  CREATE TABLE item_spark (
    item_id TEXT PRIMARY KEY, spark_7d TEXT, change_7d REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE item_values (
    name_key TEXT PRIMARY KEY, value_div REAL NOT NULL, source TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE price_book_obs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sig TEXT NOT NULL, base_type TEXT NOT NULL,
    price_div REAL NOT NULL, listing_id TEXT, seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE craft_margin_reports (
    recipe_key TEXT PRIMARY KEY, report_json TEXT NOT NULL, ev_div REAL NOT NULL,
    margin_pct REAL NOT NULL, scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE craft_margin_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, recipe_key TEXT NOT NULL, ev_div REAL NOT NULL,
    margin_pct REAL NOT NULL, scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  -- Per-user tables, pre-league shape. schema.sql always creates these before the migration
  -- runs, so the fixture does too — the migration is entitled to assume they exist.
  CREATE TABLE watchlist (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, item_id TEXT);
  CREATE TABLE positions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, item_id TEXT);
  CREATE TABLE hunts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, label TEXT);
  CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT);
  CREATE TABLE balance_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER);
  CREATE TABLE flips (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, item_id TEXT);
  CREATE TABLE trades (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, item_id TEXT);
`;

const SCOPED_TABLES = [
  "price_snapshots",
  "item_spark",
  "item_values",
  "price_book_obs",
  "craft_margin_reports",
  "craft_margin_history",
] as const;

/** One legacy-shaped database with exactly one row in every market table. */
function legacyDatabase(storedLeague: string | null): Database.Database {
  const legacy = new Database(":memory:");
  legacy.exec(LEGACY_SCHEMA);
  if (storedLeague != null) {
    legacy.prepare("INSERT INTO app_settings (key, value) VALUES ('league', ?)").run(storedLeague);
  }
  legacy
    .prepare(
      `INSERT INTO price_snapshots (item_id, item_name, category, chaos_equiv, volume)
       VALUES ('divine', 'Divine Orb', 'Currency', 1, 10)`,
    )
    .run();
  legacy.prepare("INSERT INTO item_spark (item_id, spark_7d, change_7d) VALUES ('divine', '[1,2]', 5)").run();
  legacy.prepare("INSERT INTO item_values (name_key, value_div, source) VALUES ('igniferis', 2.5, 'scout')").run();
  legacy.prepare("INSERT INTO price_book_obs (sig, base_type, price_div) VALUES ('sig', 'Sapphire Ring', 3)").run();
  legacy
    .prepare("INSERT INTO craft_margin_reports (recipe_key, report_json, ev_div, margin_pct) VALUES ('r', '{}', 1, 2)")
    .run();
  legacy.prepare("INSERT INTO craft_margin_history (recipe_key, ev_div, margin_pct) VALUES ('r', 1, 2)").run();
  return legacy;
}

/**
 * The upgrade path that actually ships: a database whose market rows predate the league column.
 * Every row must land on the league the app was tracking — a row left at '' is invisible to
 * every league-filtered read, which looks exactly like the purge this release removes.
 */
function testLegacyDatabaseMigratesOntoTheTrackedLeague(): void {
  const legacy = legacyDatabase("Legacy League");
  migrateLeagueScope(legacy);

  for (const table of SCOPED_TABLES) {
    const row = legacy
      .prepare(`SELECT COUNT(*) AS total, SUM(league = 'Legacy League') AS scoped FROM ${table}`)
      .get() as { total: number; scoped: number };
    assert.equal(row.total, 1, `${table} lost rows during migration`);
    assert.equal(row.scoped, 1, `${table} row was not attributed to the tracked league`);
  }

  // The rebuilt key really is composite now.
  legacy.prepare("INSERT INTO item_spark (league, item_id) VALUES ('Other', 'divine')").run();
  assert.throws(
    () => legacy.prepare("INSERT INTO item_spark (league, item_id) VALUES ('Other', 'divine')").run(),
    /UNIQUE|PRIMARY KEY/i,
  );

  // The index keeps its NAME (services/coach pins it with INDEXED BY) and gains league.
  const index = legacy
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_snapshots_item_time'")
    .get() as { sql: string };
  assert.match(index.sql, /\(\s*league\s*,\s*item_id\s*,\s*fetched_at DESC\s*\)/i);

  // Idempotent: a second run is a no-op, not a second rebuild.
  migrateLeagueScope(legacy);
  const after = legacy.prepare("SELECT COUNT(*) AS count FROM price_snapshots").get() as { count: number };
  assert.equal(after.count, 1);
  legacy.close();

  // With nothing stored, the env/config league is the honest attribution.
  const noSetting = legacyDatabase(null);
  migrateLeagueScope(noSetting);
  const fallback = noSetting.prepare("SELECT league FROM price_snapshots").get() as { league: string };
  assert.equal(fallback.league, config.league);
  noSetting.close();
}

/**
 * The per-user tables' league tag is backfilled EXACTLY ONCE, in the boot that adds the column.
 *
 * A per-boot `WHERE league IS NULL` sweep looks harmless and is not: a row written under the
 * league tracked yesterday would be stamped with today's on the next restart, which is worse
 * than leaving it unattributed because it reads as fact.
 */
function testTaggedBackfillIsOneShot(): void {
  const legacy = legacyDatabase("Legacy League");
  legacy.prepare("INSERT INTO positions (user_id, item_id) VALUES (1, 'old-position')").run();

  migrateLeagueScope(legacy);
  const first = legacy.prepare("SELECT league FROM positions WHERE item_id = 'old-position'").get() as {
    league: string | null;
  };
  assert.equal(first.league, "Legacy League", "pre-existing rows are attributed once");

  // A row created AFTER the switch, as the app now writes it: league set at insert time.
  legacy.prepare("INSERT INTO app_settings (key, value) VALUES ('league', 'New League') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  legacy.prepare("INSERT INTO positions (user_id, item_id, league) VALUES (1, 'new-position', 'New League')").run();
  // …and one the app could not attribute at all.
  legacy.prepare("INSERT INTO positions (user_id, item_id) VALUES (1, 'untagged')").run();

  migrateLeagueScope(legacy);

  const rows = legacy.prepare("SELECT item_id, league FROM positions ORDER BY id").all() as Array<{
    item_id: string;
    league: string | null;
  }>;
  assert.deepEqual(rows, [
    { item_id: "old-position", league: "Legacy League" }, // NOT re-stamped as "New League"
    { item_id: "new-position", league: "New League" },
    { item_id: "untagged", league: null }, // honest unknown beats a confident wrong answer
  ]);
  legacy.close();
}

/**
 * The post-migration assertion is a live tripwire, not decoration.
 *
 * Every backfill is one-shot, so an unattributed row planted after the migration has nothing
 * left to clean it up — it must fail the NEXT boot loudly instead of being silently re-stamped
 * with whatever league is active by then. Both table shapes are covered: a rebuilt one
 * (item_spark) and an ALTERed one (price_snapshots), because only the latter used to have a
 * per-boot sweep that would have quietly swallowed this.
 */
function testMigrationRefusesUnattributableRows(): void {
  const rebuilt = legacyDatabase("Legacy League");
  migrateLeagueScope(rebuilt);
  rebuilt.prepare("INSERT INTO item_spark (league, item_id) VALUES ('', 'orphan')").run();
  assert.throws(() => migrateLeagueScope(rebuilt), /unscoped row\(s\) in item_spark/);
  rebuilt.close();

  const altered = legacyDatabase("Legacy League");
  migrateLeagueScope(altered);
  altered
    .prepare(
      `INSERT INTO price_snapshots (league, item_id, item_name, category, chaos_equiv, volume)
       VALUES ('', 'orphan', 'Orphan Orb', 'Currency', 1, 1)`,
    )
    .run();
  assert.throws(() => migrateLeagueScope(altered), /unscoped row\(s\) in price_snapshots/);
  // …and it was NOT quietly relabelled on the way to throwing.
  const row = altered.prepare("SELECT league FROM price_snapshots WHERE item_id = 'orphan'").get() as {
    league: string;
  };
  assert.equal(row.league, "");
  altered.close();
}

// Runs last: the fixtures above are `const`, so calling main() earlier hits the TDZ.
main();
