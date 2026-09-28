"""get_craft_margins serves stored craft reports as picks, near-misses and unpriced, per league."""

import json
import logging
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
    near_miss,
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


def _failed(key: str, error: str) -> dict[str, object]:
    return craft_report(key, 0.0, status="leg-failed", result=None, error=error, nearMiss=None)


def test_picks_rank_first_by_ev_then_near_misses(craft_db: Path, market_league: str) -> None:
    add_craft(craft_db, market_league, "bow_amanamu", craft_report("bow_amanamu", 1.2))
    add_craft(craft_db, market_league, "jewel_suffix_push", craft_report("jewel_suffix_push", 3.4))
    thin = craft_report("amulet_giga_spirit", 9.9, result=leg(6.0, samples=3, total=6))
    add_craft(craft_db, market_league, "amulet_giga_spirit", thin)

    result = _invoke(market_league)

    keys = [recipe["key"] for recipe in result["recipes"]]
    assert keys == ["jewel_suffix_push", "bow_amanamu", "amulet_giga_spirit"]
    top, _, gated = result["recipes"]
    assert top["verdict"] == "pick" and "blocking" not in top
    assert top["label"] == "Time-Lost jewel · +1 suffix push" and top["domain"] == "jewel"
    assert top["hit_rate_curated_estimate"] == 0.35
    assert top["result_median_div"] == 6.0 and top["result_band_div"] == [4.8, 7.2]
    assert top["confidence"] == "high"
    assert "hit_rate" not in top
    assert gated["verdict"] == "near_miss"
    assert "result: only 6 listed (need 8)" in gated["blocking"]
    assert "result: only 3 usable asks (need 5)" in gated["blocking"]
    assert result["verdicts"] == {"pick": 2, "near_miss": 1, "unpriced": 0}
    assert result["computed_league"] == market_league
    assert "curated estimates" in result["caveat"]
    assert "instant-buyout comparables" in result["ev_formula"]


def test_near_misses_are_ordered_by_margin_when_no_recipe_is_a_pick(
    craft_db: Path, market_league: str
) -> None:
    def losing(key: str, ev: float, margin: float, confidence: str) -> dict[str, object]:
        return craft_report(
            key, ev, marginPct=margin, nearMiss=near_miss(ev, confidence=confidence)
        )

    add_craft(craft_db, market_league, "bow_amanamu", losing("bow_amanamu", -0.9, -60.0, "high"))
    jewel = losing("jewel_suffix_push", -0.3, -20.0, "low")
    add_craft(craft_db, market_league, "jewel_suffix_push", jewel)
    add_craft(
        craft_db,
        market_league,
        "ring_catalysing_exalt",
        losing("ring_catalysing_exalt", -0.3, -20.0, "medium"),
    )
    add_craft(craft_db, market_league, "armour_putrefaction", _failed("armour_putrefaction", "x"))

    result = _invoke(market_league)

    keys = [recipe["key"] for recipe in result["recipes"]]
    assert keys == [
        "ring_catalysing_exalt",  # -20 %, medium beats low on a margin tie
        "jewel_suffix_push",
        "bow_amanamu",
        "armour_putrefaction",  # unpriced always last
    ]
    closest = result["recipes"][0]
    assert closest["verdict"] == "near_miss"
    assert closest["cost_div"] == 1.5 and closest["gap_div"] == 0.3
    assert closest["break_even_hit_rate"] == 0.25 and closest["confidence"] == "medium"
    assert closest["blocking"] == ["EV not positive"]
    unpriced = result["recipes"][-1]
    assert unpriced["verdict"] == "unpriced" and unpriced["error"] == "x"
    assert result["verdicts"] == {"pick": 0, "near_miss": 3, "unpriced": 1}


def test_domain_filter_counts_exclusions_and_lists_failed_scans(
    craft_db: Path, market_league: str
) -> None:
    stale_age = timedelta(minutes=report_max_age_minutes(10) + 1)
    add_craft(craft_db, market_league, "bow_amanamu", craft_report("bow_amanamu", 1.2))
    add_craft(
        craft_db,
        market_league,
        "wand_alloy_crystallisation",
        craft_report("wand_alloy_crystallisation", 5.0),
        age=stale_age,
    )
    failed = _failed("quarterstaff_desecrate_crit", "Rare quarterstaff: only 2 comparables")
    add_craft(craft_db, market_league, "quarterstaff_desecrate_crit", failed)
    add_craft(craft_db, market_league, "jewel_suffix_push", craft_report("jewel_suffix_push", 3.4))

    result = _invoke(market_league, domain="weapon")

    assert [r["key"] for r in result["recipes"]] == ["bow_amanamu", "quarterstaff_desecrate_crit"]
    assert result["recipes"][1]["error"].startswith("Rare quarterstaff")
    assert result["excluded"] == {"stale": 1, "unreadable": 0}


