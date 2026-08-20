"""Patch provenance readiness stays fail-closed without disabling core Coach health."""

import json
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

from src.patch_readiness import read_patch_readiness

NOW = datetime(2026, 8, 1, 12, tzinfo=UTC)
BASELINE_THREAD = 3_990_574


def test_missing_state_is_not_ready(item_catalog_manifest: Path, tmp_path: Path) -> None:
    coverage, _ = _coverage(tmp_path, item_catalog_manifest)
    result = read_patch_readiness(
        coverage, item_catalog_manifest, tmp_path / "missing.db", 90, now=NOW
    )
    assert result.patch_monitor_ready is False
    assert result.recommendations_ready is False


def test_valid_recent_index_with_no_newer_patch_is_ready(
    item_catalog_manifest: Path, tmp_path: Path
) -> None:
    coverage, _ = _coverage(tmp_path, item_catalog_manifest)
    database = _database(tmp_path, NOW - timedelta(minutes=10))
    result = read_patch_readiness(coverage, item_catalog_manifest, database, 90, now=NOW)
    assert result.patch_monitor_ready is True
    assert result.recommendations_ready is True
    assert result.pending_patch_reviews == 0


def test_coverage_sha_mismatch_fails_closed(item_catalog_manifest: Path, tmp_path: Path) -> None:
    coverage, _ = _coverage(tmp_path, item_catalog_manifest, sha="0" * 64)
    database = _database(tmp_path, NOW - timedelta(minutes=10))
    result = read_patch_readiness(coverage, item_catalog_manifest, database, 90, now=NOW)
    assert result.patch_monitor_ready is False
    assert result.recommendations_ready is False


def test_pending_newer_patch_blocks_recommendations(
    item_catalog_manifest: Path, tmp_path: Path
) -> None:
    coverage, _ = _coverage(tmp_path, item_catalog_manifest)
    database = _database(tmp_path, NOW - timedelta(minutes=10), disposition="pending")
    result = read_patch_readiness(coverage, item_catalog_manifest, database, 90, now=NOW)
    assert result.latest_official_patch == "0.5.4e"
    assert result.pending_patch_reviews == 1
    assert result.recommendations_ready is False


def test_no_gameplay_impact_review_is_ready(item_catalog_manifest: Path, tmp_path: Path) -> None:
    coverage, _ = _coverage(tmp_path, item_catalog_manifest)
    database = _database(tmp_path, NOW - timedelta(minutes=10), disposition="no_gameplay_impact")
    result = read_patch_readiness(coverage, item_catalog_manifest, database, 90, now=NOW)
    assert result.pending_patch_reviews == 0
    assert result.recommendations_ready is True


def test_reviewed_patch_with_invalid_amended_body_is_not_ready(
    item_catalog_manifest: Path, tmp_path: Path
) -> None:
    coverage, _ = _coverage(tmp_path, item_catalog_manifest)
    database = _database(
        tmp_path,
        NOW - timedelta(minutes=10),
        disposition="no_gameplay_impact",
        body_valid=0,
    )
    result = read_patch_readiness(coverage, item_catalog_manifest, database, 90, now=NOW)
    assert result.pending_patch_reviews == 1
    assert result.recommendations_ready is False


def test_data_refresh_review_must_match_active_catalog(
    item_catalog_manifest: Path, tmp_path: Path
) -> None:
    coverage, active_sha = _coverage(tmp_path, item_catalog_manifest)
    database = _database(
        tmp_path,
        NOW - timedelta(minutes=10),
        disposition="data_refreshed",
        review_sha="f" * 64,
    )
    stale = read_patch_readiness(coverage, item_catalog_manifest, database, 90, now=NOW)
    assert stale.recommendations_ready is False
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE pending_patch_effect SET catalog_sha256 = ?", (active_sha,))
    ready = read_patch_readiness(coverage, item_catalog_manifest, database, 90, now=NOW)
    assert ready.recommendations_ready is True


def test_stale_index_check_blocks_recommendations(
    item_catalog_manifest: Path, tmp_path: Path
) -> None:
    coverage, _ = _coverage(tmp_path, item_catalog_manifest)
    database = _database(tmp_path, NOW - timedelta(minutes=91))
    result = read_patch_readiness(coverage, item_catalog_manifest, database, 90, now=NOW)
    assert result.patch_monitor_ready is False
    assert result.recommendations_ready is False


