"""`lookup_entity`: one catalog card (art, what it does, how to use it) for a named item."""

import json
from pathlib import Path

from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, ConfigDict

from src.entities import get_entity_catalog
from src.errors import ToolInvalidInput, ToolNoResult
from src.evidence import evidence_id


class EntityLookupInput(BaseModel):
    """Strict model-facing contract for one entity lookup."""

    model_config = ConfigDict(extra="forbid")

    name: str


def build_entity_tool(catalog_path: Path) -> BaseTool:
    """Bind the immutable entity catalog to an agent tool instance."""
    catalog = get_entity_catalog(catalog_path)

    @tool("lookup_entity", args_schema=EntityLookupInput)
    def lookup_entity(name: str) -> str:
        """Describe one named PoE2 item: what it does, how it is used, its kind and stack size.

        Prefer this for "what does X do" / "what is X" about currency, omens, essences,
        catalysts, fragments, runes, soul cores, lineage or uncut gems, and uniques.
        """
        query = name.strip()
        if len(query) < 2:
            raise ToolInvalidInput("entity name must contain at least two characters")
        row, alternatives = catalog.lookup(query)
        if row is None:
            raise ToolNoResult(
                f"No entity matches {query!r}",
                public_detail=(
                    "No catalog item matches that name. "
                    + (f"Close names: {', '.join(alternatives)}." if alternatives else "")
                ).strip(),
            )
        source_id = evidence_id("D", f"entity|{catalog.repoe_version}|{row.id}")
        entity = row.model_dump(mode="json", exclude={"aliases", "icon_url", "poe2db_url"})
        return json.dumps(
            {
                "query": query,
                "entity": entity,
                "exact": row.name.casefold() == query.casefold(),
                "alternatives": alternatives,
                "evidence_id": source_id,
                "sources": [
                    {
                        "id": source_id,
                        "type": "game_data",
                        "title": f"Game data {catalog.game_data_patch} — {row.name}",
                        "url": row.poe2db_url,
                    }
                ],
            },
            ensure_ascii=False,
        )

    return lookup_entity