def test_only_failed_scans_still_answer_with_unpriced_rows(
    craft_db: Path, market_league: str
) -> None:
    long_error = "base: only 1 ask | " + "result: thin market " * 30
    add_craft(craft_db, market_league, "bow_amanamu", _failed("bow_amanamu", long_error))

    recipe = _invoke(market_league)["recipes"][0]

    assert recipe["verdict"] == "unpriced" and recipe["status"] == "leg-failed"
    assert len(recipe["error"]) == 160 and recipe["error"].endswith("…")


def test_legacy_valuation_and_flagged_return_block_the_pick(
    craft_db: Path, market_league: str
) -> None:
    # 10 result listings clear the base depth gate but not the flagged-return one (12).
    report = craft_report(
        "ring_fractured_t1res",
        4.0,
        valuation="floor-percentile",
        returnFlagged=True,
        result=leg(6.0, total=10),
    )
    add_craft(craft_db, market_league, "ring_fractured_t1res", report)

    recipe = _invoke(market_league)["recipes"][0]

    assert recipe["verdict"] == "near_miss"
    assert recipe["return_flagged"] is True
    assert "legacy valuation — awaiting rescan" in recipe["blocking"]
    assert any(reason.startswith("return >10× cost") for reason in recipe["blocking"])


def test_pre_comparable_rows_still_parse_as_legacy(craft_db: Path, market_league: str) -> None:
    old_leg = {
        k: v for k, v in leg(2.0).items() if k not in {"method", "band", "relaxed", "unrated"}
    }
    old = craft_report("bow_amanamu", 1.2, base=old_leg, result=old_leg)
    for field in ("nearMiss", "valuation", "returnFlagged"):
        del old[field]
    add_craft(craft_db, market_league, "bow_amanamu", old)

    recipe = _invoke(market_league)["recipes"][0]

    assert recipe["verdict"] == "near_miss" and "confidence" not in recipe
    assert "legacy valuation — awaiting rescan" in recipe["blocking"]


def test_failing_rescans_are_flagged_beside_the_last_good_report(
    craft_db: Path, market_league: str
) -> None:
    add_craft(
        craft_db,
        market_league,
        "bow_amanamu",
        craft_report("bow_amanamu", 1.2),
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
        craft_db,
        market_league,
        "bow_amanamu",
        craft_report("bow_amanamu", 1.2),
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
    craft_db: Path, market_league: str, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger="uvicorn.error")
    add_craft(craft_db, market_league, "bow_amanamu", "[1, 2")
    add_craft(craft_db, market_league, "jewel_suffix_push", craft_report("jewel_suffix_push", 3.4))
    # A number stored as text is corrupt in the app's zod schema too.
    corrupt = craft_report("amulet_giga_spirit", 2.0, evDiv="2.0")
    add_craft(craft_db, market_league, "amulet_giga_spirit", corrupt)

    result = _invoke(market_league)

    assert [recipe["key"] for recipe in result["recipes"]] == ["jewel_suffix_push"]
    assert result["excluded"]["unreadable"] == 2
    # Loud but bounded: the first unreadable row per call is logged, not every one.
    assert caplog.text.count("coach_craft_report_unreadable") == 1


def test_every_recipe_fits_under_the_payload_cap_and_keeps_the_top_three(
    craft_db: Path, market_league: str
) -> None:
    from src.tools.craft_gate import RECIPES

    reasons = ["base widened", "result widened"]
    for index, key in enumerate(RECIPES):
        if index % 3 == 2:
            add_craft(craft_db, market_league, key, _failed(key, "leg failed " * 40))
            continue
        thin = craft_report(
            key,
            float(index) - 5.5,
            valuation="floor-percentile",
            returnFlagged=True,
            base=leg(1.0, samples=1, total=2, unresolvedStats=reasons, outliersDropped=3),
            result=leg(6.0, samples=1, total=2, unresolvedStats=reasons, outliersDropped=3),
        )
        add_craft(craft_db, market_league, key, thin)

    text = craft.get_craft_margins.invoke({"domain": "any", "limit": 8, "league": market_league})

    assert len(text.encode("utf-8")) <= PAYLOAD_CAP_BYTES
    assert len(json.loads(text)["recipes"]) >= 3


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
