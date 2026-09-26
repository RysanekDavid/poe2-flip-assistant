"""get_top_flips reads the app's published exchange edges for the asking league only."""

import json
from pathlib import Path
from typing import Any

import pytest
from engine_fixtures import (
    OTHER_LEAGUE,
    add_edge,
    add_ingest,
    create_cx_tables,
    current_hour,
    detail,
    settings_for,
)
from langchain_core.messages import AIMessage

from src.errors import ToolNoResult
from src.tool_execution import tool_node
from src.tools import flips
from src.tools.engine_common import PAYLOAD_CAP_BYTES


@pytest.fixture
def cx_db(market_db: Path, monkeypatch: Any) -> Path:
    create_cx_tables(market_db)
    monkeypatch.setattr(flips, "get_settings", lambda: settings_for(market_db))
    return market_db


def _invoke(league: str, limit: int = 5) -> dict[str, Any]:
    return json.loads(flips.get_top_flips.invoke({"limit": limit, "league": league}))


def test_returns_newest_hour_ranked_edges_for_the_league_only(
    cx_db: Path, market_league: str
) -> None:
    hour = current_hour()
    for league in (market_league, OTHER_LEAGUE):
        add_ingest(cx_db, league, hour)
        add_ingest(cx_db, league, hour - 3600)
    add_edge(cx_db, market_league, hour, "Metadata/Sim", 8.2, **detail(6, 900.0))
    add_edge(
        cx_db, market_league, hour, "Metadata/Rune", 12.5,
        buy_quote="Metadata/Ex", sell_quote="Metadata/Ex", **detail(4, 150.0),
    )
    # Older hour and another league must not leak into "now".
    add_edge(cx_db, market_league, hour - 3600, "Metadata/Omen", 30.0, outcome="hit")
    add_edge(cx_db, market_league, hour - 7200, "Metadata/Omen", 25.0, outcome="miss")
    add_edge(cx_db, OTHER_LEAGUE, hour, "Metadata/Omen", 40.0, **detail())

    result = _invoke(market_league)

    assert result["league"] == market_league
    assert result["ranked_total"] == 2
    assert [flip["item"] for flip in result["flips"]] == [
        "Greater Rune of Alacrity",
        "Simulacrum",
    ]
    band, cross = result["flips"]
    assert band["kind"] == "band" and band["buy_in"] == band["sell_in"] == "Exalted Orb"
    assert cross["kind"] == "cross"
    assert (cross["buy_in"], cross["sell_in"]) == ("Divine Orb", "Exalted Orb")
    assert cross["held_6h"] == 6 and cross["slower_leg_div_per_hour"] == 900.0
    assert cross["fee_complete"] is True
    assert result["persisted_next_hour_7d"]["held"] == 1
    assert result["persisted_next_hour_7d"]["checked"] == 2
    assert result["persisted_next_hour_7d"]["rate_pct"] == 50.0
    assert result["verify_in_game"] is True and result["executable"] is False
    assert result["sources"][0]["id"] == result["evidence_id"]
    assert result["evidence_id"].startswith("M")


def test_ninja_context_joins_the_latest_snapshot_by_exact_name(
    cx_db: Path, market_league: str
) -> None:
    hour = current_hour()
    add_ingest(cx_db, market_league, hour)
    add_edge(cx_db, market_league, hour, "Metadata/Chaos", 6.0, **detail())

    result = _invoke(market_league)

    # market_db's newest Chaos Orb row in this league is 0.02 Div.
    assert result["flips"][0]["ninja_mid_div"] == 0.02


def test_no_edge_at_the_newest_hour_is_an_honest_no_result(
    cx_db: Path, market_league: str
) -> None:
    hour = current_hour()
    add_ingest(cx_db, market_league, hour)
    add_ingest(cx_db, market_league, hour - 3600)
    # Ranked an hour ago but not now: quoting it as current would be a stale recommendation.
    add_edge(cx_db, market_league, hour - 3600, "Metadata/Sim", 9.0, **detail())

    with pytest.raises(ToolNoResult) as raised:
        _invoke(market_league)

    assert raised.value.public_detail is not None
    assert "passes the app's rank gate" in raised.value.public_detail


