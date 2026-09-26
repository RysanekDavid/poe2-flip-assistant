"""Product market-tool tests against the application database shape."""

import json
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from langchain_core.messages import AIMessage

from src.errors import ToolNoResult
from src.tool_execution import tool_node
from src.tools import market
from src.tools.ninja import fetch_live_prices


def test_history_and_current_values_use_shared_database(
    market_db: Path, market_league: str, monkeypatch: Any
) -> None:
    monkeypatch.setattr(market, "get_settings", lambda: SimpleNamespace(poe_db_path=market_db))

    history = json.loads(
        market.analyze_market_history.invoke(
            {"items": ["Chaos Orb"], "days": 7, "league": market_league}
        )
    )
    current = json.loads(
        fetch_live_prices.invoke({"items": ["Chaos Orb"], "league": market_league})
    )

    assert history["items"][0]["start_value_div"] == 0.01
    assert history["items"][0]["latest_value_div"] == 0.02
    assert history["observation_kind"] == "historical_observation"
    assert history["executable"] is False
    assert current["items"][0]["value_div"] == 0.02
    assert current["observation_kind"] == "locally_polled_reference_mid"
    assert current["executable"] is False
    assert current["items"][0]["fetched_at"] == history["items"][0]["data_timestamp"]
    assert market.market_ready(market_db)


def test_market_readiness_accepts_fresh_poll_with_unchanged_prices(
    market_db: Path,
) -> None:
    stale = datetime.now(UTC) - timedelta(hours=1)
    with sqlite3.connect(market_db) as connection:
        connection.execute("UPDATE price_snapshots SET fetched_at = ?", (stale.isoformat(),))

    assert market.market_ready(market_db) is True


def test_market_readiness_ignores_zero_value_row_with_tied_heartbeat(
    market_db: Path, market_league: str,
) -> None:
    latest = datetime.now(UTC).replace(microsecond=0).isoformat()
    with sqlite3.connect(market_db) as connection:
        connection.execute(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (4, market_league, "zero", "Zero Value", "Currency", 0, 1, latest),
        )
        connection.execute(
            "INSERT INTO item_spark VALUES (?, ?, ?)", (market_league, "zero", latest)
        )

    assert market.market_ready(market_db) is True


def test_market_readiness_does_not_use_non_currency_heartbeat(
    market_db: Path, market_league: str,
) -> None:
    latest = datetime.now(UTC).replace(microsecond=0)
    stale = latest - timedelta(hours=1)
    with sqlite3.connect(market_db) as connection:
        connection.execute(
            "UPDATE item_spark SET updated_at = ?", (stale.isoformat(),)
        )
        connection.execute(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (4, market_league, "other", "Other Item", "Omen", 1, 1, latest.isoformat()),
        )
        connection.execute(
            "INSERT INTO item_spark VALUES (?, ?, ?)",
            (market_league, "other", latest.isoformat()),
        )

    assert market.market_ready(market_db) is False


def test_market_readiness_rejects_latest_zero_currency_value(
    market_db: Path, market_league: str,
) -> None:
    latest = datetime.now(UTC).replace(microsecond=0)
    stale = latest - timedelta(hours=1)
    with sqlite3.connect(market_db) as connection:
        connection.execute("DELETE FROM price_snapshots")
        connection.execute("DELETE FROM item_spark")
        connection.executemany(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (1, market_league, "currency", "Currency", "Currency", 1, 1, stale.isoformat()),
                (2, market_league, "currency", "Currency", "Currency", 0, 1, latest.isoformat()),
            ],
        )
        connection.execute(
            "INSERT INTO item_spark VALUES (?, ?, ?)",
            (market_league, "currency", latest.isoformat()),
        )

    assert market.market_ready(market_db) is False


def test_market_readiness_rejects_stale_poll_heartbeat(market_db: Path) -> None:
    stale = datetime.now(UTC) - timedelta(hours=1)
    with sqlite3.connect(market_db) as connection:
        connection.execute("UPDATE item_spark SET updated_at = ?", (stale.isoformat(),))

    assert market.market_ready(market_db) is False


