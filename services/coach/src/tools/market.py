"""Read-only analytics over the application's shared live market database."""

import json
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path
from statistics import fmean
from typing import Annotated, NoReturn

from langchain_core.tools import InjectedToolArg, tool

from src.config import get_settings
from src.errors import ToolInvalidInput, ToolNoResult, ToolSourceUnavailable
from src.evidence import evidence_id
from src.tools.market_readiness import market_readiness

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
def analyze_market_history(
    items: list[str], days: int, league: Annotated[str, InjectedToolArg]
) -> str:
    """Analyze 1-5 items over 1-30 days from the application's price history.

    Values are in Divine Orbs, not executable bid/ask quotes.
    """
    names = _validated_items(items)
    if not 1 <= days <= 30:
        raise ToolInvalidInput("days must be between 1 and 30")
    try:
        with closing(_connect_read_only(get_settings().poe_db_path)) as connection:
            _require_league_data(connection, league)
            results = [_analyze_item(connection, name, days, league) for name in names]
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


def current_market_values(
    items: list[str], league: str
) -> tuple[list[dict[str, object]], str]:
    """Return latest locally polled values for validated item names in one league."""
    names = _validated_items(items)
    try:
        with closing(_connect_read_only(get_settings().poe_db_path)) as connection:
            _require_league_data(connection, league)
            results = [_current_item(connection, name, league) for name in names]
    except sqlite3.Error as error:
        _raise_market_source_error(error)
    timestamp = max(str(result["fetched_at"]) for result in results)
    return results, timestamp


def market_ready(path: Path | None = None, *, now: datetime | None = None) -> bool:
    """Validate schema and require a recent successful local market refresh cycle."""
    return market_readiness(path or get_settings().poe_db_path, now=now).ready


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


def _require_league_data(connection: sqlite3.Connection, league: str) -> None:
    """Refuse to answer from another market when the asking user's league has no data yet.

    A young league (first poll cycles after a switch) or an unpolled one has no rows. Falling
    back to whichever league was polled last would present a different economy's prices as the
    user's own, so the tool reports the gap instead.
    """
    row = connection.execute(
        """
        SELECT 1 FROM price_snapshots
        WHERE league = ? AND category = 'Currency'
        LIMIT 1
        """,
        (league,),
    ).fetchone()
    if row is None:
        raise ToolNoResult(
            f"No market data for league {league!r}",
            public_detail=(
                f"No market data has been collected for the league {league!r} yet; it is new "
                "or not polled. Say so and do not substitute prices from another league."
            ),
        )


def _analyze_item(
    connection: sqlite3.Connection, requested: str, days: int, league: str
) -> dict[str, object]:
    canonical = _resolve_name(connection, requested, league)
    rows = connection.execute(
        """
        SELECT chaos_equiv AS value_div, volume, fetched_at
        FROM price_snapshots
        WHERE item_name = ? AND category = 'Currency' AND league = ?
          AND datetime(fetched_at) >= datetime(
            (SELECT MAX(fetched_at) FROM price_snapshots
             WHERE category = 'Currency' AND league = ?), ?
          )
        ORDER BY fetched_at ASC
        """,
        (canonical, league, league, f"-{days} days"),
    ).fetchall()
    if not rows:
        raise ToolNoResult(f"No market observations found for {canonical!r} over {days} days")
    values = [float(row["value_div"]) for row in rows]
    volumes = [float(row["volume"]) for row in rows]
    change_pct = ((values[-1] / values[0]) - 1) * 100 if values[0] else 0.0
    return {
        "title": f"{canonical} market history",
        "item_name": canonical,
        # Named explicitly: history is retained per league, so "which market is this" is part of
        # the answer, not context the caller can assume.
        "league": league,
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


def _current_item(
    connection: sqlite3.Connection, requested: str, league: str
) -> dict[str, object]:
    canonical = _resolve_name(connection, requested, league)
    row = connection.execute(
        """
        SELECT item_name, league, chaos_equiv AS value_div, volume, fetched_at
        FROM price_snapshots
        WHERE item_name = ? AND category = 'Currency' AND league = ?
        ORDER BY fetched_at DESC, id DESC LIMIT 1
        """,
        (canonical, league),
    ).fetchone()
    if row is None:
        raise ToolNoResult(f"No current market value found for {canonical!r}")
    return dict(row)


def _resolve_name(connection: sqlite3.Connection, requested: str, league: str) -> str:
    # Resolved inside the league: an item that exists only in another league is unknown here,
    # not a reason to read that league's rows.
    row = connection.execute(
        """
        SELECT item_name FROM price_snapshots
        WHERE category = 'Currency' AND league = ?
          AND (lower(item_name) = lower(?) OR lower(item_name) LIKE lower(?))
        GROUP BY item_name
        ORDER BY CASE WHEN lower(item_name) = lower(?) THEN 0 ELSE 1 END, item_name
        LIMIT 1
        """,
        (league, requested, f"%{requested}%", requested),
    ).fetchone()
    if row is None:
        raise ToolNoResult(f"Unknown market item in league {league!r}: {requested!r}")
    return str(row["item_name"])


def _market_source(result: dict[str, object]) -> dict[str, object]:
    # League is part of the identity: the same item over the same window in two leagues is two
    # different observations and must not collapse onto one evidence id.
    identity = "|".join(
        str(result[key]) for key in ("item_name", "league", "days", "data_timestamp")
    )
    source_id = evidence_id("M", identity)
    result["id"] = source_id
    return {"id": source_id, "type": "market", "title": result["title"], "url": None}
