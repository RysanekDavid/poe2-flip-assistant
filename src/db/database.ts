import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config/env";
import { hashPassword, genApiKey } from "../auth/auth";
import { migratePatchProvenance } from "./sourceMigrations";
import { migrateLeagueScope, seedLeagueRegistry } from "./leagueMigrations";
import { applicationSchemaSql } from "./schemaFiles";

let db: Database.Database | null = null;

/** Lazy singleton. Creates the data dir, opens the DB, applies schema (idempotent). */
export function getDb(): Database.Database {
  if (db) return db;

  const path = config.dbPath;
  mkdirSync(dirname(path), { recursive: true });

  const conn = new Database(path);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");

  conn.exec(applicationSchemaSql());
  migratePatchProvenance(conn);

  // Additive migrations — CREATE TABLE IF NOT EXISTS won't add columns to an existing DB,
  // so backfill any columns added after a table first shipped.
  ensureColumns(conn, "alerts", [
    ["item_name", "TEXT"],
    ["whisper", "TEXT"], // in-game whisper to copy (snipe alerts)
    ["link", "TEXT"], // trade-site deep link
  ]);
  ensureColumns(conn, "price_snapshots", [
    ["change_7d", "REAL"],
    ["spark_7d", "TEXT"],
    ["icon", "TEXT"],
  ]);
  ensureColumns(conn, "watchlist", [
    ["manual_buy_exalt", "REAL"],
    ["manual_sell_chaos", "REAL"],
    ["manual_buy_ccy", "TEXT"],
    ["manual_sell_ccy", "TEXT"],
    ["manual_set_at", "DATETIME"],
  ]);
  ensureColumns(conn, "hunt_hits", [
    ["listing_id", "TEXT"],
    ["seller_online", "INTEGER"],
    ["listed_at", "TEXT"],
  ]);
  // Craft-base hunts filter by trade2 category + item level when no single base type applies.
  ensureColumns(conn, "hunts", [
    ["category", "TEXT"],
    ["ilvl_min", "INTEGER"],
  ]);
  ensureColumns(conn, "balance_snapshots", [["other_div", "REAL NOT NULL DEFAULT 0"]]);
  ensureColumns(conn, "balance_tabs", [["unpriced", "INTEGER NOT NULL DEFAULT 0"]]);
  // Per-user trade2 credentials: encrypted POESESSID + identifying contact + account name.
  ensureColumns(conn, "users", [
    ["poesessid_enc", "TEXT"], // AES-GCM token from secretbox; never stored plaintext
    ["poe_contact", "TEXT"], // identifying email for the trade2 User-Agent
    ["poe_account", "TEXT"], // account name for own-stash / own-listing reads
    // Per-user league view (core/leagueUsers). NULL = follow the app default, which is what every
    // pre-existing row means: nobody had ever chosen a league of their own.
    ["league", "TEXT"],
    ["league_set_at", "TEXT"], // ISO stamp of the last switch — the poller's dwell debounce reads it
  ]);

  // Multi-tenancy: every private table gains user_id (existing rows backfill to owner id=1).
  // Shared market data (price_snapshots) stays global. balance_tabs inherits via its snapshot.
  for (const t of ["alerts", "trades", "flips", "hunts", "hunt_hits", "balance_snapshots", "positions"]) {
    ensureColumns(conn, t, [["user_id", "INTEGER NOT NULL DEFAULT 1"]]);
  }
  rebuildWatchlistMultiTenant(conn);
  rebuildHoldingsMultiTenant(conn);

  // League scoping: market data is per-league so a switch retains both markets instead of
  // purging. Runs AFTER the multi-tenant rebuilds, which recreate `watchlist` from scratch and
  // would drop a league column added before them. The per-user tables' league column is added
  // inside the migration rather than via ensureColumns: its backfill must happen in the same
  // step, exactly once (see TAGGED_TABLES).
  migrateLeagueScope(conn);
  seedLeagueRegistry(conn);

  // user_id-dependent indexes — created here, post-migration, so the column always exists.
  conn.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_user_item ON watchlist(user_id, item_id);
    CREATE INDEX IF NOT EXISTS idx_hunts_user ON hunts(user_id);
    CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id, opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_balance_user_time ON balance_snapshots(user_id, fetched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hunt_hits_user_time ON hunt_hits(user_id, found_at DESC);
    CREATE INDEX IF NOT EXISTS idx_flips_user_time ON flips(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, seen, created_at DESC);
  `);

  db = conn;
  seedOwner(conn);
  return db;
}

/** Seed the owner (id=1) on first run so pre-multitenant data has an account to belong to. */
function seedOwner(conn: Database.Database): void {
  const has = (conn.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;
  if (has > 0) return;
  const pw = process.env.OWNER_PASSWORD;
  if (!pw) {
    throw new Error("OWNER_PASSWORD is required to initialize an empty database");
  }
  conn
    .prepare("INSERT INTO users (id, name, password_hash, api_key, role) VALUES (1, ?, ?, ?, 'owner')")
    .run(config.ownerName, hashPassword(pw), genApiKey());
}

/** watchlist shipped with an inline `item_id UNIQUE` (global) — rebuild to per-user uniqueness. */
function rebuildWatchlistMultiTenant(conn: Database.Database): void {
  const row = conn.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='watchlist'").get() as
    | { sql: string }
    | undefined;
  if (!row || !/item_id\s+TEXT\s+UNIQUE/i.test(row.sql)) return; // already migrated or fresh
  conn.exec(`
    ALTER TABLE watchlist RENAME TO watchlist_old;
    CREATE TABLE watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      category TEXT NOT NULL,
      buy_threshold_pct REAL DEFAULT 15,
      sell_threshold_pct REAL DEFAULT 10,
      manual_buy_exalt REAL,
      manual_sell_chaos REAL,
      manual_buy_ccy TEXT,
      manual_sell_ccy TEXT,
      manual_set_at DATETIME,
      active INTEGER DEFAULT 1,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO watchlist (id, user_id, item_id, item_name, category, buy_threshold_pct, sell_threshold_pct,
      manual_buy_exalt, manual_sell_chaos, manual_buy_ccy, manual_sell_ccy, manual_set_at, active, added_at)
      SELECT id, 1, item_id, item_name, category, buy_threshold_pct, sell_threshold_pct,
        manual_buy_exalt, manual_sell_chaos, manual_buy_ccy, manual_sell_ccy, manual_set_at, active, added_at
      FROM watchlist_old;
    DROP TABLE watchlist_old;
  `);
}

/** holdings shipped with PK = currency (global) — rebuild to PK (user_id, currency). */
function rebuildHoldingsMultiTenant(conn: Database.Database): void {
  const cols = new Set(
    (conn.prepare("PRAGMA table_info(holdings)").all() as Array<{ name: string }>).map((r) => r.name),
  );
  if (cols.has("user_id")) return; // already migrated or fresh
  conn.exec(`
    ALTER TABLE holdings RENAME TO holdings_old;
    CREATE TABLE holdings (
      user_id INTEGER NOT NULL DEFAULT 1,
      currency TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, currency)
    );
    INSERT INTO holdings (user_id, currency, amount, updated_at)
      SELECT 1, currency, amount, updated_at FROM holdings_old;
    DROP TABLE holdings_old;
  `);
}

/** Add any missing columns to a table (idempotent). */
function ensureColumns(conn: Database.Database, table: string, cols: Array<[string, string]>): void {
  const existing = new Set(
    (conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((r) => r.name),
  );
  for (const [name, def] of cols) {
    if (!existing.has(name)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}