def test_market_readiness_correlates_heartbeat_within_one_league(market_db: Path) -> None:
    """A fresh league must not be judged ready by another league's price rows, or vice versa.

    Setup: league A (the fixture) goes stale, a brand-new league B gets a fresh price row and a
    fresh spark row. Readiness stays league-agnostic, so B alone makes the market ready. If the
    correlated subquery dropped `snapshot.league = spark.league` it would pair B's spark with
    A's same-named price row, whose zero/absent state would silently decide the gate.
    """
    latest = datetime.now(UTC).replace(microsecond=0)
    stale = latest - timedelta(hours=1)
    with sqlite3.connect(market_db) as connection:
        connection.execute("UPDATE item_spark SET updated_at = ?", (stale.isoformat(),))
        connection.execute(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (10, "New League", "chaos", "Chaos Orb", "Currency", 0.05, 5, latest.isoformat()),
        )
        connection.execute(
            "INSERT INTO item_spark VALUES (?, ?, ?)",
            ("New League", "chaos", latest.isoformat()),
        )

    assert market.market_ready(market_db) is True


def test_market_readiness_ignores_other_leagues_price_for_a_fresh_spark(
    market_db: Path,
) -> None:
    """A fresh spark in a league with no PRICED currency row must not ride on another league's.

    League B has a fresh spark but its only price row is a zero-value currency, which the
    readiness rule rejects. League A still holds a healthy priced row under the SAME item_id —
    an uncorrelated subquery would pick it up and wrongly report ready.
    """
    latest = datetime.now(UTC).replace(microsecond=0)
    stale = latest - timedelta(hours=1)
    with sqlite3.connect(market_db) as connection:
        connection.execute("UPDATE item_spark SET updated_at = ?", (stale.isoformat(),))
        connection.execute(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (10, "New League", "chaos", "Chaos Orb", "Currency", 0, 5, latest.isoformat()),
        )
        connection.execute(
            "INSERT INTO item_spark VALUES (?, ?, ?)",
            ("New League", "chaos", latest.isoformat()),
        )

    assert market.market_ready(market_db) is False


def test_history_does_not_blend_two_leagues(
    market_db: Path, market_league: str, monkeypatch: Any
) -> None:
    """A retained previous league must not be spliced onto the live league's series.

    Market history is no longer purged on a league switch, so both markets sit in the table.
    They price the same orb very differently; splicing them reports a change that never
    happened. Here the old league's Chaos Orb sits at 0.01/0.02 Div and the live league's at
    0.9 — blending yields a fabricated multi-thousand-percent move.
    """
    monkeypatch.setattr(market, "get_settings", lambda: SimpleNamespace(poe_db_path=market_db))
    _add_live_league(market_db, market_league)

    history = json.loads(
        market.analyze_market_history.invoke(
            {"items": ["Chaos Orb"], "days": 30, "league": _LIVE}
        )
    )["items"][0]

    assert history["sample_count"] == 2, "only the live league's observations belong in the series"
    assert history["league"] == _LIVE
    assert history["start_value_div"] == 0.8
    assert history["latest_value_div"] == 0.9
    assert history["change_pct"] == 12.5

    current = json.loads(fetch_live_prices.invoke({"items": ["Chaos Orb"], "league": _LIVE}))
    assert current["items"][0]["value_div"] == 0.9


def test_request_league_never_reads_another_leagues_rows(
    market_db: Path, market_league: str, monkeypatch: Any
) -> None:
    """The asking user's league scopes every query, even when another league is newer.

    The retired `_latest_league` anchor answered with whichever league was polled last; a user
    viewing the older league then got the other economy's prices.
    """
    monkeypatch.setattr(market, "get_settings", lambda: SimpleNamespace(poe_db_path=market_db))
    _add_live_league(market_db, market_league)

    old_history = json.loads(
        market.analyze_market_history.invoke(
            {"items": ["Chaos Orb"], "days": 30, "league": market_league}
        )
    )["items"][0]
    old_current = json.loads(
        fetch_live_prices.invoke({"items": ["Chaos Orb"], "league": market_league})
    )["items"][0]
    live_current = json.loads(
        fetch_live_prices.invoke({"items": ["Chaos Orb"], "league": _LIVE})
    )["items"][0]

    assert old_history["league"] == market_league
    assert (old_history["start_value_div"], old_history["latest_value_div"]) == (0.01, 0.02)
    assert old_current["league"] == market_league
    assert old_current["value_div"] == 0.02
    assert live_current["league"] == _LIVE
    assert live_current["value_div"] == 0.9


