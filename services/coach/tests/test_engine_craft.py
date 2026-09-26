"""get_craft_margins serves stored craft reports through the app's gate, per league."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from engine_fixtures import (
    OTHER_LEAGUE,
    add_craft,
    craft_report,
    create_craft_table,
    leg,
    settings_for,
)
from langchain_core.messages import AIMessage

from src.errors import ToolNoResult
from src.tool_execution import tool_node
from src.tools import craft
from src.tools.craft_gate import report_max_age_minutes
from src.tools.engine_common import PAYLOAD_CAP_BYTES


@pytest.fixture
def craft_db(market_db: Path, monkeypatch: Any) -> Path:
    create_craft_table(market_db)
    monkeypatch.setattr(craft, "get_settings", lambda: settings_for(market_db))
    return market_db


def _invoke(league: str, domain: str = "any", limit: int = 8) -> dict[str, Any]:
    return json.loads(
        craft.get_craft_margins.invoke({"domain": domain, "limit": limit, "league": league})
    )


def test_gate_passing_recipes_rank_first_then_by_ev(craft_db: Path, market_league: str) -> None:
    add_craft(craft_db, market_league, "bow_amanamu", craft_report("bow_amanamu", 1.2))
    add_craft(craft_db, market_league, "jewel_suffix_push", craft_report("jewel_suffix_push", 3.4))
    thin = craft_report("amulet_giga_spirit", 9.9, result=leg(6.0, samples=3, total=6))
    add_craft(craft_db, market_league, "amulet_giga_spirit", thin)

    result = _invoke(market_league)

    keys = [recipe["key"] for recipe in result["recipes"]]
    assert keys == ["jewel_suffix_push", "bow_amanamu", "amulet_giga_spirit"]
    top, _, gated = result["recipes"]
    assert top["ranked"] is True and "gate_reasons" not in top
    assert top["label"] == "Time-Lost jewel · +1 suffix push" and top["domain"] == "jewel"
    assert top["hit_rate_curated_estimate"] == 0.35
    assert "hit_rate" not in top
    assert gated["ranked"] is False
    assert "result: only 6 listed (need 8)" in gated["gate_reasons"]
    assert "result: only 3 usable asks (need 5)" in gated["gate_reasons"]
    assert result["computed_league"] == market_league
    assert "curated estimates" in result["caveat"]


def test_domain_filter_and_exclusions_are_counted(craft_db: Path, market_league: str) -> None:
    stale_age = timedelta(minutes=report_max_age_minutes(10) + 1)
    add_craft(craft_db, market_league, "bow_amanamu", craft_report("bow_amanamu", 1.2))
    add_craft(
        craft_db, market_league, "wand_alloy_crystallisation",
        craft_report("wand_alloy_crystallisation", 5.0), age=stale_age,
    )
    failed = craft_report("quarterstaff_desecrate_crit", 0.0, status="leg-failed", result=None)
    add_craft(craft_db, market_league, "quarterstaff_desecrate_crit", failed)
    add_craft(craft_db, market_league, "jewel_suffix_push", craft_report("jewel_suffix_push", 3.4))

    result = _invoke(market_league, domain="weapon")

    assert [recipe["key"] for recipe in result["recipes"]] == ["bow_amanamu"]
    assert result["excluded"] == {"not_ok": 1, "stale": 1, "unreadable": 0}


def test_legacy_valuation_and_flagged_return_fail_the_gate(
    craft_db: Path, market_league: str
) -> None:
    # 12 result listings clear the base depth gate but not the flagged-return one (20).
    report = craft_report(
        "ring_fractured_t1res", 4.0, valuation="legacy-cheapest", returnFlagged=True,
        result=leg(6.0, total=12),
    )
    add_craft(craft_db, market_league, "ring_fractured_t1res", report)

    recipe = _invoke(market_league)["recipes"][0]

    assert recipe["ranked"] is False
    assert recipe["return_flagged"] is True
    assert "legacy valuation — awaiting rescan" in recipe["gate_reasons"]
    assert any(reason.startswith("return >10× cost") for reason in recipe["gate_reasons"])


def test_failing_rescans_are_flagged_beside_the_last_good_report(
    craft_db: Path, market_league: str
) -> None:
    add_craft(
        craft_db, market_league, "bow_amanamu", craft_report("bow_amanamu", 1.2),
        last_error_at=datetime.now(UTC),
    )

    assert _invoke(market_league)["recipes"][0]["rescans_failing"] is True


def test_reports_of_another_league_are_never_served(craft_db: Path, market_league: str) -> None:
    add_craft(craft_db, OTHER_LEAGUE, "bow_amanamu", craft_report("bow_amanamu", 1.2))

    with pytest.raises(ToolNoResult) as raised:
        _invoke(market_league)

    detail = str(raised.value.public_detail)
    assert market_league in detail and OTHER_LEAGUE in detail


def test_all_stale_is_no_result(craft_db: Path, market_league: str) -> None:
    add_craft(
        craft_db, market_league, "bow_amanamu", craft_report("bow_amanamu", 1.2),
        age=timedelta(days=2),
    )

    with pytest.raises(ToolNoResult) as raised:
        _invoke(market_league)

    assert "1 stale" in str(raised.value.public_detail)


@pytest.mark.asyncio
@pytest.mark.parametrize("stored", ["{not json", json.dumps({"key": "bow_amanamu"})])
async def test_only_malformed_rows_is_source_unavailable_not_a_crash(
    craft_db: Path, market_league: str, stored: str
) -> None:
    add_craft(craft_db, market_league, "bow_amanamu", stored)

    result = await tool_node([craft.get_craft_margins])(_state(market_league))

    error = json.loads(str(result["messages"][0].content))["error"]
    assert error["code"] == "tool_source_unavailable"


def test_malformed_row_beside_good_ones_is_counted_and_skipped(
    craft_db: Path, market_league: str
) -> None:
    add_craft(craft_db, market_league, "bow_amanamu", "[1, 2")
    add_craft(craft_db, market_league, "jewel_suffix_push", craft_report("jewel_suffix_push", 3.4))
    # A number stored as text is corrupt in the app's zod schema too.
    corrupt = craft_report("amulet_giga_spirit", 2.0, evDiv="2.0")
    add_craft(craft_db, market_league, "amulet_giga_spirit", corrupt)

    result = _invoke(market_league)

    assert [recipe["key"] for recipe in result["recipes"]] == ["jewel_suffix_push"]
    assert result["excluded"]["unreadable"] == 2


def test_every_recipe_fits_under_the_payload_cap(craft_db: Path, market_league: str) -> None:
    from src.tools.craft_gate import RECIPES

    for index, key in enumerate(RECIPES):
        thin = craft_report(
            key, float(index), valuation="legacy-cheapest", returnFlagged=True,
            base=leg(1.0, samples=1, total=2, unresolvedStats=["x"], outliersDropped=3),
            result=leg(6.0, samples=1, total=2, unresolvedStats=["y"], outliersDropped=3),
        )
        add_craft(craft_db, market_league, key, thin)

    text = craft.get_craft_margins.invoke({"domain": "any", "limit": 8, "league": market_league})

    assert len(text.encode("utf-8")) <= PAYLOAD_CAP_BYTES
    assert json.loads(text)["recipes"]


def _state(league: str) -> dict[str, object]:
    call = {
        "name": "get_craft_margins",
        "args": {"domain": "any", "limit": 5},
        "id": "call-craft",
        "type": "tool_call",
    }
    return {
        "request_id": "abcdef0123456789abcdef01",
        "league": league,
        "messages": [AIMessage(content="", tool_calls=[call])],
    }
