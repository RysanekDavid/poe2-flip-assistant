import type Database from "better-sqlite3";
import { z } from "zod";
import { patchSummaryInputSha256 } from "../sources/patchNotes/summaryInput";

type Db = Database.Database;

/*
 * One row per official patch thread: the summary job the poller drains through the Coach, and
 * the stored result. The Coach never writes here. `announce` decides whether the terminal state
 * fans out a PATCH alert; `announced_at` makes that fan-out happen exactly once.
 */
const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS patch_summary (
    thread_id INTEGER PRIMARY KEY REFERENCES official_patch(thread_id),
    input_sha256 TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    last_error TEXT,
    model TEXT,
    prompt_version TEXT,
    truncated INTEGER NOT NULL DEFAULT 0 CHECK (truncated IN (0, 1)),
    summary_json TEXT CHECK (summary_json IS NULL OR json_valid(summary_json)),
    usage_json TEXT CHECK (usage_json IS NULL OR json_valid(usage_json)),
    summarized_at TEXT,
    announce INTEGER NOT NULL DEFAULT 0 CHECK (announce IN (0, 1)),
    announced_at TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_patch_summary_due ON patch_summary(status, next_attempt_at);
`;

const storedListSchema = z.array(z.string());

/** Parse a stored headings/list-items column; a malformed one is a defect, not an empty list. */
export function parseStoredList(raw: string | null, column: string, threadId: number): string[] {
  if (raw == null) return [];
  const parsed = storedListSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error(`official_patch ${threadId} ${column} is not a string array`);
  return parsed.data;
}

/**
 * Create the table and queue every patch that already has a valid body. Those rows predate the
 * feature, so they are summarized quietly (announce = 0): shipping this must not post ~20 old
 * patches to every user's Discord. Idempotent — rows that already exist are left alone.
 */
export function migratePatchSummaries(db: Db): void {
  db.exec(TABLE_SQL);
  const missing = db.prepare(`
    SELECT p.thread_id AS threadId, p.title, p.headings_json AS headingsJson,
      p.list_items_json AS listItemsJson
    FROM official_patch p LEFT JOIN patch_summary s ON s.thread_id = p.thread_id
    WHERE p.body_valid = 1 AND s.thread_id IS NULL
  `).all() as Array<{ threadId: number; title: string; headingsJson: string | null; listItemsJson: string | null }>;
  if (missing.length === 0) return;
  const insert = db.prepare(`
    INSERT INTO patch_summary (thread_id, input_sha256, status, announce) VALUES (?, ?, 'pending', 0)
    ON CONFLICT(thread_id) DO NOTHING
  `);
  db.transaction(() => {
    for (const row of missing) {
      const headings = parseStoredList(row.headingsJson, "headings_json", row.threadId);
      const items = parseStoredList(row.listItemsJson, "list_items_json", row.threadId);
      insert.run(row.threadId, patchSummaryInputSha256(row.title, headings, items));
    }
  })();
  console.log(`[patch-summary] queued ${missing.length} existing patch(es) for a quiet summary`);
}
