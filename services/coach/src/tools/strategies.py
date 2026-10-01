"""`find_strategies`: curated strategies of every kind from the strategy KB.

Reads src/data/poe2/strategies/*.json (the same files Farm › Strategies, Craft › Roll & sell and
Trade › Methods render). Kinds: farm (atlas setups per mechanic), roll_and_sell (an item rolled for
a mod and sold) and trade (inputs turned into outputs). Two modes keep every answer
complete under the shared payload cap: a list of ALL matching strategies (one short row each), and
the full detail of one strategy by id. Every fact keeps its claim grade and note, so the model can
tell a datamined fact from a lead; the files are deliberately not in the RAG corpus.
"""

import json
from pathlib import Path
from typing import Annotated

from langchain_core.tools import BaseTool, InjectedToolArg, tool
from pydantic import BaseModel, ConfigDict

from src.entities import EntityCatalog, get_entity_catalog
from src.errors import ToolInvalidInput, ToolNoResult
from src.evidence import evidence_id
from src.strategies import (
    BUDGET_ORDER,
    BudgetTier,
    Mechanic,
    Strategy,
    StrategyKind,
    get_strategies,
)
from src.strategies.models import strategy_outputs
from src.tools.engine_common import PAYLOAD_CAP_BYTES
from src.tools.strategy_rows import (
    claim_notes,
    claims,
    kind_detail,
    poe2db_sources,
    rating_text,
)

#: One whole strategy, asked for by id, is the answer itself rather than one of many rows, so it
#: gets 1.75x the engine tools' list cap (1.5x until schema v3 made every strategy carry its
#: durability section); still bounded, and sized for every file at boot.
DETAIL_CAP_BYTES = 7000
_CAVEAT = (
    "Curated drafts: relay status and verified_against. vp/vs backed, ss one source, syn our "
    "synthesis, uv/cf unsettled leads. Warn when checked_in_league is false."
)


class StrategiesInput(BaseModel):
    """Strict model-facing contract: every field is required and nullable; league is injected."""

    model_config = ConfigDict(extra="forbid")

    kind: StrategyKind | None
    mechanic: Mechanic | None
    target_item: str | None
    budget: BudgetTier | None
    strategy_id: str | None
    league: Annotated[str, InjectedToolArg]


def _strategy_evidence(strategy: Strategy) -> str:
    return evidence_id("S", f"strategy|{strategy.id}|{strategy.patch.stamped_at}")


def _league_fields(strategy: Strategy, league: str) -> dict[str, object]:
    checked = league in strategy.patch.leagues
    fields: dict[str, object] = {"checked_in_league": checked}
    if not checked:
        fields["league_note"] = (
            f"Checked in {', '.join(strategy.patch.leagues)}, not in {league}; "
            "some content may not drop there."
        )
    return fields


#: List rows are positional so every strategy of every kind fits the shared list cap; the id names
#: the strategy well enough to pick one for detail mode.
_LIST_COLUMNS = ("id", "kind", "budget", "status", "unsettled_facts", "checked_in_league")


def _list_row(strategy: Strategy, league: str) -> list[object]:
    unsettled = sum(1 for _, claim in claims(strategy) if not claim.settled)
    # The why of checked_in_league lives once at payload level (league_note) and in detail mode.
    checked = league in strategy.patch.leagues
    return [strategy.id, strategy.kind, strategy.budget.tier, strategy.status, unsettled, checked]


def _detail_row(strategy: Strategy, league: str) -> dict[str, object]:
    return {
        "id": strategy.id,
        "kind": strategy.kind,
        "title": strategy.title,
        "status": strategy.status,
        "verified_against": strategy.patch.verified_against,
        "leagues": list(strategy.patch.leagues),
        **_league_fields(strategy, league),
        "mechanics": list(strategy.mechanics),
        "budget": strategy.budget.tier,
        "summary": strategy.summary,
        "ratings": {
            "build": rating_text(strategy.ratings.build),
            "complexity": rating_text(strategy.ratings.complexity),
        },
        "durability": {
            "why_it_works": strategy.durability.why_it_works,
            "breaks_when": list(strategy.durability.breaks_when),
            "grade": strategy.durability.claim.v,
        },
        **kind_detail(strategy),
        "claim_notes": claim_notes(strategy),
        "risks": list(strategy.risks),
        "evidence_id": _strategy_evidence(strategy),
        "poe2db_sources": poe2db_sources(strategy),
    }


def _detail_payload(strategy: Strategy, league: str) -> dict[str, object]:
    row = _detail_row(strategy, league)
    urls = poe2db_sources(strategy)
    source = {
        "id": row["evidence_id"],
        "type": "knowledge",
        "title": (
            f"Strategy KB — {strategy.title} "
            f"({strategy.status}, verified {strategy.patch.verified_against})"
        ),
        "url": urls[0] if urls else None,
    }
    return {"mode": "detail", "caveat": _CAVEAT, "strategy": row, "sources": [source]}


