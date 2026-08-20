"""Read-only analytics over the application's shared live market database."""

import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path
from statistics import fmean
from typing import NoReturn

from langchain_core.tools import tool

from src.config import get_settings
from src.errors import ToolInvalidInput, ToolNoResult, ToolSourceUnavailable
from src.evidence import evidence_id

_REQUIRED_COLUMNS = {
    "item_id",
    "item_name",
    "category",
    "chaos_equiv",
    "volume",
    "fetched_at",
}
_HEARTBEAT_COLUMNS = {"item_id", "updated_at"}
_READINESS_MAX_AGE = timedelta(minutes=30)
_UNAVAILABLE_SQLITE_CODES = {
    sqlite3.SQLITE_BUSY,
    sqlite3.SQLITE_LOCKED,
    sqlite3.SQLITE_CANTOPEN,
    sqlite3.SQLITE_IOERR,
    sqlite3.SQLITE_CORRUPT,
    sqlite3.SQLITE_NOTADB,
    sqlite3.SQLITE_READONLY,
}


@tool
def analyze_market_history(items: list[str], days: int) -> str:
    """Analyze 1-5 items over 1-30 days from the application's price history.

    Values are in Divine Orbs, not executable bid/ask quotes.
    """
    names = _validated_items(items)
    if not 1 <= days <= 30:
        raise ToolInvalidInput("days must be between 1 and 30")
    try:
        with closing(_connect_read_only(get_settings().poe_db_path)) as connection:
            results = [_analyze_item(connection, name, days) for name in names]
    except sqlite3.Error as error:
        _raise_market_source_error(error)
    sources = [_market_source(result) for result in results]
    return json.dumps(
        {
            "unit": "Divine Orb",
            "observation_kind": "historical_observation",
            "executable": False,
            "items": results,
            "sources": sources,
        }
    )


def current_market_values(items: list[str]) -> tuple[list[dict[str, object]], str]:
    """Return latest locally polled values for validated item names."""
    names = _validated_items(items)
    try:
        with closing(_connect_read_only(get_settings().poe_db_path)) as connection:
            results = [_current_item(connection, name) for name in names]
    except sqlite3.Error as error:
        _raise_market_source_error(error)
    timestamp = max(str(result["fetched_at"]) for result in results)
    return results, timestamp


