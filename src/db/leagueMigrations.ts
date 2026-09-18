import type Database from "better-sqlite3";
import { config } from "../config/env";

type Db = Database.Database;

/**
 * League-scoping migration for existing databases.
 *
 * Market history used to be global, so a league switch had to DELETE it — which emptied the app
 * and flipped the Coach to "sources unavailable". Scoping every market table by league means a
 * switch is now free: both leagues' rows coexist and reads filter. Nothing is ever purged.
 *
 * Idempotent: on a fresh database schema.sql already emits the league-scoped shape and every
 * step here short-circuits.
 */

/**
 * Mirrors core/leagueState's LEAGUE_SETTING_KEY, inlined rather than imported.
 *
 * db/ importing core/ is fine in general (queries.ts does it for getDefaultLeague). The specific
 * cycle that must not exist is database.ts → leagueMigrations → leagueState → database.ts:
 * leagueState's module body reaches for getDb(), and this migration runs from inside getDb().
 */
const LEAGUE_SETTING_KEY = "league";

/** Market tables that must not hold a single unscoped row once the migration has run. */
const SCOPED_TABLES = [
  "price_snapshots",
  "item_spark",
  "item_values",
  "price_book_obs",
  "craft_margin_reports",
  "craft_margin_history",
] as const;

/** Market tables whose league is a plain added column (no key change needed). */
const ADDED_COLUMN_TABLES = ["price_snapshots", "price_book_obs", "craft_margin_history"] as const;

/**
 * Per-user tables that only CARRY the league in this release. Nothing filters on it yet — that
 * lands with per-user leagues — but tagging rows now means the switch that introduces filtering
 * finds history it can attribute instead of a wall of NULLs.
 *
 * Rows created from here on get their league at INSERT time (see db/queries.ts). The backfill
 * below is therefore strictly one-shot: it runs only in the same boot that adds the column, and
 * stamps only the rows that predate it. Re-running it every boot would take rows created under
 * the previous league and re-label them with the current one — worse than leaving them NULL.
 */
export const TAGGED_TABLES = [
  "watchlist",
  "positions",
  "hunts",
  "alerts",
  "balance_snapshots",
  "flips",
  "trades",
] as const;

interface Rebuild {
  table: string;
  /** New table DDL, league-leading primary key. Must match schema.sql exactly. */
  ddl: string;
  /** Columns carried over verbatim from the legacy table (league is supplied separately). */
  columns: string;
}

/** Small tables keyed by a column that must become (league, <key>) — rename-copy-drop. */
const REBUILDS: readonly Rebuild[] = [
  {
    table: "item_spark",
    columns: "item_id, spark_7d, change_7d, updated_at",
    ddl: `CREATE TABLE item_spark (
      league TEXT NOT NULL DEFAULT '',
      item_id TEXT NOT NULL,
      spark_7d TEXT,
      change_7d REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (league, item_id)
    )`,
  },
  {
    table: "item_values",
    columns: "name_key, value_div, source, updated_at",
    ddl: `CREATE TABLE item_values (
      league TEXT NOT NULL DEFAULT '',
      name_key TEXT NOT NULL,
      value_div REAL NOT NULL,
      source TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (league, name_key)
    )`,
  },
  {
    table: "craft_margin_reports",
    columns: "recipe_key, report_json, ev_div, margin_pct, scanned_at",
    ddl: `CREATE TABLE craft_margin_reports (
      league TEXT NOT NULL DEFAULT '',
      recipe_key TEXT NOT NULL,
      report_json TEXT NOT NULL,
      ev_div REAL NOT NULL,
      margin_pct REAL NOT NULL,
      scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (league, recipe_key)
    )`,
  },
];

/**
 * Scope every market table by league, backfilling existing rows onto the league they were
 * actually collected for. Throws if any row is left unattributed — an unscoped row is invisible
 * to every league-filtered read, which would look exactly like the purge this release removes.
 */
export function migrateLeagueScope(db: Db): void {
  // Read the tracked league BEFORE any write: the raw setting, not the memoized getDefaultLeague,
  // whose cache may already hold a value from a different connection.
  const league = trackedLeague(db);

  db.transaction(() => {
    for (const table of ADDED_COLUMN_TABLES) addLeagueColumn(db, table, league);
    for (const spec of REBUILDS) rebuildWithLeaguePk(db, spec, league);
    for (const table of TAGGED_TABLES) addTaggedLeagueColumn(db, table, league);
    ensureSnapshotIndex(db);
    assertEveryRowScoped(db);
  })();
}

