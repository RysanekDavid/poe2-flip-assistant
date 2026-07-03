-- Users (multi-tenant: market data is shared, account data is per-user).
-- Owner is seeded as id=1 so any pre-multitenant rows backfill cleanly onto it.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,       -- scrypt$<salt>$<hash>
  api_key TEXT UNIQUE NOT NULL,      -- bearer token for the local agent (balance/hunt push)
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Price snapshots (one row per item per fetch) — SHARED across all users (market data).
CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  chaos_equiv REAL NOT NULL,   -- price in Divine base (legacy column name)
  volume REAL,
  change_7d REAL,              -- legacy/per-row (now NULL; lives in item_spark) — kept for back-compat
  spark_7d TEXT,               -- legacy/per-row (now NULL; lives in item_spark) — kept for back-compat
  icon TEXT,                   -- poecdn image URL for the item
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Latest 7d sparkline + change, ONE row per item (not duplicated into every snapshot — that
-- JSON blob was the bulk of price_snapshots). The chart/flip-model only ever read the latest.
CREATE TABLE IF NOT EXISTS item_spark (
  item_id TEXT PRIMARY KEY,
  spark_7d TEXT,               -- JSON array, 7d cumulative %-change series
  change_7d REAL,              -- 7d % change
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Market valuation cache — SHARED. Holds a per-item Div value resolved from market sources
-- (poe2scout uniques; poe.ninja items are valued live from price_snapshots, not stored here).
-- Refreshed ~daily so account scans value showcase/unpriced items without re-fetching constantly.
CREATE TABLE IF NOT EXISTS item_values (
  name_key TEXT PRIMARY KEY,   -- lowercased item name
  value_div REAL NOT NULL,     -- unit value in Divine
  source TEXT NOT NULL,        -- 'scout' (ninja resolves live)
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Price-book observations — SHARED. One row per observed listing (base + mod-signature → ask
-- price in Div). The valuation/snipe engine aggregates these into a market value distribution
-- per signature. Built passively from searches we already run; a proprietary dataset.
CREATE TABLE IF NOT EXISTS price_book_obs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sig TEXT NOT NULL,            -- base + normalized mod-set signature
  base_type TEXT NOT NULL,
  price_div REAL NOT NULL,      -- listed ask in Divine
  listing_id TEXT,             -- trade listing hash, to dedupe re-lists
  seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pbo_sig ON price_book_obs(sig, seen_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pbo_listing ON price_book_obs(listing_id) WHERE listing_id IS NOT NULL;

-- Watchlist (which items to track) — PER-USER. Uniqueness is (user_id, item_id), enforced
-- by idx_watchlist_user_item below (not an inline column UNIQUE, which would be global).
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  buy_threshold_pct REAL DEFAULT 15,
  sell_threshold_pct REAL DEFAULT 10,
  manual_buy_exalt REAL,   -- real observed buy amount (in manual_buy_ccy); null = use estimate
  manual_sell_chaos REAL,  -- real observed sell amount (in manual_sell_ccy); null = use estimate
  manual_buy_ccy TEXT,     -- 'DIVINE' | 'EXALT' | 'CHAOS' (defaults EXALT for legacy rows)
  manual_sell_ccy TEXT,    -- 'DIVINE' | 'EXALT' | 'CHAOS' (defaults CHAOS for legacy rows)
  manual_set_at DATETIME,  -- when manual prices were entered (for staleness/expiry)
  active INTEGER DEFAULT 1,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Alerts log — PER-USER (fired against that user's watchlist).
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT,
  message TEXT NOT NULL,
  value REAL,
  threshold REAL,
  seen INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trade log (manual entries) — PER-USER.
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  side TEXT NOT NULL,            -- 'BUY' | 'SELL'
  currency TEXT NOT NULL,        -- 'CHAOS' | 'EXALT' | 'DIVINE'
  rate REAL NOT NULL,
  quantity INTEGER NOT NULL,
  total_currency REAL NOT NULL,
  profit_chaos REAL,
  traded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

-- Flip log (completed buy→sell, profit auto-computed at log time) — PER-USER.
CREATE TABLE IF NOT EXISTS flips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  buy_price REAL NOT NULL,
  buy_ccy TEXT NOT NULL,          -- 'DIVINE' | 'EXALT' | 'CHAOS'
  sell_price REAL NOT NULL,
  sell_ccy TEXT NOT NULL,
  profit_div REAL NOT NULL,       -- total profit in Divine (canonical base)
  profit_chaos REAL NOT NULL,     -- total profit in Chaos (display)
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Currency holdings (treasury) — PER-USER, one row per (user, currency).
CREATE TABLE IF NOT EXISTS holdings (
  user_id INTEGER NOT NULL DEFAULT 1,
  currency TEXT NOT NULL,       -- 'DIVINE' | 'EXALT' | 'CHAOS'
  amount REAL NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, currency)
);

-- Hunts (saved live-search criteria; read-only — we never auto-buy) — PER-USER.
CREATE TABLE IF NOT EXISTS hunts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL,
  mode TEXT NOT NULL,            -- 'SNIPE' | 'CRAFT_BASE' | 'RESELL'
  item_name TEXT,               -- unique name (SNIPE) or null
  base_type TEXT,               -- base type, e.g. 'Sapphire Ring'
  rarity TEXT,                  -- 'normal' | 'magic' | 'rare' | 'unique' | null (any)
  stats_json TEXT,              -- JSON StatFilter[] (id+min) for craft/resell targeting
  max_amount REAL,              -- price trigger ceiling (only listings at/below)
  max_ccy TEXT,                 -- 'divine' | 'exalted' | 'chaos'
  target_div REAL,              -- your expected resale value in Divine (for margin calc)
  active INTEGER DEFAULT 1,
  last_scan_at DATETIME,
  last_hit_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Hunt hits (live listings found at/below the trigger; you decide + buy manually) — PER-USER.
CREATE TABLE IF NOT EXISTS hunt_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  hunt_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  base_type TEXT,
  price_amount REAL NOT NULL,
  price_ccy TEXT NOT NULL,
  price_div REAL NOT NULL,       -- normalized to Divine for ranking/margin
  margin_pct REAL,               -- (target_div - price_div)/price_div, if target set
  account TEXT,
  whisper TEXT,
  listing_id TEXT,               -- unique trade listing hash (dedupe across re-lists)
  seller_online INTEGER,         -- 1 if seller was in-game when listed
  listed_at TEXT,                -- trade `indexed` timestamp
  sig TEXT NOT NULL,             -- dedup signature (hunt+account+amount)
  seen INTEGER DEFAULT 0,
  found_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Live-hunt runtime status (written by the poller process, read by the UI over the DB)
CREATE TABLE IF NOT EXISTS hunt_runtime (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  connections INTEGER DEFAULT 0,    -- open WebSocket live-searches
  last_event_at DATETIME,           -- last listing pushed
  last_error TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Last auto-snipe scan report (poller writes it, the UI reads it across processes)
CREATE TABLE IF NOT EXISTS autosnipe_report (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  report_json TEXT NOT NULL,        -- serialized ScanReport (findings + per-archetype diags)
  scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Balance snapshots (net-worth over time) — PER-USER, one row per currency reading.
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  divine REAL NOT NULL DEFAULT 0,
  exalted REAL NOT NULL DEFAULT 0,
  chaos REAL NOT NULL DEFAULT 0,
  exalt_per_div REAL NOT NULL,    -- rate used at snapshot time (so net worth is reproducible)
  chaos_per_div REAL NOT NULL,
  other_div REAL NOT NULL DEFAULT 0, -- listed gear value (Div) auto-read from your public tabs
  net_worth_div REAL NOT NULL,    -- divine + exalted/exalt_per_div + chaos/chaos_per_div + other_div
  source TEXT NOT NULL,           -- 'trade' | 'stash' | 'ocr' | 'manual'
  note TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- open flip positions: a BUY leg placed but not yet sold (the standing-order flip loop).
-- Closing a position computes profit and moves it into `flips` (the realized ledger).
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  buy_price REAL NOT NULL,        -- per-unit buy price in buy_ccy
  buy_ccy TEXT NOT NULL,          -- 'DIVINE' | 'EXALT' | 'CHAOS'
  buy_div_unit REAL NOT NULL,     -- per-unit buy cost in Divine at open time (capital basis)
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_positions_open ON positions(opened_at DESC);

-- per-stash-tab breakdown of a balance snapshot (one row per public tab read via trade)
CREATE TABLE IF NOT EXISTS balance_tabs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES balance_snapshots(id) ON DELETE CASCADE,
  tab TEXT NOT NULL,              -- stash tab name (from the trade listing's stash.name)
  divine REAL NOT NULL DEFAULT 0,
  exalted REAL NOT NULL DEFAULT 0,
  chaos REAL NOT NULL DEFAULT 0,
  other_div REAL NOT NULL DEFAULT 0, -- market value (Div) of non-orb items in this tab
  value_div REAL NOT NULL,        -- total Div value of this tab (currency + gear)
  items INTEGER NOT NULL DEFAULT 0,
  unpriced INTEGER NOT NULL DEFAULT 0 -- items with no market value and no usable listing price
);

-- Indexes that reference user_id are created in database.ts AFTER the multi-tenant migration,
-- because on an existing DB the column doesn't exist yet when this file is exec'd.
CREATE INDEX IF NOT EXISTS idx_balance_tabs_snap ON balance_tabs(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_hunt_hits_sig ON hunt_hits(sig, found_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_item_time ON price_snapshots(item_id, fetched_at DESC);
