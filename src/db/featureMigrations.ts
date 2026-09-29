import type Database from "better-sqlite3";

/**
 * Storage for the seven-features plan (farm speed, mod-pool cache, snipe outcomes, league-start
 * curves, Discord live board). Kept out of schema.sql (past the file-size cap) like cxMigrations;
 * every statement is IF NOT EXISTS and the column adds check PRAGMA first, so this is idempotent
 * and safe for the web and poller processes to run on every boot.
 *
 * Time columns are epoch MILLISECONDS written from the caller's clock (injectable in tests), the
 * same convention as notify_settings.last_digest_at — except cx_* hours, which are GGG digest ids
 * (unix SECONDS on the hour boundary), the unit cx_ingest.hour already uses.
 *
 * WITHOUT ROWID wherever rows are only ever addressed by their composite key.
 */
export function ensureFeatureTables(conn: Database.Database): void {
  conn.exec(USER_TABLES_SQL);
  conn.exec(MARKET_TABLES_SQL);
  // a DB whose snipe_outcomes predates the checker gets the checker's columns added in place
  addMissingColumns(conn, "snipe_outcomes", SNIPE_OUTCOME_CHECK_COLUMNS);
  conn.exec(LEAGUE_START_SQL);
  ensureBoardColumns(conn);
}

/**
 * snipe_outcomes columns the outcome checker (core/snipeOutcomes) writes beyond Wave 0's table:
 * the raw ask each check saw (formatted from the listing's own currency, not a later rate), which
 * method observed it, the stored re-search query and the retry counter. One list feeds both the
 * CREATE TABLE and the in-place upgrade, so the two paths cannot drift.
 */
export const SNIPE_OUTCOME_CHECK_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["check_2h_ask_amount", "REAL CHECK (check_2h_ask_amount IS NULL OR check_2h_ask_amount > 0)"],
  ["check_2h_ask_currency", "TEXT"],
  ["check_2h_method", "TEXT CHECK (check_2h_method IS NULL OR check_2h_method IN ('fetch', 'search'))"],
  ["check_24h_ask_amount", "REAL CHECK (check_24h_ask_amount IS NULL OR check_24h_ask_amount > 0)"],
  ["check_24h_ask_currency", "TEXT"],
  ["check_24h_method", "TEXT CHECK (check_24h_method IS NULL OR check_24h_method IN ('fetch', 'search'))"],
  // JSON TradeQuery (seller account + base) for the re-search fallback; NULL = seller unknown
  ["recheck_query", "TEXT"],
  // failed attempts at the pending checkpoint; the second failure settles it as 'error'
  ["attempts", "INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)"],
];

const checkColumnsSql = SNIPE_OUTCOME_CHECK_COLUMNS.map(([name, def]) => `${name} ${def},`).join("\n    ");

const USER_TABLES_SQL = `
  -- The player's own clear speed per boss / mechanic, so the farm board can show Div per hour.
  -- div_per_run is only meaningful for mechanics (a boss's per-kill EV comes from the market);
  -- NULL means "not entered", never zero.
  CREATE TABLE IF NOT EXISTS farm_user_speed (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('boss', 'mechanic')),
    key TEXT NOT NULL,
    minutes_per_run REAL NOT NULL CHECK (minutes_per_run > 0),
    div_per_run REAL CHECK (div_per_run IS NULL OR (div_per_run >= 0 AND kind = 'mechanic')),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, kind, key)
  ) WITHOUT ROWID;
`;

