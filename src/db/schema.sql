-- Users (multi-tenant: market data is shared, account data is per-user).
-- Owner is seeded as id=1 so any pre-multitenant rows backfill cleanly onto it.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,       -- scrypt$<salt>$<hash>
  api_key TEXT UNIQUE NOT NULL,      -- bearer token for the local agent (balance/hunt push)
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  league TEXT,                       -- league this user VIEWS; NULL = follow the app default
  league_set_at TEXT,                -- ISO stamp of the last switch — drives the poller's dwell debounce
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Persisted public Coach history. Only completed user/assistant turns are stored; tool protocol,
-- reasoning traces, provider ids and partial attempts never enter the application database.
CREATE TABLE IF NOT EXISTS coach_conversations (
  user_id INTEGER NOT NULL,
  id TEXT NOT NULL CHECK (length(id) = 36),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  turn_count INTEGER NOT NULL DEFAULT 0 CHECK (turn_count BETWEEN 0 AND 50),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coach_turns (
  user_id INTEGER NOT NULL,
  conversation_id TEXT NOT NULL CHECK (length(conversation_id) = 36),
  turn_id TEXT NOT NULL CHECK (length(turn_id) = 36),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 50),
  user_message TEXT NOT NULL CHECK (length(user_message) BETWEEN 1 AND 8000),
  assistant_answer TEXT NOT NULL CHECK (length(assistant_answer) BETWEEN 1 AND 64000),
  tools_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tools_json) AND json_type(tools_json) = 'array'),
  processors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(processors_json) AND json_type(processors_json) = 'array'),
  sources_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sources_json) AND json_type(sources_json) = 'array'),
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, conversation_id, turn_id),
  UNIQUE (user_id, conversation_id, ordinal),
  FOREIGN KEY (user_id, conversation_id)
    REFERENCES coach_conversations(user_id, id) ON DELETE CASCADE
);

-- A lease deliberately references only the user. First-turn leases must not create an empty
-- conversation row, and a successful atomic completion creates that row together with the turn.
CREATE TABLE IF NOT EXISTS coach_conversation_leases (
  user_id INTEGER NOT NULL,
  conversation_id TEXT NOT NULL CHECK (length(conversation_id) = 36),
  turn_id TEXT NOT NULL CHECK (length(turn_id) = 36),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, conversation_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_recent
  ON coach_conversations(user_id, last_message_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_coach_leases_expiry
  ON coach_conversation_leases(expires_at);

-- Price snapshots (one row per item per fetch) — SHARED across all users (market data), but
-- LEAGUE-SCOPED: a switch must not mix two markets' prices, and must not destroy either.
-- The '' default exists only so the additive migration can ALTER an existing table; every row
-- is backfilled to the tracked league immediately after (leagueMigrations asserts none remain).
CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league TEXT NOT NULL DEFAULT '',
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
  league TEXT NOT NULL DEFAULT '',
  item_id TEXT NOT NULL,
  spark_7d TEXT,               -- JSON array, 7d cumulative %-change series
  change_7d REAL,              -- 7d % change
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league, item_id)
);

-- Market valuation cache — SHARED. Holds a per-item Div value resolved from market sources
-- (poe2scout uniques; poe.ninja items are valued live from price_snapshots, not stored here).
-- Refreshed ~daily so account scans value showcase/unpriced items without re-fetching constantly.
CREATE TABLE IF NOT EXISTS item_values (
  league TEXT NOT NULL DEFAULT '',
  name_key TEXT NOT NULL,      -- lowercased item name
  value_div REAL NOT NULL,     -- unit value in Divine
  source TEXT NOT NULL,        -- 'scout' (ninja resolves live)
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league, name_key)
);

-- Price-book observations — SHARED. One row per observed listing (base + mod-signature → ask
-- price in Div). The valuation/snipe engine aggregates these into a market value distribution
-- per signature. Built passively from searches we already run; a proprietary dataset.
CREATE TABLE IF NOT EXISTS price_book_obs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league TEXT NOT NULL DEFAULT '',
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
  league TEXT,                  -- market the row was added in; alerts + spreads filter on it
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
  league TEXT,
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
  league TEXT,
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
  league TEXT,
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
  league TEXT,
  label TEXT NOT NULL,
  mode TEXT NOT NULL,            -- 'SNIPE' | 'CRAFT_BASE' | 'RESELL'
  item_name TEXT,               -- unique name (SNIPE) or null
  base_type TEXT,               -- base type, e.g. 'Sapphire Ring'
  category TEXT,                -- trade2 category, e.g. 'weapon.bow' (when no single base type applies)
  ilvl_min INTEGER,             -- minimum item level (craft bases care)
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