def test_latest_index_failure_invalidates_recent_success(
    item_catalog_manifest: Path, tmp_path: Path
) -> None:
    coverage, _ = _coverage(tmp_path, item_catalog_manifest)
    database = _database(tmp_path, NOW - timedelta(minutes=10))
    with sqlite3.connect(database) as connection:
        connection.execute(
            """UPDATE source_sync_state SET last_checked_at = ?, last_error = ?,
            consecutive_failures = 1""",
            (NOW.isoformat(), "index selector drift"),
        )
    result = read_patch_readiness(coverage, item_catalog_manifest, database, 90, now=NOW)
    assert result.patch_monitor_ready is False
    assert result.recommendations_ready is False


def test_latest_body_failure_invalidates_monitor_and_recommendations(
    item_catalog_manifest: Path, tmp_path: Path
) -> None:
    coverage, _ = _coverage(tmp_path, item_catalog_manifest)
    database = _database(tmp_path, NOW - timedelta(minutes=10), disposition="pending")
    with sqlite3.connect(database) as connection:
        connection.execute(
            """UPDATE source_sync_state SET last_checked_at = ?, last_error = ?,
            consecutive_failures = 1""",
            (NOW.isoformat(), "thread body drift"),
        )
    result = read_patch_readiness(coverage, item_catalog_manifest, database, 90, now=NOW)
    assert result.patch_monitor_ready is False
    assert result.recommendations_ready is False


def test_baseline_pending_or_invalid_amendment_blocks_recommendations(
    item_catalog_manifest: Path, tmp_path: Path
) -> None:
    coverage, _ = _coverage(tmp_path, item_catalog_manifest)
    pending = _database(
        tmp_path,
        NOW - timedelta(minutes=10),
        disposition="pending",
        patch_thread_id=BASELINE_THREAD,
    )
    result = read_patch_readiness(coverage, item_catalog_manifest, pending, 90, now=NOW)
    assert result.pending_patch_reviews == 1
    assert result.recommendations_ready is False


def _coverage(directory: Path, manifest_path: Path, *, sha: str | None = None) -> tuple[Path, str]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    active_sha = manifest["artifact_sha256"]
    path = directory / f"coverage-{len(list(directory.glob('coverage-*')))}.json"
    path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "game_data_patch": "0.5.4d",
                "official_patch_thread_id": BASELINE_THREAD,
                "official_patch_published_at": "2026-07-28T23:25:03Z",
                "catalog_sha256": sha or active_sha,
            }
        ),
        encoding="utf-8",
    )
    return path, active_sha


def _database(
    directory: Path,
    checked_at: datetime,
    *,
    disposition: str | None = None,
    review_sha: str | None = None,
    body_valid: int = 1,
    patch_thread_id: int = BASELINE_THREAD + 1,
) -> Path:
    path = directory / f"patches-{len(list(directory.glob('patches-*')))}.db"
    with sqlite3.connect(path) as connection:
        _schema(connection)
        timestamp = checked_at.isoformat()
        connection.execute("INSERT INTO source_registry VALUES ('ggg_poe2_patch_notes', '2')")
        connection.execute(
            "INSERT INTO source_snapshot VALUES (1, 'index', 1, '2', 'index:min-entries=3')"
        )
        connection.execute(
            """INSERT INTO source_sync_state VALUES (
            'ggg_poe2_patch_notes', ?, ?, 1, NULL, 0, '2', 'index:min-entries=3'
            )""",
            (timestamp, timestamp),
        )
        if disposition is not None:
            connection.execute(
                "INSERT INTO official_patch VALUES (?, 'ggg_poe2_patch_notes', ?, '0.5.4e', ?)",
                (patch_thread_id, patch_thread_id, body_valid),
            )
            connection.execute(
                "INSERT INTO pending_patch_effect VALUES (?, ?, ?)",
                (patch_thread_id, disposition, review_sha),
            )
    return path


def _schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE source_registry (source_id TEXT PRIMARY KEY, parser_version TEXT);
        CREATE TABLE source_snapshot (
          id INTEGER PRIMARY KEY,
          snapshot_kind TEXT,
          valid INTEGER,
          parser_version TEXT,
          validation_policy TEXT
        );
        CREATE TABLE source_sync_state (
          source_id TEXT PRIMARY KEY,
          last_success_at TEXT,
          last_checked_at TEXT,
          last_valid_index_snapshot_id INTEGER,
          last_error TEXT,
          consecutive_failures INTEGER,
          valid_index_parser_version TEXT,
          valid_index_validation_policy TEXT
        );
        CREATE TABLE official_patch (
          thread_id INTEGER PRIMARY KEY,
          source_id TEXT,
          source_order INTEGER,
          version_text TEXT,
          body_valid INTEGER
        );
        CREATE TABLE pending_patch_effect (
          thread_id INTEGER PRIMARY KEY,
          disposition TEXT,
          catalog_sha256 TEXT
        );
        """
    )
