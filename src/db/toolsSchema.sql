-- Tools tab tables (price regex presets, liquidation item rows). Executed by getDb() after
-- schema.sql, coachSchema.sql and opsSchema.sql: both tables reference schema.sql tables (users,
-- balance_snapshots), so this file must stay after schema.sql in SCHEMA_FILES.

-- Saved Price-regex generator inputs, per user. params_json is validated by the tool's zod schema
-- on read, not here, so the generator can evolve without a migration.
CREATE TABLE IF NOT EXISTS regex_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league TEXT NOT NULL, name TEXT NOT NULL,
  params_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, name));

-- Per-item rows behind a balance snapshot, so Liquidate can rank what to sell. market_source and
-- the ask pair keep every number attributable (market value vs the seller's own asking price).
-- market_div is the whole listing; ask_amount/ask_currency is the note as listed, i.e. PER UNIT
-- (a stash note on a stack prices one unit), so the listing's ask is ask_amount × stack_size.
CREATE TABLE IF NOT EXISTS balance_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES balance_snapshots(id) ON DELETE CASCADE,
  tab TEXT, item_name TEXT NOT NULL, base_type TEXT, rarity TEXT,
  stack_size INTEGER NOT NULL DEFAULT 1,
  market_div REAL, market_source TEXT,
  ask_amount REAL, ask_currency TEXT);
CREATE INDEX IF NOT EXISTS idx_balance_items_snap ON balance_items(snapshot_id);
