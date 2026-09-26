"""Top Flips: the exchange edges the app's rank gate published for the asking user's league.

Source of truth is `cx_edge_outcomes` (written by src/core/cx/cxOutcomes.ts): every edge that
passed the rank gate at a league's newest digest hour, with the gate's own numbers stored beside
it. Nothing here re-derives an edge; the TS exchange model stays the only implementation.
"""

import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool

from src.config import get_settings
from src.errors import ToolNoResult
from src.tools.engine_common import (
    engine_source,
    fit_payload,
    parse_utc,
    sig,
    utc_iso,
    validated_limit,
)
from src.tools.sqlite_source import connect_read_only, raise_source_error

#: Mirrors CX_MAX_AGE_MS in src/core/cx/cxItemMarkets.ts: past this the newest stored digest hour
#: no longer stands for "the market now", and the app stops showing exchange edges.
_CX_MAX_AGE_SECONDS = 3 * 60 * 60
#: The poller stores every league's new digest hour in cx_ingest BEFORE it publishes that hour's
#: ranked edges (src/scheduler/marketCycle.ts). Inside this window an empty newest hour means
#: "not published yet", not "nothing ranks", so the previous published hour answers instead.
_PUBLISH_GRACE_SECONDS = 120
#: Mirrors PERSISTENCE_WINDOW_DAYS in src/core/cx/cxOutcomes.ts.
_PERSISTENCE_WINDOW_DAYS = 7
#: Added to cx_edge_outcomes after the table shipped; older rows (and a DB whose web process has
#: not migrated yet) have none, so each is read only if present.
_DETAIL_COLUMNS = (
    "persistence6",
    "slower_div_per_hour",
    "net_div_per_unit",
    "buy_price",
    "sell_price",
    "fee_complete",
)
_GATE = (
    "published only when the edge held on at least 4 of the last 6 digest hours and the slower "
    "leg moved at least the app's liquidity floor (default 100 Div/h)"
)
_CAVEAT = (
    "Hourly exchange digest statistics, not a live order book: verify the ratios in-game "
    "before placing orders."
)


@tool
def get_top_flips(limit: int, league: Annotated[str, InjectedToolArg]) -> str:
    """Return up to `limit` (1-10) currency-exchange flips the app currently ranks for the user.

    Each flip is an edge that passed the app's rank gate on GGG's hourly exchange digest: buy leg,
    sell leg, 6h median net edge %, hours held of 6, slower-leg Div/hour and the 7-day share of
    ranked edges that still held one hour later. Use it for "what should I flip right now".
    """
    count = validated_limit(limit, 10)
    now = datetime.now(UTC)
    try:
        with closing(connect_read_only(get_settings().poe_db_path)) as connection:
            hour, processing = _published_hour(connection, league, now)
            rows = _ranked_rows(connection, league, hour)
            persisted = _persisted_next_hour(connection, league, now)
            mids = _ninja_mids(connection, league, [_name(row) for row in rows[:count]])
    except sqlite3.Error as error:
        raise_source_error(error)
    source = engine_source(
        f"flips|{league}|{hour}",
        f"Ranked exchange edges, {league}, digest to {utc_iso(hour)}",
    )
    payload: dict[str, object] = {
        "league": league,
        "observation_kind": "hourly_exchange_digest",
        "executable": False,
        "digest_hour_end_utc": utc_iso(hour),
        "rank_gate": _GATE,
        "order": "edge_pct descending, not the Top Flips tab's score (which adds liquidity and "
        "oscillation)",
        "verify_in_game": True,
        "caveat": _CAVEAT,
        "ranked_total": len(rows),
        "persisted_next_hour_7d": persisted,
        "flips": [_flip(row, mids) for row in rows[:count]],
        "evidence_id": source["id"],
        "sources": [source],
    }
    if processing:
        payload["newest_digest_hour"] = "still being processed; showing the previous hour"
    return fit_payload(payload, "flips")


def _published_hour(connection: sqlite3.Connection, league: str, now: datetime) -> tuple[int, bool]:
    """The digest hour to answer from, and whether the newest one is still being published."""
    row = connection.execute(
        "SELECT hour, ingested_at FROM cx_ingest WHERE league = ? ORDER BY hour DESC LIMIT 1",
        (league,),
    ).fetchone()
    if row is None:
        raise ToolNoResult(
            f"No exchange history for league {league!r}",
            public_detail=(
                f"No currency-exchange history has been collected for the league {league!r} "
                "yet, so there are no ranked flips. Say so; do not use another league."
            ),
        )
    hour = int(row["hour"])
    _require_fresh(hour, now)
    published = connection.execute(
        "SELECT 1 FROM cx_edge_outcomes WHERE league = ? AND hour = ? LIMIT 1", (league, hour)
    ).fetchone()
    just_ingested = (now - parse_utc(str(row["ingested_at"]))).total_seconds() < (
        _PUBLISH_GRACE_SECONDS
    )
    if published is not None or not just_ingested:
        return hour, False
    previous = connection.execute(
        "SELECT MAX(hour) AS hour FROM cx_ingest WHERE league = ? AND hour < ?", (league, hour)
    ).fetchone()
    if previous is None or previous["hour"] is None:
        return hour, False
    earlier = int(previous["hour"])
    if now.timestamp() - earlier > _CX_MAX_AGE_SECONDS:
        return hour, False
    return earlier, True


