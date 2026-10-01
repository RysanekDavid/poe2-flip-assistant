"""`find_farm_strategies`: curated atlas setups per mechanic from the strategy KB.

Reads src/data/poe2/strategies/*.json (the same files Farm › Strategies renders). Two modes keep
every answer complete under the shared payload cap: a list of ALL matching strategies (one short
row each), and the full detail of one strategy by id. Every fact keeps its claim grade and note, so
the model can tell a datamined fact from a lead; the files are deliberately not in the RAG corpus.
"""

import json
from pathlib import Path
from typing import Annotated

from langchain_core.tools import BaseTool, InjectedToolArg, tool
from pydantic import BaseModel, ConfigDict

from src.entities import EntityCatalog, get_entity_catalog
from src.errors import ToolInvalidInput, ToolNoResult
from src.evidence import evidence_id
from src.strategies import BUDGET_ORDER, BudgetTier, FarmStrategy, Mechanic, get_strategies
from src.strategies.models import RATING_MAX, Claim, Rating
from src.tools.engine_common import PAYLOAD_CAP_BYTES

#: One whole strategy, asked for by id, is the answer itself rather than one of many rows, so it
#: gets 1.5x the engine tools' list cap; still bounded, and sized for every file at boot.
DETAIL_CAP_BYTES = 6000
_MAX_SOURCES = 6
_TOP_YIELDS = 3
_POE2DB = "https://poe2db.tw/us/"
_CAVEAT = (
    "Curated drafts: relay status and verified_against. vp/vs backed, ss one source, syn our "
    "synthesis, uv/cf unsettled leads. Warn when checked_in_league is false."
)


class FarmStrategiesInput(BaseModel):
    """Strict model-facing contract: every field is required and nullable; league is injected."""

    model_config = ConfigDict(extra="forbid")

    mechanic: Mechanic | None
    target_item: str | None
    budget: BudgetTier | None
    strategy_id: str | None
    league: Annotated[str, InjectedToolArg]


def _claims(strategy: FarmStrategy) -> list[tuple[str, Claim]]:
    """Every graded fact with a short label, in card order."""
    master = strategy.atlas_master
    named: list[tuple[str, Claim]] = [
        ("budget", strategy.budget.claim),
        (f"master {master.master}", master.claim),
    ]
    named += [(f"node {n.name}", n.claim) for n in master.nodes]
    named += [(f"notable {p.name}", p.claim) for p in strategy.atlas_passives]
    named += [(f"mod {m.text}", m.claim) for t in strategy.tablets for m in t.mods]
    named += [("waystone", strategy.waystone.claim)]
    named += [(f"yield {y.ref.name}", y.claim) for y in strategy.yields]
    return named


def _claim_notes(strategy: FarmStrategy) -> list[str]:
    """Every noted claim (any grade), one line per distinct note so shared notes print once."""
    grouped: dict[tuple[str, str], list[str]] = {}
    for label, claim in _claims(strategy):
        if claim.note:
            grouped.setdefault((claim.v, claim.note), []).append(label)
    return [f"{'; '.join(labels)} [{v}]: {note}" for (v, note), labels in grouped.items()]


def _poe2db_sources(strategy: FarmStrategy) -> list[str]:
    urls = [p.poe2db_url for p in strategy.atlas_passives]
    urls += [url for _, claim in _claims(strategy) for url in claim.src if url.startswith(_POE2DB)]
    return list(dict.fromkeys(urls))[:_MAX_SOURCES]


def _strategy_evidence(strategy: FarmStrategy) -> str:
    return evidence_id("S", f"strategy|{strategy.id}|{strategy.patch.stamped_at}")


def _league_fields(strategy: FarmStrategy, league: str) -> dict[str, object]:
    checked = league in strategy.patch.leagues
    fields: dict[str, object] = {"checked_in_league": checked}
    if not checked:
        fields["league_note"] = (
            f"Checked in {', '.join(strategy.patch.leagues)}, not in {league}; "
            "some content may not drop there."
        )
    return fields


def _list_row(strategy: FarmStrategy, league: str) -> dict[str, object]:
    unsettled = sum(1 for _, claim in _claims(strategy) if not claim.settled)
    return {
        "id": strategy.id,
        "title": strategy.title,
        "mechanics": list(strategy.mechanics),
        "budget": strategy.budget.tier,
        "status": strategy.status,
        "top_yields": [y.ref.name for y in strategy.yields[:_TOP_YIELDS]],
        "unsettled_facts": unsettled,
        # The why lives once at payload level (league_note) and in detail mode, not per row.
        "checked_in_league": league in strategy.patch.leagues,
    }


def _rating_text(rating: Rating) -> str:
    """'3/5 [syn]', or 'unrated' when the sources supported no step."""
    return "unrated" if rating.value is None else f"{rating.value}/{RATING_MAX} [{rating.claim.v}]"


