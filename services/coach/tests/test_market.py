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
    now = datetime.now(UTC).replace(microsecond=0)
    with sqlite3.connect(market_db) as connection:
        connection.execute(
            "UPDATE price_snapshots SET fetched_at = ? WHERE league = ?",
            ((now - timedelta(days=3)).isoformat(), market_league),
        )
        connection.executemany(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (20, "Live League", "chaos", "Chaos Orb", "Currency", 0.8, 900, (
                    now - timedelta(hours=1)
                ).isoformat()),
                (21, "Live League", "chaos", "Chaos Orb", "Currency", 0.9, 900, now.isoformat()),
            ],
        )

    history = json.loads(
        market.analyze_market_history.invoke({"items": ["Chaos Orb"], "days": 30})
    )["items"][0]

    assert history["sample_count"] == 2, "only the live league's observations belong in the series"
    assert history["start_value_div"] == 0.8
    assert history["latest_value_div"] == 0.9
    assert history["change_pct"] == 12.5

    current = json.loads(fetch_live_prices.invoke({"items": ["Chaos Orb"]}))
    assert current["items"][0]["value_div"] == 0.9
