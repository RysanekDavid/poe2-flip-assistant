"""get_snipe_report serves the latest stored scan, only in the league the scanner runs in."""

import json
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from engine_fixtures import (
    OTHER_LEAGUE,
    create_snipe_tables,
    finding,
    set_snipe_failure,
    set_snipe_report,
    settings_for,
)
from langchain_core.messages import AIMessage

from src.errors import ToolNoResult
from src.tool_execution import tool_node
from src.tools import snipe
from src.tools.engine_common import PAYLOAD_CAP_BYTES


@pytest.fixture
def snipe_db(market_db: Path, market_league: str, monkeypatch: Any) -> Path:
    create_snipe_tables(market_db, default_league=market_league)
    monkeypatch.setattr(snipe, "get_settings", lambda: settings_for(market_db))
    return market_db


def _report(*findings: dict[str, object]) -> dict[str, object]:
    return {"profiles": 12, "exaltPerDivine": 350, "findings": list(findings), "diags": []}


def _invoke(league: str, limit: int = 8) -> dict[str, Any]:
    return json.loads(snipe.get_snipe_report.invoke({"limit": limit, "league": league}))


def test_findings_best_discount_first_without_seller_identity(
    snipe_db: Path, market_league: str
) -> None:
    scanned = datetime.now(UTC) - timedelta(minutes=12)
    report = _report(finding("Doom Song", 25.0), finding("Rune Bite", 41.5))
    set_snipe_report(snipe_db, report, scanned)

    result = _invoke(market_league)

    assert [item["item"] for item in result["findings"]] == ["Rune Bite", "Doom Song"]
    top = result["findings"][0]
    assert top["discount_pct"] == 41.5 and top["comparables"] == 9
    assert top["ask_div"] == 1.0 and top["reference_value_div"] == pytest.approx(1.71, rel=1e-3)
    assert result["instant_buyout"] is True
    assert 11 <= result["scan_age_min"] <= 13
    assert "newer_scan_failed_at" not in result
    text = json.dumps(result)
    assert "PrivateSeller" not in text and "listing-" not in text


def test_newer_failure_is_surfaced_and_older_one_is_not(
    snipe_db: Path, market_league: str
) -> None:
    now = datetime.now(UTC)
    set_snipe_report(snipe_db, _report(finding("Doom Song", 25.0)), now - timedelta(minutes=30))
    set_snipe_failure(snipe_db, now - timedelta(minutes=5))

    assert "newer_scan_failed_at" in _invoke(market_league)

    # A good scan after the failure clears the banner, as in the Snipe tab.
    with sqlite3.connect(snipe_db) as connection:
        connection.execute("UPDATE autosnipe_report SET scanned_at = datetime('now')")
    assert "newer_scan_failed_at" not in _invoke(market_league)


def test_other_league_gets_no_foreign_listings(snipe_db: Path) -> None:
    set_snipe_report(snipe_db, _report(finding("Doom Song", 25.0)), datetime.now(UTC))

    with pytest.raises(ToolNoResult) as raised:
        _invoke(OTHER_LEAGUE)

    assert "runs only in the app's default league" in str(raised.value.public_detail)


def test_empty_scan_is_no_result(snipe_db: Path, market_league: str) -> None:
    set_snipe_report(snipe_db, _report(), datetime.now(UTC))

    with pytest.raises(ToolNoResult) as raised:
        _invoke(market_league)

    assert "found no listing" in str(raised.value.public_detail)


def test_missing_report_is_no_result(snipe_db: Path, market_league: str) -> None:
    set_snipe_failure(snipe_db, datetime.now(UTC))

    with pytest.raises(ToolNoResult) as raised:
        _invoke(market_league)

    assert "latest attempt failed" in str(raised.value.public_detail)


@pytest.mark.asyncio
@pytest.mark.parametrize("stored", ["{oops", json.dumps({"findings": [{"itemName": 3}]})])
async def test_malformed_report_is_source_unavailable_not_a_crash(
    snipe_db: Path, market_league: str, stored: str
) -> None:
    set_snipe_report(snipe_db, stored, datetime.now(UTC))
    call = {
        "name": "get_snipe_report",
        "args": {"limit": 3},
        "id": "call-snipe",
        "type": "tool_call",
    }
    state = {
        "request_id": "abcdef0123456789abcdef01",
        "league": market_league,
        "messages": [AIMessage(content="", tool_calls=[call])],
    }

    result = await tool_node([snipe.get_snipe_report])(state)

    error = json.loads(str(result["messages"][0].content))["error"]
    assert error["code"] == "tool_source_unavailable"


def test_long_findings_stay_under_the_payload_cap(snipe_db: Path, market_league: str) -> None:
    long_mods = " · ".join(f"Very long modifier text {index} with rolls" for index in range(6))
    findings = [finding(f"Item {index}", 20.0 + index, keyMods=long_mods) for index in range(30)]
    set_snipe_report(snipe_db, _report(*findings), datetime.now(UTC))

    text = snipe.get_snipe_report.invoke({"limit": 8, "league": market_league})
    result = json.loads(text)

    assert len(text.encode("utf-8")) <= PAYLOAD_CAP_BYTES
    assert result["findings_total"] == 30
    assert result["findings"][0]["item"] == "Item 29"
    assert len(result["findings"]) + result.get("trimmed_rows", 0) == 8
