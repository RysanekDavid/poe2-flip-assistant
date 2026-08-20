import type Database from "better-sqlite3";
import { getDb } from "./database";
import {
  type ConditionalHeaders,
  type PatchDocument,
  type PatchIndexEntry,
  type ReviewDisposition,
} from "../sources/patchNotes/contracts";

export interface SourceSyncState {
  indexEtag: string | null;
  indexLastModified: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  validIndexParserVersion: string | null;
  validIndexValidationPolicy: string | null;
}

export interface SnapshotRecord {
  id: number;
  etag: string | null;
  lastModified: string | null;
  valid: boolean;
  parserVersion: string;
  validationPolicy: string;
}

export interface SnapshotInput {
  sourceId: string;
  kind: "index" | "thread";
  externalId: string;
  sourceUrl: string;
  statusCode: number;
  etag: string | null;
  lastModified: string | null;
  sha256: string;
  artifactPath: string;
  bytes: number;
  valid: boolean;
  parseError: string | null;
  parserName: string;
  parserVersion: string;
  validationPolicy: string;
  retrievedAt: string;
}

export interface PatchBodyTarget {
  threadId: number;
  sourceUrl: string;
  bodyValid: boolean;
}

export interface OfficialPatchRecord {
  threadId: number;
  title: string;
  versionText: string;
  bodyValid: boolean;
  disposition: "pending" | ReviewDisposition | null;
  bodySnapshotId: number | null;
}

export interface ConditionalRequest {
  headers: ConditionalHeaders;
  allowsNotModified: boolean;
}

type Db = Database.Database;

export function sourceSyncState(sourceId: string, db: Db = getDb()): SourceSyncState {
  const row = db.prepare(`
    SELECT index_etag AS indexEtag, index_last_modified AS indexLastModified,
      last_checked_at AS lastCheckedAt, last_success_at AS lastSuccessAt,
      last_error AS lastError, valid_index_parser_version AS validIndexParserVersion,
      valid_index_validation_policy AS validIndexValidationPolicy
    FROM source_sync_state WHERE source_id = ?
  `).get(sourceId) as SourceSyncState | undefined;
  if (!row) throw new Error(`source sync state is not initialized: ${sourceId}`);
  return row;
}