def test_league_without_exchange_history_is_reported(cx_db: Path) -> None:
    with pytest.raises(ToolNoResult) as raised:
        _invoke("Brand New League")

    assert "Brand New League" in str(raised.value.public_detail)


def test_stale_digest_is_not_presented_as_current(cx_db: Path, market_league: str) -> None:
    stale_hour = current_hour() - 5 * 3600
    add_ingest(cx_db, market_league, stale_hour)
    add_edge(cx_db, market_league, stale_hour, "Metadata/Sim", 9.0, **detail())

    with pytest.raises(ToolNoResult) as raised:
        _invoke(market_league)

    assert "older than 3 hours" in str(raised.value.public_detail)


def test_rows_without_gate_detail_say_so_instead_of_guessing(
    market_db: Path, market_league: str, monkeypatch: Any
) -> None:
    create_cx_tables(market_db, with_detail=False)
    monkeypatch.setattr(flips, "get_settings", lambda: settings_for(market_db))
    hour = current_hour()
    add_ingest(market_db, market_league, hour)
    add_edge(market_db, market_league, hour, "Metadata/Sim", 9.0)

    flip = _invoke(market_league)["flips"][0]

    assert flip["held_6h"] is None and flip["slower_leg_div_per_hour"] is None
    assert "detail_missing" in flip


def test_limit_is_respected_and_payload_stays_under_the_cap(
    cx_db: Path, market_league: str
) -> None:
    hour = current_hour()
    add_ingest(cx_db, market_league, hour)
    for index in range(40):
        base_id = f"Metadata/Long{index}"
        add_edge(cx_db, market_league, hour, base_id, 5.0 + index, **detail())

    limited = _invoke(market_league, limit=3)
    widest = flips.get_top_flips.invoke({"limit": 10, "league": market_league})

    assert len(limited["flips"]) == 3
    assert limited["ranked_total"] == 40
    assert len(widest.encode("utf-8")) <= PAYLOAD_CAP_BYTES
    assert len(json.loads(widest)["flips"]) == 10


@pytest.mark.asyncio
@pytest.mark.parametrize("limit", [0, 11])
async def test_out_of_range_limit_is_invalid_input(
    cx_db: Path, market_league: str, limit: int
) -> None:
    result = await tool_node([flips.get_top_flips])(_state({"limit": limit}, market_league))

    error = json.loads(str(result["messages"][0].content))["error"]
    assert error["code"] == "tool_invalid_input"


@pytest.mark.asyncio
async def test_model_cannot_choose_the_league(cx_db: Path, market_league: str) -> None:
    hour = current_hour()
    add_ingest(cx_db, market_league, hour)
    add_ingest(cx_db, OTHER_LEAGUE, hour)
    add_edge(cx_db, market_league, hour, "Metadata/Sim", 9.0, **detail())
    add_edge(cx_db, OTHER_LEAGUE, hour, "Metadata/Omen", 40.0, **detail())

    # A model-supplied league is overwritten by the server-injected one.
    state = _state({"limit": 5, "league": OTHER_LEAGUE}, market_league)
    result = await tool_node([flips.get_top_flips])(state)

    payload = json.loads(str(result["messages"][0].content))
    assert payload["league"] == market_league
    assert [flip["item"] for flip in payload["flips"]] == ["Simulacrum"]


def _state(args: dict[str, object], league: str) -> dict[str, object]:
    call = {"name": "get_top_flips", "args": args, "id": "call-flips", "type": "tool_call"}
    return {
        "request_id": "abcdef0123456789abcdef01",
        "league": league,
        "messages": [AIMessage(content="", tool_calls=[call])],
    }
