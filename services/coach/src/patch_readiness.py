"""Fail-closed recommendation readiness derived from patch provenance."""

import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.items.manifest import snapshot_identity


class PatchCoverage(BaseModel):
    """Reviewed game-data boundary committed with the active catalog."""

    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(ge=1, le=1)
    game_data_patch: str = Field(min_length=1)
    official_patch_thread_id: int = Field(gt=0)
    official_patch_published_at: datetime
    catalog_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class PatchReadiness:
    """Diagnostic patch state; it never changes core Coach availability."""

    patch_monitor_ready: bool = False
    game_data_patch: str | None = None
    latest_official_patch: str | None = None
    recommendations_ready: bool = False
    patch_checked_at: datetime | None = None
    pending_patch_reviews: int = 0


def read_patch_readiness(
    coverage_path: Path,
    manifest_path: Path,
    database_path: Path,
    max_ready_age_min: int,
    *,
    now: datetime | None = None,
) -> PatchReadiness:
    """Validate committed coverage and official patch review state without writes."""
    coverage, active_sha = _validated_coverage(coverage_path, manifest_path)
    if coverage is None or active_sha is None:
        return PatchReadiness()
    base = PatchReadiness(
        game_data_patch=coverage.game_data_patch,
        latest_official_patch=coverage.game_data_patch,
    )
    if not database_path.is_file():
        return base
    reference = _utc(now or datetime.now(UTC))
    try:
        with sqlite3.connect(f"file:{database_path.resolve()}?mode=ro", uri=True) as connection:
            checked_at = _last_valid_check(connection)
            monitor_ready = _is_recent(checked_at, reference, max_ready_age_min)
            latest = _latest_patch(connection) or coverage.game_data_patch
            pending = _pending_newer_patches(
                connection, coverage.official_patch_thread_id, active_sha
            )
    except (OSError, sqlite3.DatabaseError, ValueError):
        return base
    return PatchReadiness(
        patch_monitor_ready=monitor_ready,
        game_data_patch=coverage.game_data_patch,
        latest_official_patch=latest,
        recommendations_ready=monitor_ready and pending == 0,
        patch_checked_at=checked_at,
        pending_patch_reviews=pending,
    )


def _validated_coverage(
    coverage_path: Path, manifest_path: Path
) -> tuple[PatchCoverage | None, str | None]:
    try:
        coverage = PatchCoverage.model_validate_json(coverage_path.read_bytes())
        _, active_sha = snapshot_identity(manifest_path)
    except (OSError, RuntimeError, ValidationError, json.JSONDecodeError):
        return None, None
    if coverage.catalog_sha256 != active_sha:
        return None, active_sha
    return coverage, active_sha


def _last_valid_check(connection: sqlite3.Connection) -> datetime | None:
    row = connection.execute(
        """SELECT s.last_success_at, s.last_checked_at, s.last_error, s.consecutive_failures
        FROM source_sync_state s
        JOIN source_snapshot n ON n.id = s.last_valid_index_snapshot_id
        JOIN source_registry r ON r.source_id = s.source_id
        WHERE s.source_id = 'ggg_poe2_patch_notes'
          AND n.snapshot_kind = 'index' AND n.valid = 1
          AND s.valid_index_parser_version = r.parser_version
          AND n.parser_version = r.parser_version
          AND s.valid_index_validation_policy = n.validation_policy"""
    ).fetchone()
    if (
        row is None
        or not isinstance(row[0], str)
        or not isinstance(row[1], str)
        or row[2] is not None
        or row[3] != 0
    ):
        return None
    success = _parse_timestamp(row[0])
    checked = _parse_timestamp(row[1])
    return success if success == checked else None


def _latest_patch(connection: sqlite3.Connection) -> str | None:
    row = connection.execute(
        """SELECT version_text FROM official_patch
        WHERE source_id = 'ggg_poe2_patch_notes'
        ORDER BY source_order DESC LIMIT 1"""
    ).fetchone()
    return row[0] if row is not None and isinstance(row[0], str) else None


def _pending_newer_patches(
    connection: sqlite3.Connection, baseline_thread_id: int, active_sha: str
) -> int:
    rows = connection.execute(
        """SELECT p.body_valid, e.disposition, e.catalog_sha256
        FROM official_patch p
        LEFT JOIN pending_patch_effect e ON e.thread_id = p.thread_id
        WHERE p.source_id = 'ggg_poe2_patch_notes'
          AND (p.source_order > ? OR (p.source_order = ? AND e.thread_id IS NOT NULL))
        ORDER BY p.source_order""",
        (baseline_thread_id, baseline_thread_id),
    ).fetchall()
    return sum(not _review_is_ready(row, active_sha) for row in rows)


def _review_is_ready(row: tuple[object, ...], active_sha: str) -> bool:
    body_valid, disposition, catalog_sha = row
    if body_valid != 1:
        return False
    if disposition == "no_gameplay_impact":
        return True
    return disposition == "data_refreshed" and catalog_sha == active_sha


def _parse_timestamp(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    return _utc(parsed)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _is_recent(value: datetime | None, now: datetime, max_age_min: int) -> bool:
    if value is None or max_age_min <= 0 or value > now:
        return False
    return now - value <= timedelta(minutes=max_age_min)