export function latestSourceSnapshot(
  sourceId: string,
  kind: "index" | "thread",
  externalId: string,
  db: Db = getDb(),
): SnapshotRecord | null {
  const row = db.prepare(`
    SELECT id, etag, last_modified AS lastModified, valid, parser_version AS parserVersion,
      validation_policy AS validationPolicy
    FROM source_snapshot
    WHERE source_id = ? AND snapshot_kind = ? AND external_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(sourceId, kind, externalId) as (Omit<SnapshotRecord, "valid"> & { valid: number }) | undefined;
  return row ? { ...row, valid: row.valid === 1 } : null;
}

export function insertSourceSnapshot(input: SnapshotInput, db: Db = getDb()): number {
  db.prepare(`
    INSERT INTO source_snapshot (
      source_id, snapshot_kind, external_id, source_url, http_status, etag,
      last_modified, content_sha256, artifact_path, content_bytes, valid,
      parse_error, parser_name, parser_version, validation_policy, retrieved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(
      source_id, snapshot_kind, external_id, content_sha256,
      parser_name, parser_version, validation_policy
    )
    DO NOTHING
  `).run(
    input.sourceId, input.kind, input.externalId, input.sourceUrl, input.statusCode,
    input.etag, input.lastModified, input.sha256, input.artifactPath, input.bytes,
    input.valid ? 1 : 0, input.parseError, input.parserName, input.parserVersion,
    input.validationPolicy, input.retrievedAt,
  );
  const row = db.prepare(`
    SELECT id, valid FROM source_snapshot
    WHERE source_id = ? AND snapshot_kind = ? AND external_id = ? AND content_sha256 = ?
      AND parser_name = ? AND parser_version = ? AND validation_policy = ?
  `).get(
    input.sourceId, input.kind, input.externalId, input.sha256,
    input.parserName, input.parserVersion, input.validationPolicy,
  ) as { id: number; valid: number } | undefined;
  if (!row) throw new Error("source snapshot insert did not produce a row");
  if ((row.valid === 1) !== input.valid) {
    throw new Error("source snapshot identity has contradictory validation results");
  }
  return row.id;
}

export function recordValidIndexCheck(
  sourceId: string,
  checkedAt: string,
  etag: string | null,
  lastModified: string | null,
  snapshotId: number | null,
  parserVersion: string,
  validationPolicy: string,
  db: Db = getDb(),
): void {
  db.prepare(`
    UPDATE source_sync_state SET
      index_etag = COALESCE(?, index_etag),
      index_last_modified = COALESCE(?, index_last_modified),
      last_checked_at = ?, last_success_at = ?,
      last_valid_index_snapshot_id = COALESCE(?, last_valid_index_snapshot_id),
      valid_index_parser_version = ?,
      valid_index_validation_policy = ?,
      last_error = NULL, consecutive_failures = 0, updated_at = ?
    WHERE source_id = ?
  `).run(
    etag, lastModified, checkedAt, checkedAt, snapshotId, parserVersion, validationPolicy,
    checkedAt, sourceId,
  );
}

export function recordSourceFailure(
  sourceId: string,
  checkedAt: string,
  error: string,
  db: Db = getDb(),
): void {
  db.prepare(`
    UPDATE source_sync_state SET last_checked_at = ?, last_error = ?,
      consecutive_failures = consecutive_failures + 1, updated_at = ?
    WHERE source_id = ?
  `).run(checkedAt, error, checkedAt, sourceId);
}

export function upsertIndexPatches(
  entries: PatchIndexEntry[],
  indexSnapshotId: number,
  baselineThreadId: number,
  db: Db = getDb(),
): number[] {
  const upsert = db.prepare(`
    INSERT INTO official_patch (
      thread_id, source_id, source_order, title, version_text, published_at,
      published_text, source_url, index_snapshot_id
    ) VALUES (?, 'ggg_poe2_patch_notes', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      source_order = excluded.source_order, title = excluded.title,
      version_text = excluded.version_text, published_at = excluded.published_at,
      published_text = excluded.published_text, source_url = excluded.source_url,
      index_snapshot_id = excluded.index_snapshot_id, updated_at = CURRENT_TIMESTAMP
  `);
  const exists = db.prepare("SELECT 1 FROM official_patch WHERE thread_id = ?");
  const pending = db.prepare(`
    INSERT INTO pending_patch_effect (thread_id) VALUES (?)
    ON CONFLICT(thread_id) DO NOTHING
  `);
  const run = db.transaction(() => {
    const discovered: number[] = [];
    for (const entry of entries) {
      const isNew = exists.get(entry.threadId) == null;
      upsert.run(
        entry.threadId, entry.threadId, entry.title, entry.versionText,
        entry.publishedAt, entry.publishedText, entry.sourceUrl, indexSnapshotId,
      );
      if (isNew) discovered.push(entry.threadId);
      if (entry.threadId > baselineThreadId) pending.run(entry.threadId);
    }
    return discovered;
  });
  return run();
}

export function patchBodyTargets(baselineThreadId: number, db: Db = getDb()): PatchBodyTarget[] {
  const rows = db.prepare(`
    SELECT thread_id AS threadId, source_url AS sourceUrl, body_valid AS bodyValid
    FROM official_patch WHERE source_order >= ? ORDER BY source_order DESC
  `).all(baselineThreadId) as Array<Omit<PatchBodyTarget, "bodyValid"> & { bodyValid: number }>;
  return rows.map((row) => ({ ...row, bodyValid: row.bodyValid === 1 }));
}

export function updateOfficialPatchBody(
  document: PatchDocument,
  snapshotId: number,
  db: Db = getDb(),
): void {
  const apply = db.transaction(() => {
    const current = db.prepare(`
      SELECT p.body_snapshot_id AS bodySnapshotId, s.content_sha256 AS contentHash
      FROM official_patch p LEFT JOIN source_snapshot s ON s.id = p.body_snapshot_id
      WHERE p.thread_id = ?
    `).get(document.threadId) as { bodySnapshotId: number | null; contentHash: string | null } | undefined;
    if (!current) throw new Error(`official patch ${document.threadId} does not exist`);
    const next = db.prepare("SELECT content_sha256 AS contentHash FROM source_snapshot WHERE id = ?")
      .get(snapshotId) as { contentHash: string } | undefined;
    if (!next) throw new Error(`source snapshot ${snapshotId} does not exist`);
    db.prepare(`
      UPDATE official_patch SET body_snapshot_id = ?, body_valid = 1,
        headings_json = ?, list_items_json = ?, body_text = ?, updated_at = CURRENT_TIMESTAMP
      WHERE thread_id = ?
    `).run(
      snapshotId, JSON.stringify(document.headings), JSON.stringify(document.listItems),
      document.bodyText, document.threadId,
    );
    if (current.contentHash != null && current.contentHash !== next.contentHash) {
      ensurePendingReview(document.threadId, db);
    }
    db.prepare(`
      INSERT INTO evidence_link (snapshot_id, entity_kind, entity_id, location_json)
      VALUES (?, 'official_patch', ?, ?)
      ON CONFLICT(snapshot_id, entity_kind, entity_id, relation) DO NOTHING
    `).run(
      snapshotId,
      String(document.threadId),
      JSON.stringify({ headings: document.headings.length, listItems: document.listItems.length }),
    );
  });
  apply();
}

export function markOfficialPatchBodyInvalid(threadId: number, db: Db = getDb()): void {
  const apply = db.transaction(() => {
    const result = db.prepare(`
      UPDATE official_patch SET body_valid = 0, updated_at = CURRENT_TIMESTAMP
      WHERE thread_id = ?
    `).run(threadId);
    if (result.changes !== 1) throw new Error(`official patch ${threadId} does not exist`);
    ensurePendingReview(threadId, db);
  });
  apply();
}

export function officialPatch(threadId: number, db: Db = getDb()): OfficialPatchRecord | null {
  const row = db.prepare(`
    SELECT p.thread_id AS threadId, p.title, p.version_text AS versionText,
      p.body_valid AS bodyValid, p.body_snapshot_id AS bodySnapshotId, e.disposition
    FROM official_patch p LEFT JOIN pending_patch_effect e ON e.thread_id = p.thread_id
    WHERE p.thread_id = ?
  `).get(threadId) as (Omit<OfficialPatchRecord, "bodyValid"> & { bodyValid: number }) | undefined;
  return row ? { ...row, bodyValid: row.bodyValid === 1 } : null;
}

export function conditionalRequestForParser(
  etag: string | null,
  lastModified: string | null,
  storedParserVersion: string | null,
  currentParserVersion: string,
  storedValidationPolicy: string | null,
  currentValidationPolicy: string,
  valid: boolean,
): ConditionalRequest {
  const allowsNotModified = valid
    && storedParserVersion === currentParserVersion
    && storedValidationPolicy === currentValidationPolicy;
  return {
    headers: allowsNotModified ? { etag, lastModified } : { etag: null, lastModified: null },
    allowsNotModified,
  };
}

function ensurePendingReview(threadId: number, db: Db): void {
  db.prepare(`
    INSERT INTO pending_patch_effect (thread_id) VALUES (?) ON CONFLICT(thread_id) DO NOTHING
  `).run(threadId);
  db.prepare(`
    UPDATE pending_patch_effect SET disposition = 'pending', reviewer = NULL,
      review_note = NULL, reviewed_at = NULL, catalog_sha256 = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE thread_id = ?
  `).run(threadId);
}

export function reviewOfficialPatch(
  threadId: number,
  disposition: ReviewDisposition,
  reviewer: string,
  note: string,
  catalogSha256: string | null,
  reviewedAt: string,
  db: Db = getDb(),
): void {
  if (!reviewer.trim() || !note.trim()) throw new Error("reviewer and note are required");
  const patch = officialPatch(threadId, db);
  if (!patch) throw new Error(`official patch thread ${threadId} does not exist`);
  if (!patch.bodyValid) throw new Error(`official patch thread ${threadId} has no valid staff body`);
  if (patch.disposition !== "pending") {
    throw new Error(`official patch thread ${threadId} is not pending review`);
  }
  if (disposition === "data_refreshed" && !catalogSha256) {
    throw new Error("data_refreshed requires an active catalog SHA");
  }
  const result = db.prepare(`
    UPDATE pending_patch_effect SET disposition = ?, reviewer = ?, review_note = ?,
      reviewed_at = ?, catalog_sha256 = ?, updated_at = ?
    WHERE thread_id = ? AND disposition = 'pending'
  `).run(disposition, reviewer.trim(), note.trim(), reviewedAt, catalogSha256, reviewedAt, threadId);
  if (result.changes !== 1) throw new Error(`patch review update failed for thread ${threadId}`);
}

export function sourceSnapshotCount(db: Db = getDb()): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM source_snapshot").get() as { count: number };
  return row.count;
}
