"""Farm advice: the app's FarmAdvisor basket heat, recomputed from the same snapshot rows.

FarmAdvisor (src/core/farmAdvisor.ts, `rankFarms`) is computed per request and never persisted,
so its formula is mirrored here over the identical query (`latestSnapshots` in
src/db/marketQueries.ts). tests/test_engine_drift.py pins the mirrored tables and constants to
the TypeScript source. The result is market interest in each activity's drops, not Div/hour.
"""

import math
import sqlite3
from contextlib import closing
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool

from src.config import get_settings
from src.errors import ToolNoResult
from src.tools.engine_common import engine_source, fit_payload, sig, validated_limit
from src.tools.farm_tables import FARM_LABELS, MIN_VOLUME, SOURCE_OVERRIDES
from src.tools.sqlite_source import connect_read_only, raise_source_error

_CAVEAT = (
    "Heat is value- and liquidity-weighted 7-day price momentum of what each activity drops: "
    "market interest, not a Div/hour estimate."
)


@tool
def get_farm_advice(limit: int, league: Annotated[str, InjectedToolArg]) -> str:
    """Return up to `limit` (1-8) farmable activities ranked by how hot their drop basket is.

    Use for "what should I farm right now". HOT means the activity's tradeable drops rose about
    30%+ over 7 days (value-weighted), WARM 10%+, COLD below that; drivers are the top movers.
    """
    count = validated_limit(limit, 8)
    try:
        with closing(connect_read_only(get_settings().poe_db_path)) as connection:
            rows = _latest_snapshots(connection, league)
            fetched = connection.execute(
                "SELECT MAX(fetched_at) AS mx FROM price_snapshots WHERE league = ?", (league,)
            ).fetchone()["mx"]
    except sqlite3.Error as error:
        raise_source_error(error)
    if not rows:
        raise ToolNoResult(
            f"No market data for league {league!r}",
            public_detail=(
                f"No market data has been collected for the league {league!r} yet. Say so and "
                "do not rank farms from another league."
            ),
        )
    farms = rank_farms(rows)
    if not farms:
        raise ToolNoResult(
            f"No farm basket qualifies in {league!r}",
            public_detail=(
                "No activity basket has enough liquid, priced drops with a 7-day trend to rank. "
                "Say the farm signal is empty right now."
            ),
        )
    source = engine_source(f"farm|{league}|{fetched}", f"Farm advisor: basket heat, {league}")
    payload: dict[str, object] = {
        "league": league,
        "observation_kind": "poe_ninja_7d_momentum",
        "executable": False,
        "data_timestamp": fetched,
        "caveat": _CAVEAT,
        "farms_total": len(farms),
        "farms": [_compact(farm) for farm in farms[:count]],
        "evidence_id": source["id"],
        "sources": [source],
    }
    return fit_payload(payload, "farms")


def _latest_snapshots(connection: sqlite3.Connection, league: str) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT s.item_id, s.item_name, s.category, s.chaos_equiv AS value_div, s.volume,
               sp.change_7d
        FROM price_snapshots AS s
        JOIN (SELECT item_id, MAX(id) AS mx FROM price_snapshots WHERE league = ?
              GROUP BY item_id) AS latest ON latest.item_id = s.item_id AND latest.mx = s.id
        LEFT JOIN item_spark AS sp ON sp.item_id = s.item_id AND sp.league = s.league
        ORDER BY s.item_id
        """,
        (league,),
    ).fetchall()


def rank_farms(rows: list[sqlite3.Row]) -> list[dict[str, object]]:
    """rankFarms(): per-category value×log-volume weighted 7d change, hot first."""
    baskets: dict[str, list[sqlite3.Row]] = {}
    for row in rows:
        # A NULL volume compares as 0 in the TS original, i.e. illiquid.
        volume = row["volume"] or 0
        if row["value_div"] <= 0 or volume < MIN_VOLUME or row["change_7d"] is None:
            continue
        category = SOURCE_OVERRIDES.get(str(row["item_id"]), str(row["category"]))
        baskets.setdefault(category, []).append(row)
    ranks = [rank for category, basket in baskets.items() if (rank := _rank(category, basket))]
    return sorted(
        ranks, key=lambda rank: (-float(rank["change"]), -float(rank["basket_value_div"]))
    )


def _weight(row: sqlite3.Row) -> float:
    return float(row["value_div"]) * math.log10(float(row["volume"] or 0) + 10)


def _rank(category: str, basket: list[sqlite3.Row]) -> dict[str, object] | None:
    total_weight = sum(_weight(row) for row in basket)
    if total_weight <= 0:
        return None
    change = sum(float(row["change_7d"]) * _weight(row) for row in basket) / total_weight
    drivers = sorted(
        basket,
        key=lambda row: max(float(row["change_7d"]), 0) * float(row["value_div"]),
        reverse=True,
    )[:3]
    label, hint = FARM_LABELS.get(category, (category, ""))
    return {
        "activity": label,
        "hint": hint,
        "signal": "HOT" if change >= 30 else "WARM" if change >= 10 else "COLD",
        "change": change,
        "basket_value_div": sum(float(row["value_div"]) for row in basket),
        "items": len(basket),
        "drivers": drivers,
    }


def _compact(farm: dict[str, object]) -> dict[str, object]:
    drivers = farm["drivers"]
    if not isinstance(drivers, list):
        raise RuntimeError("farm rank has no driver list")
    return {
        "activity": farm["activity"],
        "hint": farm["hint"],
        "signal": farm["signal"],
        "weighted_change_7d_pct": round(float(farm["change"]), 1),
        "basket_value_div": sig(float(farm["basket_value_div"])),
        "items": farm["items"],
        "drivers": [
            {
                "item": str(row["item_name"]),
                "change_7d_pct": round(float(row["change_7d"]), 1),
                "value_div": sig(float(row["value_div"])),
            }
            for row in drivers
        ],
    }
