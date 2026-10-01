"""Per-kind rows of the strategy tool: every graded fact, the list row and the detail row.

Kept apart from the tool binding (src/tools/strategies.py) so each kind's shape lives in one
place. Every fact keeps its claim grade; unverified (uv) and conflicting (cf) facts stay marked.
"""

from src.strategies.models import (
    RATING_MAX,
    Claim,
    Conversion,
    ConversionLeg,
    FarmStrategy,
    LiquidateStrategy,
    Rating,
    RollAndSellStrategy,
    Strategy,
    TradeLeg,
    TradeStrategy,
)

_MAX_SOURCES = 6
_POE2DB = "https://poe2db.tw/us/"


def _farm_claims(strategy: FarmStrategy) -> list[tuple[str, Claim]]:
    master = strategy.atlas_master
    named: list[tuple[str, Claim]] = [(f"master {master.master}", master.claim)]
    named += [(f"node {n.name}", n.claim) for n in master.nodes]
    named += [(f"notable {p.name}", p.claim) for p in strategy.atlas_passives]
    named += [(f"mod {m.text}", m.claim) for t in strategy.tablets for m in t.mods]
    named += [("waystone", strategy.waystone.claim)]
    return named + [(f"yield {y.ref.name}", y.claim) for y in strategy.yields]


def _roll_claims(strategy: RollAndSellStrategy) -> list[tuple[str, Claim]]:
    named: list[tuple[str, Claim]] = [(f"target {strategy.target.base}", strategy.target.claim)]
    named += [(f"mod {m.text}", m.claim) for m in strategy.target_mods]
    named += [(f"step {i + 1}", s.claim) for i, s in enumerate(strategy.roll_steps)]
    named += [(f"conversion {conversion_text(c)}", c.claim) for c in strategy.price_refs]
    return named + [("demand", strategy.demand.claim)]


def _leg_claims(prefix: str, legs: tuple[TradeLeg, ...]) -> list[tuple[str, Claim]]:
    return [(f"{prefix} {leg.text}", leg.claim) for leg in legs]


def claims(strategy: Strategy) -> list[tuple[str, Claim]]:
    """Every graded fact with a short label, in card order (the budget first)."""
    named: list[tuple[str, Claim]] = [
        ("budget", strategy.budget.claim),
        ("durability", strategy.durability.claim),
    ]
    match strategy:
        case FarmStrategy():
            return named + _farm_claims(strategy)
        case RollAndSellStrategy():
            return named + _roll_claims(strategy)
        case TradeStrategy():
            named += _leg_claims("input", strategy.inputs) + _leg_claims("output", strategy.outputs)
            named += [("odds", strategy.odds.claim)]
            return named + [
                (f"conversion {conversion_text(c)}", c.claim) for c in strategy.price_refs
            ]
        case LiquidateStrategy():
            return named + _leg_claims("item", strategy.items)


def conversion_text(conversion: Conversion) -> str:
    """'3 × Lesser Desert Rune → Desert Rune' (conversionLabel in kindHelpers.ts)."""

    def side(legs: tuple[ConversionLeg, ...]) -> str:
        return " + ".join(
            leg.ref.name if leg.qty == 1 else f"{leg.qty} × {leg.ref.name}" for leg in legs
        )

    return f"{side(conversion.inputs)} → {side(conversion.outputs)}"


def claim_notes(strategy: Strategy) -> list[str]:
    """Every noted claim (any grade), one line per distinct note so shared notes print once."""
    grouped: dict[tuple[str, str], list[str]] = {}
    for label, claim in claims(strategy):
        if claim.note:
            grouped.setdefault((claim.v, claim.note), []).append(label)
    return [f"{'; '.join(labels)} [{v}]: {note}" for (v, note), labels in grouped.items()]


def poe2db_sources(strategy: Strategy) -> list[str]:
    """Up to six distinct poe2db pages the strategy cites (notables first for a farm)."""
    urls = (
        [p.poe2db_url for p in strategy.atlas_passives]
        if isinstance(strategy, FarmStrategy)
        else []
    )
    urls += [url for _, claim in claims(strategy) for url in claim.src if url.startswith(_POE2DB)]
    return list(dict.fromkeys(urls))[:_MAX_SOURCES]


def rating_text(rating: Rating) -> str:
    """'3/5 [syn]', or 'unrated' when the sources supported no step."""
    return "unrated" if rating.value is None else f"{rating.value}/{RATING_MAX} [{rating.claim.v}]"


def _farm_detail(strategy: FarmStrategy) -> dict[str, object]:
    master = strategy.atlas_master
    return {
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
    }


def _roll_detail(strategy: RollAndSellStrategy) -> dict[str, object]:
    target = strategy.target
    return {
        "target": f"{target.base} ({'/'.join(target.rarity)}) [{target.claim.v}]",
        "target_mods": [f"{m.text} ({m.side}) [{m.claim.v}]" for m in strategy.target_mods],
        "roll_steps": [
            f"{s.action} ({', '.join(c.name for c in s.currencies) or 'no currency'}) [{s.claim.v}]"
            for s in strategy.roll_steps
        ],
        "sell_unit": strategy.sell_unit,
        "sell_item": strategy.sell_ref.name if strategy.sell_ref else None,
        "bench_conversions": [conversion_text(c) for c in strategy.price_refs],
        "demand": f"{strategy.demand.why} [{strategy.demand.claim.v}]",
    }


def _legs(legs: tuple[TradeLeg, ...]) -> list[str]:
    return [f"{leg.text} [{leg.claim.v}]" for leg in legs]


def _trade_detail(strategy: TradeStrategy) -> dict[str, object]:
    odds = strategy.odds
    loss = "unknown" if odds.loss_chance is None else f"{round(odds.loss_chance * 100)}%"
    return {
        "inputs": _legs(strategy.inputs),
        "outputs": _legs(strategy.outputs),
        "odds": f"{odds.text} (loss chance {loss}) [{odds.claim.v}]",
        "conversions": [conversion_text(c) for c in strategy.price_refs],
        "steps": list(strategy.steps),
    }


def kind_detail(strategy: Strategy) -> dict[str, object]:
    """The kind-specific half of a detail row."""
    match strategy:
        case FarmStrategy():
            return _farm_detail(strategy)
        case RollAndSellStrategy():
            return _roll_detail(strategy)
        case TradeStrategy():
            return _trade_detail(strategy)
        case LiquidateStrategy():
            return {
                "items": _legs(strategy.items),
                "sell_route": strategy.sell_route,
                "steps": list(strategy.steps),
            }