const MARKET_TABLES_SQL = `
  -- Live "items carrying this mod" valuations, shared by every user (market data, not private).
  -- value_div / min_div are NULL when the search found nothing priceable — a stored 0 would read
  -- as "the mod is worthless", which the search never showed.
  CREATE TABLE IF NOT EXISTS mod_value_cache (
    league TEXT NOT NULL,
    base_type TEXT NOT NULL,
    stat_id TEXT NOT NULL,
    min_roll REAL NOT NULL,
    value_div REAL CHECK (value_div IS NULL OR value_div > 0),
    min_div REAL CHECK (min_div IS NULL OR min_div > 0),
    samples INTEGER NOT NULL CHECK (samples >= 0),
    total INTEGER NOT NULL CHECK (total >= 0),
    search_url TEXT,
    checked_at INTEGER NOT NULL,
    PRIMARY KEY (league, base_type, stat_id, min_roll)
  ) WITHOUT ROWID;

  -- What happened to each alerted snipe listing 2 h and 24 h later. trade2 cannot tell sold from
  -- delisted from repriced-away, so the vocabulary is only what a fetch can observe.
  CREATE TABLE IF NOT EXISTS snipe_outcomes (
    listing_id TEXT PRIMARY KEY,
    league TEXT NOT NULL,
    profile TEXT NOT NULL,
    base_type TEXT NOT NULL,
    item_name TEXT NOT NULL,
    ask_div REAL NOT NULL,
    value_div REAL NOT NULL,
    margin_pct REAL NOT NULL,
    samples INTEGER NOT NULL,
    query_id TEXT,
    alerted_at INTEGER NOT NULL,
    check_2h TEXT CHECK (check_2h IS NULL OR check_2h IN ('listed', 'gone', 'error')),
    check_2h_at INTEGER,
    check_2h_ask_div REAL,
    check_24h TEXT CHECK (check_24h IS NULL OR check_24h IN ('listed', 'gone', 'error')),
    check_24h_at INTEGER,
    check_24h_ask_div REAL,
    ${checkColumnsSql}
    last_error TEXT
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS idx_snipe_outcomes_alerted ON snipe_outcomes(alerted_at);

  -- Whether plan A (re-fetch against the search id that found a listing) has been shown to tell
  -- gone from listed. A cross-check re-search moves it: verified when it agrees with the fetch,
  -- broken when it finds a listing the fetch called gone (then every check re-searches). One row.
  CREATE TABLE IF NOT EXISTS snipe_outcome_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    fetch_method TEXT NOT NULL DEFAULT 'unverified' CHECK (fetch_method IN ('unverified', 'verified', 'broken')),
    changed_at INTEGER,
    evidence TEXT
  ) WITHOUT ROWID;
`;

const LEAGUE_START_SQL = `
  -- Daily price curve of each exchange item over a league's first weeks. day 0 = the league's
  -- first digest day. Never pruned: past league starts are the whole point.
  CREATE TABLE IF NOT EXISTS cx_start_days (
    league TEXT NOT NULL,
    day INTEGER NOT NULL CHECK (day >= 0),
    item TEXT NOT NULL,
    mid_div REAL NOT NULL CHECK (mid_div > 0),
    volume_units REAL NOT NULL CHECK (volume_units >= 0),
    hours INTEGER NOT NULL CHECK (hours > 0),
    PRIMARY KEY (league, day, item)
  ) WITHOUT ROWID;

  -- Digest hours already folded into cx_start_days, including hours where the league had no
  -- markets, so the backfill never downloads the same hour twice.
  CREATE TABLE IF NOT EXISTS cx_start_ingest (
    league TEXT NOT NULL,
    hour INTEGER NOT NULL,
    markets INTEGER NOT NULL CHECK (markets >= 0),
    PRIMARY KEY (league, hour)
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS cx_start_meta (
    league TEXT PRIMARY KEY,
    start_hour INTEGER NOT NULL,
    days_available INTEGER NOT NULL DEFAULT 0 CHECK (days_available >= 0),
    backfilled_at INTEGER
  ) WITHOUT ROWID;
`;

/**
 * Discord live board: one message per user, edited in place. notify_settings is created by
 * ensureNotifySchema, so this must run after it; a missing table is a wiring bug, not a no-op.
 */
export const NOTIFY_BOARD_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["board", "INTEGER NOT NULL DEFAULT 0 CHECK (board IN (0, 1))"], // opt-in: off for every existing user
  ["board_message_id", "TEXT"], // Discord message id from POST ?wait=true; NULL = post a new one
  ["board_updated_at", "INTEGER"], // epoch ms of the last successful post/edit
];

function ensureBoardColumns(conn: Database.Database): void {
  addMissingColumns(conn, "notify_settings", NOTIFY_BOARD_COLUMNS);
}

/** Add the columns a table lacks. A missing table is a wiring bug (wrong migration order): throw. */
function addMissingColumns(conn: Database.Database, table: string, cols: ReadonlyArray<readonly [string, string]>): void {
  const existing = new Set((conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((r) => r.name));
  if (existing.size === 0) {
    throw new Error(
      table === "notify_settings"
        ? "ensureFeatureTables: notify_settings missing — ensureNotifySchema must run first"
        : `ensureFeatureTables: ${table} missing`,
    );
  }
  for (const [name, def] of cols) {
    if (!existing.has(name)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}
