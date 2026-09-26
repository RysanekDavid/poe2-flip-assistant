"""Market-database readiness, split into a structural check and a freshness check."""

import sqlite3
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

_REQUIRED_COLUMNS = {
    "league",
    "item_id",
    "item_name",
    "category",
    "chaos_equiv",
    "volume",
    "fetched_at",
}
_HEARTBEAT_COLUMNS = {"league", "item_id", "updated_at"}
# Pinned with INDEXED BY in the heartbeat query and in the tools' access pattern.
_SNAPSHOT_INDEX = "idx_snapshots_item_time"
_READINESS_MAX_AGE = timedelta(minutes=30)


@dataclass(frozen=True)
class MarketReadiness:
    """`schema_ready`: the tools can query at all. `fresh`: a poll cycle succeeded recently.

    They fail for different reasons and deserve different responses: a wrong POE_DB_PATH or
    missing migration breaks every market answer (a release defect), while a stale heartbeat
    means poe.ninja or the poller is struggling (an operational condition).
    """

    schema_ready: bool
    fresh: bool

    @property
    def ready(self) -> bool:
        """Both conditions; the historical single `market_ready` flag."""
        return self.schema_ready and self.fresh


def market_readiness(path: Path, *, now: datetime | None = None) -> MarketReadiness:
    """Inspect the shared market database without writing to it."""
    if not path.is_file():
        return MarketReadiness(schema_ready=False, fresh=False)
    try:
        with closing(_connect_read_only(path)) as connection:
            if not _schema_ready(connection):
                return MarketReadiness(schema_ready=False, fresh=False)
            fresh = _heartbeat_is_fresh(connection, now or datetime.now(UTC))
    except (sqlite3.Error, TypeError, ValueError):
        return MarketReadiness(schema_ready=False, fresh=False)
    return MarketReadiness(schema_ready=True, fresh=fresh)


def _schema_ready(connection: sqlite3.Connection) -> bool:
    columns = _columns(connection, "price_snapshots")
    heartbeat_columns = _columns(connection, "item_spark")
    index = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?", (_SNAPSHOT_INDEX,)
    ).fetchone()
    return columns >= _REQUIRED_COLUMNS and heartbeat_columns >= _HEARTBEAT_COLUMNS and bool(index)


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {
        str(row["name"]) for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
    }


def _heartbeat_is_fresh(connection: sqlite3.Connection, now: datetime) -> bool:
    # Market data is league-scoped, so the correlated lookup joins on league as well as item_id:
    # without it a spark row from the live league would be paired with a price row from a
    # retired one, and readiness would be decided by a dead market.
    #
    # The check itself stays league-AGNOSTIC on purpose. It answers "did a poll cycle recently
    # succeed", which is a deploy gate, not a per-request scope — pinning it to one league would
    # make the gate flap during a league switch. The tools themselves are filtered to the asking
    # user's league.
    heartbeat = connection.execute(
        """SELECT MAX(datetime(spark.updated_at)) AS updated_at
        FROM item_spark AS spark
        WHERE COALESCE((
            SELECT CASE
                WHEN snapshot.category = 'Currency'
                     AND snapshot.chaos_equiv > 0 THEN 1
                ELSE 0
            END
            FROM price_snapshots AS snapshot
            INDEXED BY idx_snapshots_item_time
            WHERE snapshot.league = spark.league
              AND snapshot.item_id = spark.item_id
            ORDER BY snapshot.fetched_at DESC
            LIMIT 1
        ), 0) = 1"""
    ).fetchone()
    if heartbeat is None or heartbeat["updated_at"] is None:
        return False
    return _is_fresh(str(heartbeat["updated_at"]), now)


def _is_fresh(timestamp: str, now: datetime) -> bool:
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    current = now if now.tzinfo is not None else now.replace(tzinfo=UTC)
    age = current.astimezone(UTC) - parsed.astimezone(UTC)
    return timedelta(0) <= age <= _READINESS_MAX_AGE


def _connect_read_only(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    return connection
