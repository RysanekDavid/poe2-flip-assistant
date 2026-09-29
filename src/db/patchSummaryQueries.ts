import type Database from "better-sqlite3";
import { getDb } from "./database";
import { parseStoredList } from "./patchSummaryMigrations";
import { patchSummaryInputSha256, type StoredPatchText } from "../sources/patchNotes/summaryInput";
import type { PatchSummaryUsage, SummaryStatus } from "../sources/patchNotes/summaryContract";
import { PATCH_SOURCE_ID } from "../sources/patchNotes/contracts";

type Db = Database.Database;

/**
 * A thread is news only when an index sync DISCOVERS it and an earlier sync already succeeded.
 * The first sync of a fresh database (or after a forum switch, which clears last_success_at)
 * discovers every listed thread at once, and those must not post to Discord. Forum dates carry no
 * timezone (published_at is NULL in practice), so discovery, not publication date, is the signal.
 * Runs inside upsertIndexPatches' transaction, before this sync records its own success.
 */
export function markDiscoveredAsNews(threadIds: readonly number[], db: Db = getDb()): number {
  if (threadIds.length === 0) return 0;
  const prior = db.prepare(
    "SELECT last_success_at AS lastSuccessAt FROM source_sync_state WHERE source_id = ?",
  ).get(PATCH_SOURCE_ID) as { lastSuccessAt: string | null } | undefined;
  if (prior?.lastSuccessAt == null) return 0;
  const insert = db.prepare(`
    INSERT INTO patch_summary (thread_id, input_sha256, status, announce) VALUES (?, '', 'waiting', 1)
    ON CONFLICT(thread_id) DO NOTHING
  `);
  return threadIds.reduce((n, id) => n + insert.run(id).changes, 0);
}

/**
 * Queue a summary for this exact text. Unchanged text is a no-op, so re-fetches never spend a
 * model call; changed text (or a 'waiting' row's first body) resets the job to pending, keeping
 * the previous summary visible and the announce decision made at discovery — only a thread
 * discovered as news ever announces, and an edit never announces again.
 */
export function upsertSummaryJob(threadId: number, inputSha256: string, db: Db = getDb()): void {
  db.prepare(`
    INSERT INTO patch_summary (thread_id, input_sha256, status, announce) VALUES (?, ?, 'pending', 0)
    ON CONFLICT(thread_id) DO UPDATE SET input_sha256 = excluded.input_sha256, status = 'pending',
      attempts = 0, next_attempt_at = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE patch_summary.input_sha256 <> excluded.input_sha256
  `).run(threadId, inputSha256);
}

export interface DueSummaryJob extends StoredPatchText {
  inputSha256: string;
  attempts: number;
}

/** Pending jobs whose backoff has elapsed, newest patch first. */
export function dueSummaryJobs(limit: number, nowIso: string, db: Db = getDb()): DueSummaryJob[] {
  const rows = db.prepare(`
    SELECT s.thread_id AS threadId, s.input_sha256 AS inputSha256, s.attempts, p.title,
      p.version_text AS versionText, p.headings_json AS headingsJson, p.list_items_json AS listItemsJson
    FROM patch_summary s JOIN official_patch p ON p.thread_id = s.thread_id
    WHERE s.status = 'pending' AND p.body_valid = 1
      AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= ?)
    ORDER BY p.source_order DESC LIMIT ?
  `).all(nowIso, limit) as Array<Omit<DueSummaryJob, "headings" | "listItems"> & {
    headingsJson: string | null;
    listItemsJson: string | null;
  }>;
  return rows.map(({ headingsJson, listItemsJson, ...row }) => ({
    ...row,
    headings: parseStoredList(headingsJson, "headings_json", row.threadId),
    listItems: parseStoredList(listItemsJson, "list_items_json", row.threadId),
  }));
}

/**
 * Claim a due job before calling the Coach by pushing its next attempt past the call deadline.
 * Only one claimant gets changes = 1, so the poller and `patch:summarize` never pay for the same
 * summary twice; a crash mid-call just lets the lease expire and the job become due again.
 */