def test_item_known_only_in_another_league_is_not_resolved(
    market_db: Path, market_league: str, monkeypatch: Any
) -> None:
    monkeypatch.setattr(market, "get_settings", lambda: SimpleNamespace(poe_db_path=market_db))
    _add_live_league(market_db, market_league)
    with sqlite3.connect(market_db) as connection:
        connection.execute(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (30, _LIVE, "ex", "Exalted Orb", "Currency", 0.002, 5, _now().isoformat()),
        )

    with pytest.raises(ToolNoResult, match="Unknown market item"):
        fetch_live_prices.invoke({"items": ["Exalted Orb"], "league": market_league})


def test_young_league_without_rows_is_a_clear_no_result(
    market_db: Path, monkeypatch: Any
) -> None:
    monkeypatch.setattr(market, "get_settings", lambda: SimpleNamespace(poe_db_path=market_db))

    with pytest.raises(ToolNoResult) as raised:
        market.analyze_market_history.invoke(
            {"items": ["Chaos Orb"], "days": 7, "league": "Brand New League"}
        )

    detail = raised.value.public_detail
    assert detail is not None
    assert "Brand New League" in detail
    assert "another league" in detail


@pytest.mark.asyncio
async def test_tool_node_injects_request_league_the_model_cannot_override(
    market_db: Path, market_league: str, monkeypatch: Any
) -> None:
    """The league comes from request state; a model-supplied league argument is discarded."""
    monkeypatch.setattr(market, "get_settings", lambda: SimpleNamespace(poe_db_path=market_db))
    _add_live_league(market_db, market_league)
    call = {
        "name": "fetch_live_prices",
        "args": {"items": ["Chaos Orb"], "league": _LIVE},
        "id": "call-live",
        "type": "tool_call",
    }
    state = {
        "messages": [AIMessage(content="", tool_calls=[call])],
        "request_id": "test-request",
        "league": market_league,
    }

    result = await tool_node([fetch_live_prices])(state)
    payload = json.loads(str(result["messages"][0].content))

    assert payload["items"][0]["league"] == market_league
    assert payload["items"][0]["value_div"] == 0.02
    assert "league" not in fetch_live_prices.tool_call_schema.model_fields


@pytest.mark.asyncio
async def test_tool_node_surfaces_the_empty_league_detail_to_the_model(
    market_db: Path, monkeypatch: Any
) -> None:
    monkeypatch.setattr(market, "get_settings", lambda: SimpleNamespace(poe_db_path=market_db))
    call = {
        "name": "fetch_live_prices",
        "args": {"items": ["Chaos Orb"]},
        "id": "call-empty",
        "type": "tool_call",
    }
    state = {
        "messages": [AIMessage(content="", tool_calls=[call])],
        "request_id": "test-request",
        "league": "Brand New League",
    }

    result = await tool_node([fetch_live_prices])(state)
    error = json.loads(str(result["messages"][0].content))["error"]

    assert error["code"] == "tool_no_result"
    assert "Brand New League" in error["detail"]


@pytest.mark.asyncio
async def test_tool_node_without_request_league_fails_loudly() -> None:
    call = {
        "name": "fetch_live_prices",
        "args": {"items": ["Chaos Orb"]},
        "id": "call-missing",
        "type": "tool_call",
    }
    state = {"messages": [AIMessage(content="", tool_calls=[call])], "request_id": "r"}

    with pytest.raises(RuntimeError, match="needs request context"):
        await tool_node([fetch_live_prices])(state)


_LIVE = "Live League"


def _now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def _add_live_league(market_db: Path, old_league: str) -> None:
    """Age the fixture league and add a NEWER live league pricing Chaos Orb ~45x higher."""
    now = _now()
    with sqlite3.connect(market_db) as connection:
        connection.execute(
            "UPDATE price_snapshots SET fetched_at = ? WHERE league = ? AND id = 1",
            ((now - timedelta(days=4)).isoformat(), old_league),
        )
        connection.execute(
            "UPDATE price_snapshots SET fetched_at = ? WHERE league = ? AND id <> 1",
            ((now - timedelta(days=3)).isoformat(), old_league),
        )
        connection.executemany(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (20, _LIVE, "chaos", "Chaos Orb", "Currency", 0.8, 900, (
                    now - timedelta(hours=1)
                ).isoformat()),
                (21, _LIVE, "chaos", "Chaos Orb", "Currency", 0.9, 900, now.isoformat()),
            ],
        )
