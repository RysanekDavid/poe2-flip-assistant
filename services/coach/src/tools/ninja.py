"""Latest market values from the application's locally polled poe.ninja data."""

import json

from langchain_core.tools import tool

from src.evidence import evidence_id
from src.tools.market import current_market_values


@tool
def fetch_live_prices(items: list[str]) -> str:
    """Return the latest locally polled values for 1-5 item names.

    Values are in Divine Orbs and are reference mids, not executable bid/ask quotes.
    """
    results, timestamp = current_market_values(items)
    sources = [_live_source(result) for result in results]
    return json.dumps(
        {
            "unit": "Divine Orb",
            "observation_kind": "locally_polled_reference_mid",
            "executable": False,
            "fetched_at": timestamp,
            "items": results,
            "sources": sources,
        }
    )


def _live_source(result: dict[str, object]) -> dict[str, object]:
    # League is part of the identity: two leagues price the same orb differently, so the same
    # name+timestamp in each must not collapse onto one evidence id.
    source_id = evidence_id("L", f"{result['item_name']}|{result['league']}|{result['fetched_at']}")
    result["id"] = source_id
    return {
        "id": source_id,
        "type": "live",
        "title": f"Local poe.ninja poll: {result['item_name']}",
        "url": None,
    }