export function leaseSummaryJob(
  threadId: number,
  inputSha256: string,
  nowIso: string,
  leaseUntilIso: string,
  db: Db = getDb(),
): boolean {
  return db.prepare(`
    UPDATE patch_summary SET next_attempt_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE thread_id = ? AND input_sha256 = ? AND status = 'pending'
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
  `).run(leaseUntilIso, threadId, inputSha256, nowIso).changes === 1;
}

export interface SummaryResult {
  threadId: number;
  inputSha256: string;
  model: string;
  promptVersion: string;
  truncated: boolean;
  summaryJson: string;
  usage: PatchSummaryUsage;
  at: string;
}

/**
 * Store a summary. Guarded by the input hash: if the body changed while the Coach was working,
 * the job was already reset to the new text and this stale result is dropped (returns false).
 */
export function markSummaryDone(result: SummaryResult, db: Db = getDb()): boolean {
  const changes = db.prepare(`
    UPDATE patch_summary SET status = 'done', model = ?, prompt_version = ?, truncated = ?,
      summary_json = ?, usage_json = ?, summarized_at = ?, last_error = NULL,
      next_attempt_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE thread_id = ? AND input_sha256 = ? AND status = 'pending'
  `).run(
    result.model, result.promptVersion, result.truncated ? 1 : 0, result.summaryJson,
    JSON.stringify(result.usage), result.at, result.threadId, result.inputSha256,
  ).changes;
  return changes === 1;
}

/** Record a failed attempt: `nextAttemptAt` null means out of retries (status failed). */
export function markSummaryRetry(
  threadId: number,
  inputSha256: string,
  attempts: number,
  nextAttemptAt: string | null,
  error: string,
  db: Db = getDb(),
): boolean {
  const changes = db.prepare(`
    UPDATE patch_summary SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE thread_id = ? AND input_sha256 = ? AND status = 'pending'
  `).run(nextAttemptAt == null ? "failed" : "pending", attempts, nextAttemptAt, error, threadId, inputSha256).changes;
  return changes === 1;
}

export interface AnnounceCandidate {
  threadId: number;
  status: "done" | "failed";
  summaryJson: string | null;
  title: string;
  versionText: string;
  sourceUrl: string;
}

/** Terminal summaries that still owe their one PATCH alert, oldest patch first. */
export function unannouncedTerminal(db: Db = getDb()): AnnounceCandidate[] {
  return db.prepare(`
    SELECT s.thread_id AS threadId, s.status, s.summary_json AS summaryJson, p.title,
      p.version_text AS versionText, p.source_url AS sourceUrl
    FROM patch_summary s JOIN official_patch p ON p.thread_id = s.thread_id
    WHERE s.announce = 1 AND s.announced_at IS NULL AND s.status IN ('done', 'failed')
    ORDER BY p.source_order ASC
  `).all() as AnnounceCandidate[];
}

/** Returns false when another writer announced it first — the caller must then not alert. */
export function markAnnounced(threadId: number, at: string, db: Db = getDb()): boolean {
  return db.prepare(`
    UPDATE patch_summary SET announced_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE thread_id = ? AND announce = 1 AND announced_at IS NULL
  `).run(at, threadId).changes === 1;
}

export type ResummaryOutcome = "queued" | "not_found" | "no_body";

/** Owner action: summarize again even if the text is unchanged. Never announces. */
export function requestResummary(threadId: number, db: Db = getDb()): ResummaryOutcome {
  const patch = db.prepare(`
    SELECT title, body_valid AS bodyValid, headings_json AS headingsJson, list_items_json AS listItemsJson
    FROM official_patch WHERE thread_id = ?
  `).get(threadId) as { title: string; bodyValid: number; headingsJson: string | null; listItemsJson: string | null } | undefined;
  if (!patch) return "not_found";
  if (patch.bodyValid !== 1) return "no_body";
  const sha = patchSummaryInputSha256(
    patch.title,
    parseStoredList(patch.headingsJson, "headings_json", threadId),
    parseStoredList(patch.listItemsJson, "list_items_json", threadId),
  );
  db.prepare(`
    INSERT INTO patch_summary (thread_id, input_sha256, status, announce) VALUES (?, ?, 'pending', 0)
    ON CONFLICT(thread_id) DO UPDATE SET input_sha256 = excluded.input_sha256, status = 'pending',
      attempts = 0, next_attempt_at = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP
  `).run(threadId, sha);
  return "queued";
}

