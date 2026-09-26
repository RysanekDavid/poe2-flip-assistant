import type Database from "better-sqlite3";
import { ensureCxEdgeDetailColumns } from "./cxEdgeDetail";

/**
 * Tables for GGG's currency-exchange market history and the trend-alert state machine.
 *
 * Kept out of schema.sql (already past the file-size cap) and created here instead; every
 * statement is IF NOT EXISTS so this is idempotent on every boot.
 *
 * WITHOUT ROWID on the history: rows are only ever addressed by their composite key, and the
 * table is the largest thing we store per hour, so the implicit rowid B-tree would double it.
 */
export function ensureCxTables(conn: Database.Database): void {
  conn.exec(MARKET_HISTORY_SQL);
  conn.exec(DERIVED_STATE_SQL);
  ensureCxEdgeDetailColumns(conn);
}

const MARKET_HISTORY_SQL = `
    -- One row per exchange market per digest hour, for POLLED leagues only (never private ones).
    -- hour = the digest's next_change_id, i.e. the END boundary of the covered hour — the same
    -- value currency_rates.hour holds. item_a < item_b (GGG base item ids, compared exactly), so
    -- one market always lands on one key whatever order GGG listed the pair in.
    CREATE TABLE IF NOT EXISTS cx_markets (
      league TEXT NOT NULL,
      hour INTEGER NOT NULL,
      item_a TEXT NOT NULL,
      item_b TEXT NOT NULL,
      volume_a INTEGER NOT NULL,
      volume_b INTEGER NOT NULL,
      low_ratio_a INTEGER,
      low_ratio_b INTEGER,
      high_ratio_a INTEGER,
      high_ratio_b INTEGER,
      low_stock_a INTEGER,
      low_stock_b INTEGER,
      high_stock_a INTEGER,
      high_stock_b INTEGER,
      PRIMARY KEY (league, hour, item_a, item_b)
    ) WITHOUT ROWID;

    -- Which (league, hour) digests have been stored — including hours where the league had no
    -- markets at all, so the backfill does not re-download them forever.
    CREATE TABLE IF NOT EXISTS cx_ingest (
      league TEXT NOT NULL,
      hour INTEGER NOT NULL,
      markets INTEGER NOT NULL,
      ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (league, hour)
    ) WITHOUT ROWID;

    -- GGG base item id → in-game name, resolved from the committed RePoE catalog. The web process
    -- joins names from here instead of loading the 60 MB catalog itself.
    CREATE TABLE IF NOT EXISTS cx_items (
      base_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      resolved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) WITHOUT ROWID;

`;

const DERIVED_STATE_SQL = `
    -- Outcome loop: every edge the model PUBLISHED (ranked) for a league at a digest hour, and
    -- whether the same direction still cleared the threshold in the next hour's digest. The
    -- only ground truth the thresholds can be calibrated against. item = GGG base id.
    CREATE TABLE IF NOT EXISTS cx_edge_outcomes (
      league TEXT NOT NULL,
      item TEXT NOT NULL,
      hour INTEGER NOT NULL,
      buy_quote TEXT NOT NULL,
      sell_quote TEXT NOT NULL,
      edge_pct REAL NOT NULL,
      next_net_pct REAL,
      outcome TEXT CHECK (outcome IS NULL OR outcome IN ('hit', 'miss')),
      PRIMARY KEY (league, item, hour)
    ) WITHOUT ROWID;

    -- Last trend signal per market item, so TREND/SPIKE alerts fire on a state CHANGE instead of
    -- every cycle the condition keeps holding.
    CREATE TABLE IF NOT EXISTS trend_state (
      league TEXT NOT NULL,
      item_id TEXT NOT NULL,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (league, item_id)
    ) WITHOUT ROWID;
`;