def _detail_row(strategy: FarmStrategy, league: str) -> dict[str, object]:
    master = strategy.atlas_master
    return {
        "id": strategy.id,
        "title": strategy.title,
        "status": strategy.status,
        "verified_against": strategy.patch.verified_against,
        "leagues": list(strategy.patch.leagues),
        **_league_fields(strategy, league),
        "mechanics": list(strategy.mechanics),
        "budget": strategy.budget.tier,
        "summary": strategy.summary,
        "ratings": {
            "build": _rating_text(strategy.ratings.build),
            "complexity": _rating_text(strategy.ratings.complexity),
        },
        "master": master.master,
        "master_nodes": [f"T{n.tier} {n.name}: {n.effect} [{n.claim.v}]" for n in master.nodes],
        "notables": [
            f"{p.name} ({p.priority}): {p.effect} [{p.claim.v}]" for p in strategy.atlas_passives
        ],
        "tablets": [
            {
                "type": t.type if t.unique is None else f"{t.unique} ({t.type})",
                "count": t.count,
                "mods": [f"{m.text} ({m.side}) [{m.claim.v}]" for m in t.mods],
            }
            for t in strategy.tablets
        ],
        "waystone_prefer": list(strategy.waystone.prefer),
        "yields": [f"{y.ref.name} ({y.role}) [{y.claim.v}]" for y in strategy.yields],
        "claim_notes": _claim_notes(strategy),
        "risks": list(strategy.risks),
        "evidence_id": _strategy_evidence(strategy),
        "poe2db_sources": _poe2db_sources(strategy),
    }


def _detail_payload(strategy: FarmStrategy, league: str) -> dict[str, object]:
    row = _detail_row(strategy, league)
    urls = _poe2db_sources(strategy)
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
    found: list[FarmStrategy], filters: dict[str, object], league: str
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
        "next_step": "Call with strategy_id (other filters null) for nodes, tablets and risks.",
        "matches_total": len(found),
        "strategies": [_list_row(s, league) for s in found],
        "evidence_id": source_id,
        "sources": [
            {
                "id": source_id,
                "type": "knowledge",
                "title": f"Strategy KB — {len(found)} curated farm strategies",
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


def _check_payload_sizes(strategies: tuple[FarmStrategy, ...]) -> None:
    """Fail at boot, not mid-conversation, when a data edit outgrows the tool payload cap.

    The full list is the largest list payload (every filter only removes rows); each detail
    payload is checked on its own. The probe league name is longer than any real one.
    """
    probe = "Hardcore SSF Forbidden Rites (probe league name)"
    filters: dict[str, object] = {
        "mechanic": "map_boss",
        "target_item": "omen-of-sinistral-exaltation",
        "budget": "league_start",
    }
    _serialize(_list_payload(list(strategies), filters, probe))
    for strategy in strategies:
        _serialize(_detail_payload(strategy, probe))


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


def _no_match(strategies: tuple[FarmStrategy, ...]) -> ToolNoResult:
    covered = sorted({m for s in strategies for m in s.mechanics})
    return ToolNoResult(
        "No strategy matches the filters",
        public_detail=(
            f"No curated strategy matches these filters. The strategy KB has {len(strategies)} "
            f"strategies covering: {', '.join(covered)}. Say so; do not invent a setup."
        ),
    )


def _detail(strategies: tuple[FarmStrategy, ...], strategy_id: str, league: str) -> str:
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

    @tool("find_farm_strategies", args_schema=FarmStrategiesInput)
    def find_farm_strategies(
        mechanic: Mechanic | None,
        target_item: str | None,
        budget: BudgetTier | None,
        strategy_id: str | None,
        league: str,
    ) -> str:
        """Find curated farm strategies (Atlas Master nodes, atlas notables, tablets and mods,
        waystone totals, yield basket), each fact with its evidence grade.

        Use for "how should I farm X / set up my atlas for Y / what can I farm with my budget".
        List mode (strategy_id null): every strategy matching mechanic, target_item (an item it
        should produce) and budget (league_start, mid or high = the most you can spend); pass
        null for any filter you skip. A single match comes back in detail mode directly.
        Detail mode: strategy_id from a list row, other filters null.
        """
        if strategy_id is not None:
            if mechanic is not None or target_item is not None or budget is not None:
                raise ToolInvalidInput("strategy_id selects detail mode; pass the filters as null")
            return _detail(strategies, strategy_id, league)
        entity_id = None if target_item is None else _resolve_item(catalog, target_item)
        found = [s for s in strategies if _matches(s, mechanic, entity_id, budget)]
        if not found:
            raise _no_match(strategies)
        if len(found) == 1:
            # The Coach has two tool rounds; a lone match must not cost one on a list call.
            return _serialize(_detail_payload(found[0], league))
        found.sort(key=lambda s: (BUDGET_ORDER.index(s.budget.tier), s.id))
        filters = {"mechanic": mechanic, "target_item": entity_id, "budget": budget}
        return _serialize(_list_payload(found, filters, league))

    return find_farm_strategies
