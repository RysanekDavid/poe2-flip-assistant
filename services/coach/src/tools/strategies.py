"""`find_farm_strategies`: curated atlas setups per mechanic from the strategy KB.

Reads src/data/poe2/strategies/*.json (the same files Farm › Strategies renders). Every fact keeps
its claim grade in the compact rows, so the model can tell a datamined fact from a lead; the files
are deliberately not in the RAG corpus.
"""

import json
from pathlib import Path

from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, ConfigDict

from src.entities import EntityCatalog, get_entity_catalog
from src.errors import ToolInvalidInput, ToolNoResult
from src.evidence import evidence_id
from src.strategies import BUDGET_ORDER, BudgetTier, FarmStrategy, Mechanic, get_strategies
from src.strategies.models import Claim
from src.tools.engine_common import PAYLOAD_CAP_BYTES

_MAX_ROWS = 4
_MAX_SOURCES = 6
_POE2DB = "https://poe2db.tw/us/"


class FarmStrategiesInput(BaseModel):
    """Strict model-facing contract: every field is required and nullable."""

    model_config = ConfigDict(extra="forbid")

    mechanic: Mechanic | None
    target_item: str | None
    budget: BudgetTier | None


def _grade(claim: Claim) -> str:
    return claim.v if claim.note is None or claim.settled else f"{claim.v}: {claim.note}"


def _poe2db_sources(strategy: FarmStrategy) -> list[str]:
    urls: list[str] = [p.poe2db_url for p in strategy.atlas_passives]
    claims = [strategy.atlas_master.claim, *(y.claim for y in strategy.yields)]
    claims += [m.claim for t in strategy.tablets for m in t.mods]
    urls += [url for claim in claims for url in claim.src if url.startswith(_POE2DB)]
    return list(dict.fromkeys(urls))[:_MAX_SOURCES]


def _unsettled(strategy: FarmStrategy) -> list[str]:
    named = [("budget", strategy.budget.claim), ("waystone", strategy.waystone.claim)]
    named += [(y.ref.name, y.claim) for y in strategy.yields]
    named += [(m.text, m.claim) for t in strategy.tablets for m in t.mods]
    return [f"{label} [{claim.v}]: {claim.note}" for label, claim in named if not claim.settled]


def _row(strategy: FarmStrategy) -> dict[str, object]:
    master = strategy.atlas_master
    return {
        "id": strategy.id,
        "title": strategy.title,
        "status": strategy.status,
        "verified_against": strategy.patch.verified_against,
        "leagues": list(strategy.patch.leagues),
        "mechanics": list(strategy.mechanics),
        "budget": strategy.budget.tier,
        "summary": strategy.summary,
        "master": {
            "name": master.master,
            "nodes": [f"T{n.tier} {n.name}: {n.effect}" for n in master.nodes],
            "grade": _grade(master.claim),
        },
        "notables": [f"{p.name} ({p.priority}, {p.claim.v})" for p in strategy.atlas_passives],
        "tablets": [
            {
                "type": t.type if t.unique is None else f"{t.unique} ({t.type})",
                "count": t.count,
                "mods": [f"{m.text} [{m.claim.v}]" for m in t.mods],
            }
            for t in strategy.tablets
        ],
        "waystone_prefer": list(strategy.waystone.prefer),
        "yields": [f"{y.ref.name} ({y.role}, {y.claim.v})" for y in strategy.yields],
        "unsettled": _unsettled(strategy),
        "evidence_id": evidence_id("S", f"strategy|{strategy.id}|{strategy.patch.stamped_at}"),
        "poe2db_sources": _poe2db_sources(strategy),
    }


def _source(row: dict[str, object]) -> dict[str, object]:
    urls = row["poe2db_sources"]
    return {
        "id": row["evidence_id"],
        "type": "knowledge",
        "title": (
            f"Strategy KB — {row['title']} ({row['status']}, verified {row['verified_against']})"
        ),
        "url": urls[0] if isinstance(urls, list) and urls else None,
    }


def _fit(query: dict[str, object], rows: list[dict[str, object]]) -> str:
    """Drop trailing rows (and their sources) until the payload fits the shared byte cap."""
    kept = rows[:_MAX_ROWS]
    while kept:
        payload = {**query, "matches_total": len(rows), "strategies": kept}
        payload["sources"] = [_source(row) for row in kept]
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if len(text.encode("utf-8")) <= PAYLOAD_CAP_BYTES:
            return text
        kept = kept[:-1]
    raise RuntimeError("a single strategy row exceeds the tool payload cap")


def _matches(
    strategy: FarmStrategy,
    mechanic: Mechanic | None,
    entity_id: str | None,
    budget: BudgetTier | None,
) -> bool:
    if mechanic is not None and mechanic not in strategy.mechanics:
        return False
    if budget is not None and BUDGET_ORDER.index(strategy.budget.tier) > BUDGET_ORDER.index(budget):
        return False
    return entity_id is None or any(y.ref.id == entity_id for y in strategy.yields)


def build_strategy_tool(strategies_dir: Path, entity_catalog_path: Path) -> BaseTool:
    """Bind the immutable strategy KB and entity catalog to an agent tool instance."""
    strategies = get_strategies(strategies_dir)
    catalog = get_entity_catalog(entity_catalog_path)

    @tool("find_farm_strategies", args_schema=FarmStrategiesInput)
    def find_farm_strategies(
        mechanic: Mechanic | None, target_item: str | None, budget: BudgetTier | None
    ) -> str:
        """Find curated farm strategies: Atlas Master nodes, atlas notables, tablets and mods,
        waystone totals and the yield basket, each fact with its evidence grade.

        Use for "how should I farm X / set up my atlas for Y / what can I farm with my budget".
        Filter by mechanic, by an item the strategy should produce (target_item), and by budget
        (league_start, mid or high = the most you can spend); pass null for any filter you skip.
        """
        entity_id = None if target_item is None else _resolve_item(catalog, target_item)
        found = [s for s in strategies if _matches(s, mechanic, entity_id, budget)]
        if not found:
            covered = sorted({m for s in strategies for m in s.mechanics})
            raise ToolNoResult(
                "No strategy matches the filters",
                public_detail=(
                    f"No curated strategy matches these filters. The strategy KB has "
                    f"{len(strategies)} strategies covering: {', '.join(covered)}. Say so; do "
                    "not invent a setup."
                ),
            )
        found.sort(key=lambda s: (BUDGET_ORDER.index(s.budget.tier), s.id))
        query_echo: dict[str, object] = {
            "filters": {"mechanic": mechanic, "target_item": entity_id, "budget": budget},
            "caveat": (
                "Curated drafts: relay status and verified_against; grades vp/vs are backed, "
                "ss is one source, syn is our synthesis, uv/cf are unsettled leads."
            ),
        }
        return _fit(query_echo, [_row(s) for s in found])

    return find_farm_strategies


def _resolve_item(catalog: EntityCatalog, target_item: str) -> str:
    query = target_item.strip()
    if len(query) < 2:
        raise ToolInvalidInput("target_item must contain at least two characters")
    row, alternatives = catalog.lookup(query)
    if row is None:
        raise ToolNoResult(
            f"No entity matches {query!r}",
            public_detail=(
                "No catalog item matches that name. "
                + (f"Close names: {', '.join(alternatives)}." if alternatives else "")
            ).strip(),
        )
    return row.id