-- Latest craft-margin report per recipe (poller writes, the UI reads across processes) — SHARED.
-- report_json is the full itemized RecipeMarginReport (base/result legs + materials + EV math).
CREATE TABLE IF NOT EXISTS craft_margin_reports (
  league TEXT NOT NULL DEFAULT '',
  recipe_key TEXT NOT NULL,
  report_json TEXT NOT NULL,
  ev_div REAL NOT NULL,
  margin_pct REAL NOT NULL,
  scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,                -- transient scan failure that did NOT replace the good report above
  last_error_at DATETIME,
  PRIMARY KEY (league, recipe_key)
);

-- Craft-margin EV over time (one row per recipe per scan) — powers the margin sparkline. SHARED.
-- Craft P&L: one row per real craft attempt the user logs — PER-USER. Costs snapshot what was
-- actually paid; outcome + sold close the loop so real hit-rate/EV can be compared to the model.
CREATE TABLE IF NOT EXISTS craft_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  recipe_key TEXT NOT NULL,
  base_cost_div REAL NOT NULL DEFAULT 0,
  mats_cost_div REAL NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'hit' | 'brick'
  sold_div REAL,                         -- realized sale in Divine (brick salvage counts too)
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_craft_attempts_user ON craft_attempts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS craft_margin_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league TEXT NOT NULL DEFAULT '',
  recipe_key TEXT NOT NULL,
  ev_div REAL NOT NULL,
  margin_pct REAL NOT NULL,
  scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cmh_key ON craft_margin_history(recipe_key, scanned_at DESC);

-- Single-row flag: the web POST sets requested=1, the poller consumes it (clears to 0) and runs
-- the full refresh in-process. Keeps all trade2 traffic on the poller's rate limiter, not the web's.
CREATE TABLE IF NOT EXISTS craft_refresh_request (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  requested INTEGER NOT NULL DEFAULT 0,
  requested_at DATETIME
);

-- Balance snapshots (net-worth over time) — PER-USER, one row per currency reading.
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  league TEXT,
  divine REAL NOT NULL DEFAULT 0,
  exalted REAL NOT NULL DEFAULT 0,
  chaos REAL NOT NULL DEFAULT 0,
  exalt_per_div REAL NOT NULL,    -- rate used at snapshot time (so net worth is reproducible)
  chaos_per_div REAL NOT NULL,
  other_div REAL NOT NULL DEFAULT 0, -- listed gear value (Div) auto-read from your public tabs
  net_worth_div REAL NOT NULL,    -- divine + exalted/exalt_per_div + chaos/chaos_per_div + other_div
  source TEXT NOT NULL,           -- 'trade' | 'stash' | 'ocr' | 'manual'
  note TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  listed_seen INTEGER,            -- trade read: listings returned (trade2 caps a search at 100)
  listed_total INTEGER,           -- trade read: listings trade2 says exist (> seen = truncated)
  gear_at_ask_div REAL            -- part of other_div valued at the seller's OWN asking price
);

-- open flip positions: a BUY leg placed but not yet sold (the standing-order flip loop).
-- Closing a position computes profit and moves it into `flips` (the realized ledger).
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  league TEXT,
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

-- Provenance registry and immutable official-source snapshots. Artifacts live on disk; only
-- verified relative paths and their raw-content hashes are committed to SQLite.
CREATE TABLE IF NOT EXISTS source_registry (
  source_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  authority TEXT NOT NULL CHECK (authority IN ('official', 'datamined', 'third_party', 'curated', 'anecdotal')),
  acquisition TEXT NOT NULL,
  base_url TEXT NOT NULL,
  parser_name TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  terms_url TEXT NOT NULL,
  check_cadence_min INTEGER NOT NULL CHECK (check_cadence_min > 0),
  legal_review_status TEXT NOT NULL CHECK (legal_review_status IN ('pending_review', 'approved', 'rejected')),
  legal_reviewed_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES source_registry(source_id),
  snapshot_kind TEXT NOT NULL CHECK (snapshot_kind IN ('index', 'thread')),
  external_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  etag TEXT,
  last_modified TEXT,
  content_sha256 TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  content_bytes INTEGER NOT NULL,
  valid INTEGER NOT NULL CHECK (valid IN (0, 1)),
  parse_error TEXT,
  parser_name TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  validation_policy TEXT NOT NULL,
  retrieved_at DATETIME NOT NULL,
  UNIQUE(
    source_id, snapshot_kind, external_id, content_sha256,
    parser_name, parser_version, validation_policy
  )
);

