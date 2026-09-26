"""get_farm_advice mirrors FarmAdvisor's basket heat over one league's latest snapshots."""

import json
import math
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from engine_fixtures import OTHER_LEAGUE, settings_for

from src.errors import ToolNoResult
from src.tools import farm
from src.tools.engine_common import PAYLOAD_CAP_BYTES


@pytest.fixture
def farm_db(market_db: Path, monkeypatch: Any) -> Path:
    with sqlite3.connect(market_db) as connection:
        connection.execute("ALTER TABLE item_spark ADD COLUMN change_7d REAL")
    monkeypatch.setattr(farm, "get_settings", lambda: settings_for(market_db))
    return market_db


def _add(
    path: Path, league: str, item_id: str, category: str, value: float, volume: float,
    change: float | None,
) -> None:
    stamp = datetime.now(UTC).isoformat()
    with sqlite3.connect(path) as connection:
        connection.execute(
            """INSERT INTO price_snapshots
               (league, item_id, item_name, category, chaos_equiv, volume, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (league, item_id, item_id.replace("-", " ").title(), category, value, volume, stamp),
        )
        connection.execute(
            """INSERT INTO item_spark (league, item_id, updated_at, change_7d) VALUES (?, ?, ?, ?)
               ON CONFLICT(league, item_id) DO UPDATE SET change_7d = excluded.change_7d""",
            (league, item_id, stamp, change),
        )


def _invoke(league: str, limit: int = 8) -> dict[str, Any]:
    return json.loads(farm.get_farm_advice.invoke({"limit": limit, "league": league}))


def test_basket_heat_matches_the_farm_advisor_formula(farm_db: Path, market_league: str) -> None:
    _add(farm_db, market_league, "catalyst-a", "Breach", 2.0, 100, 40.0)
    _add(farm_db, market_league, "catalyst-b", "Breach", 1.0, 1000, 10.0)
    _add(farm_db, market_league, "rune-a", "Runes", 5.0, 500, 12.0)
    # Ritual category, but the Abyss drops it: re-bucketed before ranking.
    _add(farm_db, market_league, "omen-of-light", "Ritual", 3.0, 200, 80.0)
    _add(farm_db, market_league, "thin-rune", "Runes", 50.0, 10, 500.0)  # illiquid: ignored
    _add(farm_db, market_league, "flat-rune", "Runes", 1.0, 100, None)  # no trend: ignored
    _add(farm_db, OTHER_LEAGUE, "catalyst-a", "Breach", 2.0, 100, -90.0)

    result = _invoke(market_league)

    activities = [row["activity"] for row in result["farms"]]
    assert activities == ["Abyss", "Breach", "Runes"]
    breach = result["farms"][1]
    weight_a = 2.0 * math.log10(110)
    weight_b = 1.0 * math.log10(1010)
    expected = (40.0 * weight_a + 10.0 * weight_b) / (weight_a + weight_b)
    assert breach["weighted_change_7d_pct"] == round(expected, 1)
    assert breach["signal"] == "WARM"
    assert breach["items"] == 2
    assert [driver["item"] for driver in breach["drivers"]] == ["Catalyst A", "Catalyst B"]
    assert result["farms"][0]["signal"] == "HOT"
    assert result["farms"][2]["items"] == 1
    assert "not a Div/hour" in result["caveat"]


def test_league_without_rows_is_no_result(farm_db: Path) -> None:
    with pytest.raises(ToolNoResult) as raised:
        _invoke("Brand New League")

    assert "Brand New League" in str(raised.value.public_detail)


def test_no_qualifying_basket_is_no_result(farm_db: Path, market_league: str) -> None:
    # market_db rows have no 7d change, so nothing can be ranked.
    with pytest.raises(ToolNoResult):
        _invoke(market_league)


def test_payload_stays_under_the_cap(farm_db: Path, market_league: str) -> None:
    for category in range(20):
        for item in range(6):
            _add(
                farm_db, market_league, f"long-item-name-{category}-{item}-with-extra-words",
                f"Category{category}", 1.0 + item, 500, float(category + item),
            )

    text = farm.get_farm_advice.invoke({"limit": 8, "league": market_league})

    assert len(text.encode("utf-8")) <= PAYLOAD_CAP_BYTES
    assert json.loads(text)["farms_total"] == 20
