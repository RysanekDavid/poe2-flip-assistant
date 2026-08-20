CREATE TABLE source_registry (
  source_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  authority TEXT NOT NULL,
  acquisition TEXT NOT NULL,
  base_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE source_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES source_registry(source_id),
  snapshot_kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  etag TEXT,
  last_modified TEXT,
  content_sha256 TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  content_bytes INTEGER NOT NULL,
  valid INTEGER NOT NULL,
  parse_error TEXT,
  retrieved_at DATETIME NOT NULL,
  UNIQUE(source_id, snapshot_kind, external_id, content_sha256)
);

CREATE TABLE source_sync_state (
  source_id TEXT PRIMARY KEY REFERENCES source_registry(source_id),
  index_etag TEXT,
  index_last_modified TEXT,
  last_checked_at DATETIME,
  last_success_at DATETIME,
  last_valid_index_snapshot_id INTEGER REFERENCES source_snapshot(id),
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE evidence_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES source_snapshot(id),
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'supports',
  location_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_id, entity_kind, entity_id, relation)
);

CREATE TABLE official_patch (
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
  body_valid INTEGER NOT NULL DEFAULT 0,
  headings_json TEXT,
  list_items_json TEXT,
  body_text TEXT,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pending_patch_effect (
  thread_id INTEGER PRIMARY KEY REFERENCES official_patch(thread_id),
  disposition TEXT NOT NULL DEFAULT 'pending',
  reviewer TEXT,
  review_note TEXT,
  reviewed_at TEXT,
  catalog_sha256 TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO source_registry (
  source_id, owner, authority, acquisition, base_url
) VALUES (
  'ggg_poe2_patch_notes', 'Grinding Gear Games', 'official', 'allowlisted_html',
  'https://www.pathofexile.com/forum/view-forum/2222'
);

INSERT INTO source_snapshot (
  id, source_id, snapshot_kind, external_id, source_url, http_status, etag,
  content_sha256, artifact_path, content_bytes, valid, retrieved_at
) VALUES (
  7, 'ggg_poe2_patch_notes', 'thread', '3991000',
  'https://www.pathofexile.com/forum/view-thread/3991000/filter-account-type/staff',
  200, 'legacy-etag',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'source-snapshots/ggg-patch-notes/same.html.gz', 10, 1,
  '2026-08-01T00:00:00.000Z'
);

INSERT INTO source_sync_state (
  source_id, index_etag, last_checked_at, last_success_at, last_valid_index_snapshot_id
) VALUES (
  'ggg_poe2_patch_notes', 'legacy-etag', '2026-08-01T00:00:00.000Z',
  '2026-08-01T00:00:00.000Z', 7
);

INSERT INTO evidence_link (snapshot_id, entity_kind, entity_id)
VALUES (7, 'official_patch', '3991000');

INSERT INTO official_patch (
  thread_id, source_id, source_order, title, version_text, published_text,
  source_url, index_snapshot_id, body_snapshot_id, body_valid, body_text
) VALUES (
  3991000, 'ggg_poe2_patch_notes', 3991000, 'Patch 0.5.4e', '0.5.4e',
  'Aug 1, 2026',
  'https://www.pathofexile.com/forum/view-thread/3991000/filter-account-type/staff',
  7, 7, 1, 'preserved body'
);

INSERT INTO pending_patch_effect (thread_id, disposition)
VALUES (3991000, 'pending');
