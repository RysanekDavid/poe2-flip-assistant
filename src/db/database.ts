import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config/env";
import { hashPasswordSync, genApiKey } from "../auth/credentials";
import { migratePatchProvenance } from "./sourceMigrations";
import { migrateLeagueScope, seedLeagueRegistry } from "./leagueMigrations";
import { ensureCxTables } from "./cxMigrations";
import { CX_EDGE_DETAIL_COLUMNS } from "./cxEdgeDetail";
import { applicationSchemaSql } from "./schemaFiles";
import { ensureNotifySchema } from "./notifyMigrations";
import { dropRetiredHunts } from "./retiredMigrations";
import { ensureCredColumns } from "./credMigrations";
import { ensureWealthColumns } from "./wealthMigrations";

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
  ensureCxTables(conn);
  ensureColumns(conn, "cx_edge_outcomes", CX_EDGE_DETAIL_COLUMNS);
  migratePatchProvenance(conn);

  // Additive migrations — CREATE TABLE IF NOT EXISTS won't add columns to an existing DB,
  // so backfill any columns added after a table first shipped.
  ensureColumns(conn, "alerts", [
    ["item_name", "TEXT"],
    ["whisper", "TEXT"], // in-game whisper to copy (snipe alerts)
    ["link", "TEXT"], // trade-site deep link
    // Structured card (zod-validated SnipeCard JSON) so a SNIPE still renders after the scan
    // report that found it has rotated away. NULL for other types and pre-card rows.
    ["details", "TEXT"],
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
  // A transient trade2 failure is recorded beside the last good craft report instead of replacing it.
  ensureColumns(conn, "craft_margin_reports", [
    ["last_error", "TEXT"],
    ["last_error_at", "DATETIME"],
  ]);
  ensureColumns(conn, "balance_snapshots", [
    ["other_div", "REAL NOT NULL DEFAULT 0"],
    // What a trade read actually saw — NULL for manual entries and pre-annotation rows.
    ["listed_seen", "INTEGER"],
    ["listed_total", "INTEGER"],
    ["gear_at_ask_div", "REAL"],
  ]);
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
    // Signed into every session token; bumping it revokes them. Default 0 matches tokens that
    // predate the column, so existing logins survive the deploy.
    ["session_version", "INTEGER NOT NULL DEFAULT 0"],
    ["discord_webhook_enc", "TEXT"], // AES-GCM token from secretbox (the webhook URL embeds a secret)
  ]);
  ensureCredColumns(conn); // POESESSID health (auth/credStatus)
  ensureWealthColumns(conn); // balance_items listing identity (sold-since, reprice)

  // Multi-tenancy: every private table gains user_id (existing rows backfill to owner id=1).
  // Shared market data (price_snapshots) stays global. balance_tabs inherits via its snapshot.
  for (const t of ["alerts", "trades", "flips", "balance_snapshots", "positions"]) {
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
  purgeLegacyPriceBook(conn);
  ensureNotifySchema(conn); // after users.discord_webhook_enc exists — its trigger reads the column
  // Browser chime + desktop popup per type; NULL (rows from before) means "use the type's default".
  ensureColumns(conn, "notify_prefs", [
    ["sound", "INTEGER"],
    ["popup", "INTEGER"],
  ]);
  dropRetiredHunts(conn); // after ensureNotifySchema: it also clears the retired types' notify_prefs

  // user_id-dependent indexes — created here, post-migration, so the column always exists.
  conn.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_user_item ON watchlist(user_id, item_id);
    CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id, opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_balance_user_time ON balance_snapshots(user_id, fetched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_flips_user_time ON flips(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, seen, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_user_item ON alerts(user_id, item_id, type);
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
    .run(config.ownerName, hashPasswordSync(pw), genApiKey());
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

const PRICE_BOOK_CUTOVER_KEY = "price_book_cutover_rollsig_v1";

/**
 * One-time wipe of the price book at the signature cutover. Rows written before it are in the two
 * retired key spaces (text-based modSignature from hunts, and zero-mod "<base>|" rows from the
 * broken mod capture) — never read again, and a bare "<base>|" key is exactly the pooled bucket
 * behind the "1111 samples" bait alerts. Guarded by an app_settings marker so it runs once.
 */
export function purgeLegacyPriceBook(conn: Database.Database): number {
  return conn.transaction(() => {
    const done = conn.prepare("SELECT 1 FROM app_settings WHERE key = ?").get(PRICE_BOOK_CUTOVER_KEY);
    if (done) return 0;
    const removed = conn.prepare("DELETE FROM price_book_obs").run().changes;
    conn.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").run(PRICE_BOOK_CUTOVER_KEY, new Date().toISOString());
    if (removed > 0) console.warn(`[db] price-book cutover: removed ${removed} legacy observation(s)`);
    return removed;
  }).immediate();
}

/** Add any missing columns to a table (idempotent). */
export function ensureColumns(conn: Database.Database, table: string, cols: Array<[string, string]>): void {
  const existing = new Set(
    (conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((r) => r.name),
  );
  for (const [name, def] of cols) {
    if (!existing.has(name)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}
