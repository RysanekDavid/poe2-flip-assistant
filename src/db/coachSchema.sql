-- Coach tables (history, leases, usage telemetry). Executed by getDb() right after schema.sql,
-- which owns `users`: every table here references users(id). Nothing in the league/patch
-- migrations touches these tables, so running them before those migrations is safe.

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

-- Cost/latency telemetry per completed Coach turn. Deliberately content-free and NOT tied to
-- coach_turns: conversation pruning/deletion must not erase what a turn cost. duration_ms is the
-- FastAPI agent run; proxy_duration_ms is the whole web request (history lease → persistence).
CREATE TABLE IF NOT EXISTS coach_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  model_calls INTEGER NOT NULL CHECK (model_calls >= 0),
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  total_tokens INTEGER NOT NULL CHECK (total_tokens >= 0),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  proxy_duration_ms INTEGER NOT NULL CHECK (proxy_duration_ms >= 0),
  completed_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_coach_usage_time ON coach_usage(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_recent
  ON coach_conversations(user_id, last_message_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_coach_leases_expiry
  ON coach_conversation_leases(expires_at);