/** The league whose prices the existing rows belong to: stored setting, else env/config. */
function trackedLeague(db: Db): string {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(LEAGUE_SETTING_KEY) as
    | { value: string }
    | undefined;
  const stored = row?.value?.trim();
  return stored != null && stored !== "" ? stored : config.league;
}

function hasColumn(db: Db, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(
    (row) => row.name === column,
  );
}

/**
 * `league` as a plain NOT NULL column, backfilled EXACTLY ONCE — in the boot that adds it, when
 * every existing row is known to predate the column.
 *
 * A per-boot `WHERE league = ''` sweep would be the same bug the tagged tables had: it would
 * re-stamp any later league-less row with whatever league happens to be active at the next
 * restart, AND it would keep `assertEveryRowScoped` from ever firing, because the sweep always
 * cleans up just before the check looks. One-shot makes that assertion a live tripwire.
 */
function addLeagueColumn(db: Db, table: string, league: string): void {
  if (hasColumn(db, table, "league")) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN league TEXT NOT NULL DEFAULT ''`);
  db.prepare(`UPDATE ${table} SET league = ?`).run(league);
}

/** Rename-copy-drop: SQLite cannot widen a primary key in place. */
function rebuildWithLeaguePk(db: Db, spec: Rebuild, league: string): void {
  if (hasColumn(db, spec.table, "league")) return;
  db.exec(`ALTER TABLE ${spec.table} RENAME TO ${spec.table}_old; ${spec.ddl};`);
  db.prepare(
    `INSERT INTO ${spec.table} (league, ${spec.columns}) SELECT ?, ${spec.columns} FROM ${spec.table}_old`,
  ).run(league);
  db.exec(`DROP TABLE ${spec.table}_old`);
}

/**
 * Nullable tag column on a per-user table, backfilled EXACTLY ONCE.
 *
 * The add and the backfill are deliberately one step: only the boot that introduces the column
 * can know that every existing row predates it. A standalone `WHERE league IS NULL` sweep would
 * re-run on every boot and re-stamp rows written under a since-retired league.
 */
function addTaggedLeagueColumn(db: Db, table: string, league: string): void {
  if (hasColumn(db, table, "league")) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN league TEXT`);
  db.prepare(`UPDATE ${table} SET league = ?`).run(league);
}

/**
 * Create or redefine the snapshot index. This is its ONLY definition: schema.sql cannot own it,
 * because that file is exec'd before `league` exists on a legacy database.
 *
 * The index NAME is pinned by services/coach/src/tools/market.py (`INDEXED BY`), so it is
 * redefined in place rather than replaced by a differently named one.
 */
function ensureSnapshotIndex(db: Db): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_snapshots_item_time'")
    .get() as { sql: string | null } | undefined;
  if (row?.sql != null && /\(\s*league\s*,/i.test(row.sql)) return;
  db.exec(`
    DROP INDEX IF EXISTS idx_snapshots_item_time;
    CREATE INDEX idx_snapshots_item_time ON price_snapshots(league, item_id, fetched_at DESC);
  `);
}

function assertEveryRowScoped(db: Db): void {
  for (const table of SCOPED_TABLES) {
    const { unscoped } = db.prepare(`SELECT COUNT(*) AS unscoped FROM ${table} WHERE league = ''`).get() as {
      unscoped: number;
    };
    if (unscoped > 0) {
      throw new Error(
        `league migration left ${unscoped} unscoped row(s) in ${table} — they would be invisible to every league-filtered read`,
      );
    }
  }
}

/**
 * Seed the league chronology with known PoE2 history. Only relative ORDER matters (the UI
 * sorts newest-first); dates approximate each launch. New leagues never touch this list —
 * registerLeagues (leagueQueries) records them the moment any source first mentions them.
 * INSERT OR IGNORE keeps every boot idempotent and never overwrites a live first-seen stamp.
 */
export function seedLeagueRegistry(conn: Database.Database): void {
  const insert = conn.prepare(
    "INSERT OR IGNORE INTO league_registry (league, first_seen_at) VALUES (?, ?)",
  );
  const seed: ReadonlyArray<readonly [string, string]> = [
    ["Dawn of the Hunt", "2025-04-04T00:00:00Z"],
    ["Rise of the Abyssal", "2025-08-29T00:00:00Z"],
    ["Fate of the Vaal", "2025-12-12T00:00:00Z"],
    ["Runes of Aldur", "2026-05-28T00:00:00Z"],
    ["Forbidden Rites", "2026-09-05T00:00:00Z"],
  ];
  for (const [league, seenAt] of seed) insert.run(league, seenAt);
}
