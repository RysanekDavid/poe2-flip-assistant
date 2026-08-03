"""Product market-tool tests against the application database shape."""

import json
import sqlite3
from datetime import UTC, datetime, timedelta
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
    market_db: Path,
) -> None:
    latest = datetime.now(UTC).replace(microsecond=0).isoformat()
    with sqlite3.connect(market_db) as connection:
        connection.execute(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?)",
            (4, "zero", "Zero Value", "Currency", 0, 1, latest),
        )
        connection.execute("INSERT INTO item_spark VALUES (?, ?)", ("zero", latest))

    assert market.market_ready(market_db) is True


def test_market_readiness_does_not_use_non_currency_heartbeat(
    market_db: Path,
) -> None:
    latest = datetime.now(UTC).replace(microsecond=0)
    stale = latest - timedelta(hours=1)
    with sqlite3.connect(market_db) as connection:
        connection.execute(
            "UPDATE item_spark SET updated_at = ?", (stale.isoformat(),)
        )
        connection.execute(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?)",
            (4, "other", "Other Item", "Omen", 1, 1, latest.isoformat()),
        )
        connection.execute(
            "INSERT INTO item_spark VALUES (?, ?)", ("other", latest.isoformat())
        )

    assert market.market_ready(market_db) is False


def test_market_readiness_rejects_latest_zero_currency_value(
    market_db: Path,
) -> None:
    latest = datetime.now(UTC).replace(microsecond=0)
    stale = latest - timedelta(hours=1)
    with sqlite3.connect(market_db) as connection:
        connection.execute("DELETE FROM price_snapshots")
        connection.execute("DELETE FROM item_spark")
        connection.executemany(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (1, "currency", "Currency", "Currency", 1, 1, stale.isoformat()),
                (2, "currency", "Currency", "Currency", 0, 1, latest.isoformat()),
            ],
        )
        connection.execute(
            "INSERT INTO item_spark VALUES (?, ?)",
            ("currency", latest.isoformat()),
        )

    assert market.market_ready(market_db) is False


def test_market_readiness_rejects_stale_poll_heartbeat(market_db: Path) -> None:
    stale = datetime.now(UTC) - timedelta(hours=1)
    with sqlite3.connect(market_db) as connection:
        connection.execute("UPDATE item_spark SET updated_at = ?", (stale.isoformat(),))

    assert market.market_ready(market_db) is False