def _require_fresh(hour: int, now: datetime) -> None:
    if now.timestamp() - hour > _CX_MAX_AGE_SECONDS:
        raise ToolNoResult(
            f"Exchange history is stale at {hour}",
            public_detail=(
                f"The newest usable exchange digest hour ends {utc_iso(hour)}, older than 3 "
                "hours, so the app shows no current flips. Say the exchange feed is behind."
            ),
        )


def _ranked_rows(connection: sqlite3.Connection, league: str, hour: int) -> list[sqlite3.Row]:
    present = {
        str(column["name"])
        for column in connection.execute("PRAGMA table_info(cx_edge_outcomes)").fetchall()
    }
    # Column names come from the fixed tuple above, never from input.
    detail = ", ".join(
        f"o.{name} AS {name}" if name in present else f"NULL AS {name}" for name in _DETAIL_COLUMNS
    )
    rows = connection.execute(
        f"""
        SELECT o.item, o.buy_quote, o.sell_quote, o.edge_pct, {detail},
               item.name AS item_name, buy.name AS buy_name, sell.name AS sell_name
        FROM cx_edge_outcomes AS o
        LEFT JOIN cx_items AS item ON item.base_id = o.item
        LEFT JOIN cx_items AS buy ON buy.base_id = o.buy_quote
        LEFT JOIN cx_items AS sell ON sell.base_id = o.sell_quote
        WHERE o.league = ? AND o.hour = ?
        ORDER BY o.edge_pct DESC, slower_div_per_hour DESC, o.item
        """,
        (league, hour),
    ).fetchall()
    if not rows:
        raise ToolNoResult(
            f"No ranked exchange edge for {league!r} at {hour}",
            public_detail=(
                f"No exchange edge currently passes the app's rank gate in {league!r} "
                f"(held 4 of the last 6 hours plus the slower-leg liquidity floor, default "
                f"100 Div/h) for the digest hour ending {utc_iso(hour)}. Say there is no "
                "ranked flip right now instead of suggesting one."
            ),
        )
    return rows


def _persisted_next_hour(
    connection: sqlite3.Connection, league: str, now: datetime
) -> dict[str, object]:
    from_hour = int(now.timestamp()) - _PERSISTENCE_WINDOW_DAYS * 24 * 3600
    row = connection.execute(
        """
        SELECT COALESCE(SUM(outcome = 'hit'), 0) AS held, COUNT(outcome) AS checked
        FROM cx_edge_outcomes WHERE league = ? AND hour >= ?
        """,
        (league, from_hour),
    ).fetchone()
    held, checked = int(row["held"]), int(row["checked"])
    return {
        "held": held,
        "checked": checked,
        "rate_pct": round(held / checked * 100, 1) if checked else None,
        "meaning": "ranked edges still clearing the threshold one digest hour later; not fills",
    }


def _ninja_mids(connection: sqlite3.Connection, league: str, names: list[str]) -> dict[str, float]:
    """Latest poe.ninja reference mid per exact name; a name on two ninja lines is left out."""
    if not names:
        return {}
    placeholders = ", ".join("?" for _ in names)
    rows = connection.execute(
        f"""
        SELECT s.item_name, s.chaos_equiv AS value_div
        FROM price_snapshots AS s
        JOIN (SELECT item_id, MAX(id) AS mx FROM price_snapshots WHERE league = ?
              GROUP BY item_id) AS latest ON latest.mx = s.id
        WHERE s.item_name IN ({placeholders})
        """,
        (league, *names),
    ).fetchall()
    seen: dict[str, list[float]] = {}
    for row in rows:
        seen.setdefault(str(row["item_name"]), []).append(float(row["value_div"]))
    return {name: values[0] for name, values in seen.items() if len(values) == 1}


def _name(row: sqlite3.Row) -> str:
    return str(row["item_name"] or row["item"])


def _flip(row: sqlite3.Row, mids: dict[str, float]) -> dict[str, object]:
    name = _name(row)
    fee_complete = row["fee_complete"]
    flip: dict[str, object] = {
        "item": name,
        # judgePair: the same quote on both legs is the in-market band edge.
        "kind": "band" if row["buy_quote"] == row["sell_quote"] else "cross",
        "buy_in": str(row["buy_name"] or row["buy_quote"]),
        "buy_price": sig(row["buy_price"]),
        "sell_in": str(row["sell_name"] or row["sell_quote"]),
        "sell_price": sig(row["sell_price"]),
        "edge_pct": round(float(row["edge_pct"]), 1),
        "held_6h": row["persistence6"],
        "slower_leg_div_per_hour": sig(row["slower_div_per_hour"], 3),
        "net_div_per_unit": sig(row["net_div_per_unit"], 3),
        "fee_complete": None if fee_complete is None else bool(fee_complete),
        "ninja_mid_div": sig(mids.get(name)),
    }
    if row["persistence6"] is None:
        flip["detail_missing"] = "published before gate detail was recorded"
    return flip