def _list_payload(
    found: list[Strategy], filters: dict[str, object], league: str
) -> dict[str, object]:
    identity = "|".join(f"{s.id}@{s.patch.stamped_at}" for s in found)
    source_id = evidence_id("S", f"strategy-list|{identity}")
    unchecked = [s.id for s in found if league not in s.patch.leagues]
    return {
        "mode": "list",
        "caveat": _CAVEAT,
        "filters": filters,
        "league": league,
        "league_note": (
            f"{len(unchecked)} of these were checked in another league than {league}; "
            "detail mode names it."
            if unchecked
            else None
        ),
        "next_step": "Call with strategy_id (other filters null) for the full setup and risks.",
        "matches_total": len(found),
        "columns": list(_LIST_COLUMNS),
        "strategies": [_list_row(s, league) for s in found],
        "evidence_id": source_id,
        "sources": [
            {
                "id": source_id,
                "type": "knowledge",
                "title": f"Strategy KB — {len(found)} curated strategies",
                "url": None,
            }
        ],
    }


def _serialize(payload: dict[str, object]) -> str:
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    size = len(text.encode("utf-8"))
    cap = DETAIL_CAP_BYTES if payload["mode"] == "detail" else PAYLOAD_CAP_BYTES
    if size > cap:
        # Unreachable for committed data: build_strategy_tool sizes every payload at boot.
        raise RuntimeError(f"strategy {payload['mode']} payload {size} B exceeds the {cap} B cap")
    return text


def _check_payload_sizes(strategies: tuple[Strategy, ...]) -> None:
    """Fail at boot, not mid-conversation, when a data edit outgrows the tool payload cap.

    The full list is the largest list payload (every filter only removes rows); each detail
    payload is checked on its own. The probe league name is longer than any real one.
    """
    probe = "Hardcore SSF Forbidden Rites (probe league name)"
    filters: dict[str, object] = {
        "kind": "roll_and_sell",
        "mechanic": "map_boss",
        "target_item": "omen-of-sinistral-exaltation",
        "budget": "league_start",
    }
    _serialize(_list_payload(list(strategies), filters, probe))
    for strategy in strategies:
        _serialize(_detail_payload(strategy, probe))


def _matches(
    strategy: Strategy,
    filters: tuple[StrategyKind | None, Mechanic | None, str | None, BudgetTier | None],
) -> bool:
    kind, mechanic, entity_id, budget = filters
    if kind is not None and strategy.kind != kind:
        return False
    if mechanic is not None and mechanic not in strategy.mechanics:
        return False
    if budget is not None and BUDGET_ORDER.index(strategy.budget.tier) > BUDGET_ORDER.index(budget):
        return False
    return entity_id is None or any(ref.id == entity_id for ref in strategy_outputs(strategy))


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


def _no_match(strategies: tuple[Strategy, ...]) -> ToolNoResult:
    covered = sorted({m for s in strategies for m in s.mechanics})
    kinds = sorted({s.kind for s in strategies})
    return ToolNoResult(
        "No strategy matches the filters",
        public_detail=(
            f"No curated strategy matches these filters. The strategy KB has {len(strategies)} "
            f"strategies of kinds {', '.join(kinds)}, covering: {', '.join(covered)}. "
            "Say so; do not invent a setup."
        ),
    )


def _detail(strategies: tuple[Strategy, ...], strategy_id: str, league: str) -> str:
    by_id = {s.id: s for s in strategies}
    strategy = by_id.get(strategy_id.strip())
    if strategy is None:
        raise ToolNoResult(
            f"No strategy {strategy_id!r}",
            public_detail=f"No strategy with that id. Known ids: {', '.join(sorted(by_id))}.",
        )
    return _serialize(_detail_payload(strategy, league))


def build_strategy_tool(strategies_dir: Path, entity_catalog_path: Path) -> BaseTool:
    """Bind the immutable strategy KB and entity catalog to an agent tool instance."""
    strategies = get_strategies(strategies_dir)
    catalog = get_entity_catalog(entity_catalog_path)
    _check_payload_sizes(strategies)

    @tool("find_strategies", args_schema=StrategiesInput)
    def find_strategies(
        kind: StrategyKind | None,
        mechanic: Mechanic | None,
        target_item: str | None,
        budget: BudgetTier | None,
        strategy_id: str | None,
        league: str,
    ) -> str:
        """Find curated strategies, each fact with its evidence grade. Kinds: farm (Atlas Master
        nodes, notables, tablets, waystone totals, yield basket), roll_and_sell (a tablet or
        waystone to roll for a mod and sell) and trade (inputs turned into outputs, e.g. Reforging
        Bench ladders, gem corruption).

        Use for "how should I farm X / what can I roll and sell / how do I turn X into Y / what
        can I do with my budget". List mode (strategy_id null): every strategy matching kind,
        mechanic, target_item (an item it produces: a drop, the item sold or an output, never
        a currency it spends) and budget (league_start, mid or high = the most you can spend);
        pass null for any filter you skip. A single match comes back in detail mode directly.
        Detail mode: strategy_id from a list row, other filters null.
        """
        if strategy_id is not None:
            if any(f is not None for f in (kind, mechanic, target_item, budget)):
                raise ToolInvalidInput("strategy_id selects detail mode; pass the filters as null")
            return _detail(strategies, strategy_id, league)
        entity_id = None if target_item is None else _resolve_item(catalog, target_item)
        found = [s for s in strategies if _matches(s, (kind, mechanic, entity_id, budget))]
        if not found:
            raise _no_match(strategies)
        if len(found) == 1:
            # The Coach has two tool rounds; a lone match must not cost one on a list call.
            return _serialize(_detail_payload(found[0], league))
        found.sort(key=lambda s: (BUDGET_ORDER.index(s.budget.tier), s.id))
        filters = {"kind": kind, "mechanic": mechanic, "target_item": entity_id, "budget": budget}
        return _serialize(_list_payload(found, filters, league))

    return find_strategies
