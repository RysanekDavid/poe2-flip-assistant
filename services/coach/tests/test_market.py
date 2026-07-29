"""Product market-tool tests against the application database shape."""

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from src.tools import market
from src.tools.ninja import fetch_live_prices


def test_history_and_current_values_use_shared_database(
    market_db: Path, monkeypatch: Any
) -> None:
    monkeypatch.setattr(market, "get_settings", lambda: SimpleNamespace(poe_db_path=market_db))

    history = json.loads(
        market.analyze_market_history.invoke({"items": ["Chaos Orb"], "days": 7})
    )
    current = json.loads(fetch_live_prices.invoke({"items": ["Chaos Orb"]}))

    assert history["items"][0]["start_value_div"] == 0.01
    assert history["items"][0]["latest_value_div"] == 0.02
    assert current["items"][0]["value_div"] == 0.02
    assert current["items"][0]["fetched_at"] == "2026-07-16 00:00:00"
    assert market.market_ready(market_db)