CREATE TABLE IF NOT EXISTS source_sync_state (
  source_id TEXT PRIMARY KEY REFERENCES source_registry(source_id),
  index_etag TEXT,
  index_last_modified TEXT,
  last_checked_at DATETIME,
  last_success_at DATETIME,
  last_valid_index_snapshot_id INTEGER REFERENCES source_snapshot(id),
  valid_index_parser_version TEXT,
  valid_index_validation_policy TEXT,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evidence_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES source_snapshot(id),
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'supports',
  location_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_id, entity_kind, entity_id, relation)
);

CREATE TABLE IF NOT EXISTS official_patch (
  thread_id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source_registry(source_id),
  source_order INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  version_text TEXT NOT NULL,
  published_at TEXT,
  published_text TEXT NOT NULL,
  source_url TEXT NOT NULL,
  index_snapshot_id INTEGER NOT NULL REFERENCES source_snapshot(id),
  body_snapshot_id INTEGER REFERENCES source_snapshot(id),
  body_valid INTEGER NOT NULL DEFAULT 0 CHECK (body_valid IN (0, 1)),
  headings_json TEXT,
  list_items_json TEXT,
  body_text TEXT,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_patch_effect (
  thread_id INTEGER PRIMARY KEY REFERENCES official_patch(thread_id),
  disposition TEXT NOT NULL DEFAULT 'pending'
    CHECK (disposition IN ('pending', 'no_gameplay_impact', 'data_refreshed')),
  reviewer TEXT,
  review_note TEXT,
  reviewed_at TEXT,
  catalog_sha256 TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (disposition = 'pending' AND reviewer IS NULL AND review_note IS NULL AND reviewed_at IS NULL AND catalog_sha256 IS NULL)
    OR (disposition = 'no_gameplay_impact' AND reviewer IS NOT NULL AND review_note IS NOT NULL AND reviewed_at IS NOT NULL AND catalog_sha256 IS NULL)
    OR (disposition = 'data_refreshed' AND reviewer IS NOT NULL AND review_note IS NOT NULL AND reviewed_at IS NOT NULL AND catalog_sha256 IS NOT NULL)
  )
);

-- Runtime app settings (key/value) — league switching without a redeploy lives here.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Currency exchange rates per league, one row per (league, pair, source) — SHARED.
-- `source` is the provenance of the number: 'cx' = GGG's public Currency Exchange digest
-- (volume-weighted, hourly), 'scout' = poe2scout league aggregate. ninja-derived rates are
-- computed live from price_snapshots and deliberately NOT stored here.
CREATE TABLE IF NOT EXISTS currency_rates (
  league TEXT NOT NULL,
  pair TEXT NOT NULL,             -- 'exalt_per_divine' | 'chaos_per_divine' | 'exalt_per_chaos'
  rate REAL NOT NULL,
  rate_low REAL,                  -- hourly ratio band (cx lowest/highest_ratio), null for scout
  rate_high REAL,
  sample_volume INTEGER,          -- units of the denominator traded in the sampled hour
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hour INTEGER,                   -- unix hour the cx digest covered, null for scout
  PRIMARY KEY (league, pair, source)
);

-- Detected PoE2 league (single row). `alerted_league` dedupes the "new league" alert so a
-- detection that repeats every 6h only ever fires once per league.
CREATE TABLE IF NOT EXISTS league_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  detected_current TEXT,
  detected_at TEXT,
  sources_json TEXT CHECK (sources_json IS NULL OR json_valid(sources_json)),
  alerted_league TEXT
);

-- Self-maintaining league chronology: no public API exposes PoE2 league launch dates, so we
-- record when WE first saw each name (seeded with known history in leagueMigrations). Ordering
-- newest-first in the UI comes from here, never from a source's arbitrary list order.
CREATE TABLE IF NOT EXISTS league_registry (
  league TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL
);

-- Indexes that reference user_id are created in database.ts AFTER the multi-tenant migration,
-- because on an existing DB the column doesn't exist yet when this file is exec'd.
CREATE INDEX IF NOT EXISTS idx_balance_tabs_snap ON balance_tabs(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_hunt_hits_sig ON hunt_hits(sig, found_at DESC);
-- idx_snapshots_item_time is created in leagueMigrations.ts, NOT here: this file is exec'd
-- before the migration adds price_snapshots.league, so a legacy database that is missing the
-- index (dropped for a rebuild, or predating it) would fail on "no such column: league" and
-- never reach the migration at all. Its name is pinned by services/coach/src/tools/market.py.
CREATE INDEX IF NOT EXISTS idx_source_snapshot_lookup ON source_snapshot(source_id, snapshot_kind, external_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_official_patch_order ON official_patch(source_order DESC);
CREATE INDEX IF NOT EXISTS idx_pending_patch_disposition ON pending_patch_effect(disposition, thread_id DESC);