def market_ready(path: Path | None = None, *, now: datetime | None = None) -> bool:
    """Validate schema and require a recent successful local market refresh cycle."""
    target = path or get_settings().poe_db_path
    if not target.is_file():
        return False
    try:
        with closing(_connect_read_only(target)) as connection:
            columns = {
                str(row["name"])
                for row in connection.execute("PRAGMA table_info(price_snapshots)").fetchall()
            }
            if not columns >= _REQUIRED_COLUMNS:
                return False
            heartbeat_columns = {
                str(row["name"])
                for row in connection.execute("PRAGMA table_info(item_spark)").fetchall()
            }
            if not heartbeat_columns >= _HEARTBEAT_COLUMNS:
                return False
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
                    WHERE snapshot.item_id = spark.item_id
                    ORDER BY snapshot.fetched_at DESC
                    LIMIT 1
                ), 0) = 1"""
            ).fetchone()
            return (
                heartbeat is not None
                and heartbeat["updated_at"] is not None
                and _is_fresh(str(heartbeat["updated_at"]), now or datetime.now(UTC))
            )
    except (sqlite3.Error, TypeError, ValueError):
        return False


def _is_fresh(timestamp: str, now: datetime) -> bool:
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    current = now if now.tzinfo is not None else now.replace(tzinfo=UTC)
    age = current.astimezone(UTC) - parsed.astimezone(UTC)
    return timedelta(0) <= age <= _READINESS_MAX_AGE


def _connect_read_only(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise FileNotFoundError(f"Application database does not exist: {path}")
    connection = sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    return connection


def _validated_items(items: list[str]) -> list[str]:
    cleaned = [item.strip() for item in items if item.strip()]
    if not 1 <= len(cleaned) <= 5:
        raise ToolInvalidInput("items must contain between 1 and 5 non-empty names")
    return cleaned


def _raise_market_source_error(error: sqlite3.Error) -> NoReturn:
    code = getattr(error, "sqlite_errorcode", None)
    if isinstance(code, int):
        if code & 0xFF in _UNAVAILABLE_SQLITE_CODES:
            raise ToolSourceUnavailable("Market database is temporarily unavailable") from error
        raise error
    unavailable = (
        "unable to open database",
        "database is locked",
        "database table is locked",
        "database is busy",
        "disk i/o error",
        "database disk image is malformed",
        "file is not a database",
        "readonly database",
    )
    if any(marker in str(error).casefold() for marker in unavailable):
        raise ToolSourceUnavailable("Market database is temporarily unavailable") from error
    raise error


def _analyze_item(connection: sqlite3.Connection, requested: str, days: int) -> dict[str, object]:
    canonical = _resolve_name(connection, requested)
    rows = connection.execute(
        """
        SELECT chaos_equiv AS value_div, volume, fetched_at
        FROM price_snapshots
        WHERE item_name = ? AND category = 'Currency'
          AND datetime(fetched_at) >= datetime(
            (SELECT MAX(fetched_at) FROM price_snapshots WHERE category = 'Currency'), ?
          )
        ORDER BY fetched_at ASC
        """,
        (canonical, f"-{days} days"),
    ).fetchall()
    if not rows:
        raise ToolNoResult(f"No market observations found for {canonical!r} over {days} days")
    values = [float(row["value_div"]) for row in rows]
    volumes = [float(row["volume"]) for row in rows]
    change_pct = ((values[-1] / values[0]) - 1) * 100 if values[0] else 0.0
    return {
        "title": f"{canonical} market history",
        "item_name": canonical,
        "days": days,
        "start_value_div": round(values[0], 8),
        "latest_value_div": round(values[-1], 8),
        "min_value_div": round(min(values), 8),
        "max_value_div": round(max(values), 8),
        "average_value_div": round(fmean(values), 8),
        "change_pct": round(change_pct, 2),
        "average_volume": round(fmean(volumes), 2),
        "sample_count": len(rows),
        "data_timestamp": rows[-1]["fetched_at"],
    }


def _current_item(connection: sqlite3.Connection, requested: str) -> dict[str, object]:
    canonical = _resolve_name(connection, requested)
    row = connection.execute(
        """
        SELECT item_name, chaos_equiv AS value_div, volume, fetched_at
        FROM price_snapshots
        WHERE item_name = ? AND category = 'Currency'
        ORDER BY id DESC LIMIT 1
        """,
        (canonical,),
    ).fetchone()
    if row is None:
        raise ToolNoResult(f"No current market value found for {canonical!r}")
    return dict(row)


def _resolve_name(connection: sqlite3.Connection, requested: str) -> str:
    row = connection.execute(
        """
        SELECT item_name FROM price_snapshots
        WHERE category = 'Currency'
          AND (lower(item_name) = lower(?) OR lower(item_name) LIKE lower(?))
        GROUP BY item_name
        ORDER BY CASE WHEN lower(item_name) = lower(?) THEN 0 ELSE 1 END, item_name
        LIMIT 1
        """,
        (requested, f"%{requested}%", requested),
    ).fetchone()
    if row is None:
        raise ToolNoResult(f"Unknown market item: {requested!r}")
    return str(row["item_name"])


def _market_source(result: dict[str, object]) -> dict[str, object]:
    identity = f"{result['item_name']}|{result['days']}|{result['data_timestamp']}"
    source_id = evidence_id("M", identity)
    result["id"] = source_id
    return {"id": source_id, "type": "market", "title": result["title"], "url": None}
