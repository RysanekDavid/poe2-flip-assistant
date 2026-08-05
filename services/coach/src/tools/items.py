"""Deterministic item inspection tool backed by the committed RePoE snapshot."""

import hashlib
import json
from pathlib import Path

from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, ConfigDict

from src.evidence import evidence_id
from src.items import get_item_catalog, inspect_item_text


class GameDataLookupInput(BaseModel):
    """Strict model-facing contract for one bounded catalog lookup."""

    model_config = ConfigDict(extra="forbid")

    query: str


def build_item_tool(manifest_path: Path) -> BaseTool:
    """Bind one immutable catalog to an agent tool instance."""
    catalog = get_item_catalog(manifest_path)

    @tool("inspect_poe2_item")
    def inspect_poe2_item(item_text: str) -> str:
        """Parse a pasted PoE2 item into its base, exact affixes, tiers, and open slots.

        Always call this before explaining or planning a craft for a pasted item. If complete is
        false, do not guess the unmatched or ambiguous modifiers.
        """
        inspection = inspect_item_text(catalog, item_text)
        source = []
        if inspection.evidence_id:
            source.append(
                {
                    "id": inspection.evidence_id,
                    "type": "game_data",
                    "title": f"RePoE {catalog.version} — {inspection.base_name}",
                    "url": "https://repoe-fork.github.io/poe2/",
                }
            )
        return json.dumps(
            {"inspection": inspection.model_dump(mode="json"), "sources": source},
            ensure_ascii=False,
        )

    return inspect_poe2_item


def build_game_data_tool(manifest_path: Path) -> BaseTool:
    """Bind a complete local catalog lookup tool to one snapshot."""
    catalog = get_item_catalog(manifest_path)

    @tool("lookup_poe2_game_data", args_schema=GameDataLookupInput)
    def lookup_poe2_game_data(query: str) -> str:
        """Look up exact PoE2 bases, modifiers, items, skills, augments, tags, or uniques.

        Use this local datamined catalog before web search for exact game-data descriptions.
        Spawn weights are compatibility markers, not trustworthy outcome probabilities.
        """
        hits = catalog.search(query, 5)
        identity = hashlib.sha256(json.dumps(hits, sort_keys=True).encode()).hexdigest()
        source_id = evidence_id("D", f"{catalog.version}|{query}|{identity}")
        source = {
            "id": source_id,
            "type": "game_data",
            "title": f"RePoE {catalog.version} — {query.strip()}",
            "url": "https://repoe-fork.github.io/poe2/",
        }
        return json.dumps(
            {
                "query": query,
                "hits": hits,
                "evidence_id": source_id,
                "sources": [source],
            },
            ensure_ascii=False,
        )

    return lookup_poe2_game_data