/** `patch:summarize --force`: every stored body back to pending, announcements untouched. */
export function resetAllSummaries(db: Db = getDb()): number {
  return db.prepare(`
    UPDATE patch_summary SET status = 'pending', attempts = 0, next_attempt_at = NULL,
      last_error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE status <> 'waiting'
  `).run().changes;
}

export interface PatchListRow {
  threadId: number;
  sourceOrder: number;
  title: string;
  versionText: string;
  publishedAt: string | null;
  publishedText: string;
  sourceUrl: string;
  bodyValid: boolean;
  disposition: "pending" | "no_gameplay_impact" | "data_refreshed" | null;
  summaryStatus: SummaryStatus | null;
  model: string | null;
  promptVersion: string | null;
  summarizedAt: string | null;
  truncated: boolean;
  summaryJson: string | null;
  lastError: string | null;
}

type RawListRow = Omit<PatchListRow, "bodyValid" | "truncated"> & { bodyValid: number; truncated: number | null };

const LIST_SELECT = `
  SELECT p.thread_id AS threadId, p.source_order AS sourceOrder, p.title, p.version_text AS versionText,
    p.published_at AS publishedAt, p.published_text AS publishedText, p.source_url AS sourceUrl,
    p.body_valid AS bodyValid, e.disposition,
    CASE WHEN s.status = 'waiting' THEN NULL ELSE s.status END AS summaryStatus, s.model,
    s.prompt_version AS promptVersion, s.summarized_at AS summarizedAt, s.truncated,
    s.summary_json AS summaryJson, s.last_error AS lastError
  FROM official_patch p
  LEFT JOIN pending_patch_effect e ON e.thread_id = p.thread_id
  LEFT JOIN patch_summary s ON s.thread_id = p.thread_id
`;

const toListRow = (row: RawListRow): PatchListRow => ({ ...row, bodyValid: row.bodyValid === 1, truncated: row.truncated === 1 });

/** Newest patches first; `beforeOrder` pages to older ones (source_order is the forum thread id). */
export function listPatches(limit: number, beforeOrder: number | null, db: Db = getDb()): PatchListRow[] {
  const rows = db.prepare(`${LIST_SELECT}
    WHERE (@before IS NULL OR p.source_order < @before) ORDER BY p.source_order DESC LIMIT @limit
  `).all({ before: beforeOrder, limit }) as RawListRow[];
  return rows.map(toListRow);
}

export interface PatchDetailRow extends PatchListRow {
  headings: string[];
  listItems: string[];
  bodyText: string | null;
}

type RawDetailRow = RawListRow & { headingsJson: string | null; listItemsJson: string | null; bodyText: string | null };

export function patchDetail(threadId: number, db: Db = getDb()): PatchDetailRow | null {
  const row = db.prepare(`
    SELECT d.*, p.headings_json AS headingsJson, p.list_items_json AS listItemsJson, p.body_text AS bodyText
    FROM (${LIST_SELECT} WHERE p.thread_id = ?) d JOIN official_patch p ON p.thread_id = d.threadId
  `).get(threadId) as RawDetailRow | undefined;
  if (!row) return null;
  const { headingsJson, listItemsJson, bodyText, ...rest } = row;
  return {
    ...toListRow(rest),
    headings: parseStoredList(headingsJson, "headings_json", threadId),
    listItems: parseStoredList(listItemsJson, "list_items_json", threadId),
    bodyText,
  };
}
