import type Database from "better-sqlite3";
import {
  PATCH_PARSER_NAME,
  PATCH_PARSER_VERSION,
} from "../sources/patchNotes/contracts";

type Db = Database.Database;

export function migratePatchProvenance(db: Db): void {
  const foreignKeysEnabled = db.pragma("foreign_keys", { simple: true }) === 1;
  db.pragma("foreign_keys = OFF");
  const migrate = db.transaction(() => {
    addMigrationColumns(db, "source_registry", [
      ["parser_name", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["parser_version", "TEXT NOT NULL DEFAULT 'legacy'"],
      ["terms_url", "TEXT NOT NULL DEFAULT ''"],
      ["check_cadence_min", "INTEGER NOT NULL DEFAULT 30 CHECK (check_cadence_min > 0)"],
      ["legal_review_status", "TEXT NOT NULL DEFAULT 'pending_review'"],
      ["legal_reviewed_at", "TEXT"],
    ]);
    addMigrationColumns(db, "source_sync_state", [["valid_index_parser_version", "TEXT"]]);
    addMigrationColumns(db, "source_sync_state", [["valid_index_validation_policy", "TEXT"]]);
    if (legacySnapshotNeedsRebuild(db)) rebuildLegacySourceSnapshots(db);
    seedPatchSource(db);
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(`patch provenance migration produced ${violations.length} foreign-key violation(s)`);
    }
  });
  try {
    migrate();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeysEnabled ? "ON" : "OFF"}`);
  }
}

function addMigrationColumns(db: Db, table: string, columns: Array<[string, string]>): void {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name),
  );
  for (const [name, definition] of columns) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function legacySnapshotNeedsRebuild(db: Db): boolean {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'source_snapshot'",
  ).get() as { sql: string } | undefined;
  if (!row) throw new Error("source_snapshot table is missing after schema initialization");
  const normalized = row.sql.replace(/\s+/g, " ").toLowerCase();
  return !/unique\s*\([^)]*parser_name[^)]*parser_version[^)]*validation_policy[^)]*\)/.test(normalized);
}

function rebuildLegacySourceSnapshots(db: Db): void {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(source_snapshot)").all() as Array<{ name: string }>).map((row) => row.name),
  );
  const parserName = columns.has("parser_name")
    ? "COALESCE(parser_name, 'ggg-forum-patch-notes')"
    : "'ggg-forum-patch-notes'";
  const parserVersion = columns.has("parser_version") ? "COALESCE(parser_version, '1')" : "'1'";
  db.exec(`
    CREATE TABLE source_snapshot_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES source_registry(source_id),
      snapshot_kind TEXT NOT NULL CHECK (snapshot_kind IN ('index', 'thread')),
      external_id TEXT NOT NULL, source_url TEXT NOT NULL, http_status INTEGER NOT NULL,
      etag TEXT, last_modified TEXT, content_sha256 TEXT NOT NULL, artifact_path TEXT NOT NULL,
      content_bytes INTEGER NOT NULL, valid INTEGER NOT NULL CHECK (valid IN (0, 1)),
      parse_error TEXT, parser_name TEXT NOT NULL, parser_version TEXT NOT NULL,
      validation_policy TEXT NOT NULL,
      retrieved_at DATETIME NOT NULL,
      UNIQUE(
        source_id, snapshot_kind, external_id, content_sha256,
        parser_name, parser_version, validation_policy
      )
    );
    INSERT INTO source_snapshot_new (
      id, source_id, snapshot_kind, external_id, source_url, http_status, etag, last_modified,
      content_sha256, artifact_path, content_bytes, valid, parse_error, parser_name,
      parser_version, validation_policy, retrieved_at
    ) SELECT id, source_id, snapshot_kind, external_id, source_url, http_status, etag,
      last_modified, content_sha256, artifact_path, content_bytes, valid, parse_error,
      ${parserName}, ${parserVersion},
      CASE snapshot_kind WHEN 'index' THEN 'index:legacy' ELSE 'thread:structured-staff-body-v1' END,
      retrieved_at FROM source_snapshot;
    DROP TABLE source_snapshot;
    ALTER TABLE source_snapshot_new RENAME TO source_snapshot;
    CREATE INDEX idx_source_snapshot_lookup
      ON source_snapshot(source_id, snapshot_kind, external_id, id DESC);
  `);
  db.prepare(`
    UPDATE source_sync_state SET valid_index_parser_version = '1'
    WHERE last_valid_index_snapshot_id IS NOT NULL AND valid_index_parser_version IS NULL
  `).run();
  db.prepare(`
    UPDATE source_sync_state SET valid_index_validation_policy = 'index:legacy'
    WHERE last_valid_index_snapshot_id IS NOT NULL AND valid_index_validation_policy IS NULL
  `).run();
}

function seedPatchSource(db: Db): void {
  db.prepare(`
    INSERT INTO source_registry (
      source_id, owner, authority, acquisition, base_url, parser_name, parser_version,
      terms_url, check_cadence_min, legal_review_status
    ) VALUES (?, 'Grinding Gear Games', 'official', 'allowlisted_html', ?, ?, ?, ?, 30, 'pending_review')
    ON CONFLICT(source_id) DO UPDATE SET parser_name = excluded.parser_name,
      parser_version = excluded.parser_version, terms_url = excluded.terms_url,
      check_cadence_min = excluded.check_cadence_min
  `).run(
    "ggg_poe2_patch_notes",
    "https://www.pathofexile.com/forum/view-forum/2222",
    PATCH_PARSER_NAME,
    PATCH_PARSER_VERSION,
    "https://www.pathofexile.com/legal/terms-of-use-and-privacy-policy",
  );
  db.prepare(`
    INSERT INTO source_sync_state (source_id) VALUES (?) ON CONFLICT(source_id) DO NOTHING
  `).run("ggg_poe2_patch_notes");
}
