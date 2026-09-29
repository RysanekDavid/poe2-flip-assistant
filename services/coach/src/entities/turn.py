"""What this turn's tools said about entities: names they returned and live prices."""

import json
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.entities.catalog import EntityCatalog

logger = logging.getLogger("uvicorn.error")
_SQLITE_UTC = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")
_ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")
# Tools whose rows are market items by name; only the live poll carries a current price.
_ITEM_TOOLS = ("fetch_live_prices", "analyze_market_history")


@dataclass(frozen=True)
class ToolOutput:
    """One tool result of the active turn, reduced to what annotation needs."""

    name: str
    text: str


@dataclass(frozen=True)
class TurnEvidence:
    """Entity facts the tools of one turn established."""

    #: All tool output text, used to corroborate ambiguous one-word unique names.
    text: str = ""
    #: Entity ids the tools named, in first-seen order.
    entity_ids: tuple[str, ...] = ()
    #: Entity id → (Divine value, ISO-8601 UTC time) from the live price poll.
    prices: dict[str, tuple[float, str]] = field(default_factory=dict)


def iso_utc(value: object) -> str | None:
    """SQLite `YYYY-MM-DD HH:MM:SS` (UTC) or ISO-8601 → ISO-8601; anything else → None."""
    if not isinstance(value, str):
        return None
    if _SQLITE_UTC.match(value):
        return value.replace(" ", "T") + "Z"
    return value if _ISO_UTC.match(value) else None


def _payload(output: ToolOutput) -> dict[str, object] | None:
    try:
        payload = json.loads(output.text)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _item_rows(payload: dict[str, object]) -> list[dict[str, object]]:
    items = payload.get("items")
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def _entity_id(payload: dict[str, object]) -> str | None:
    entity = payload.get("entity")
    if isinstance(entity, dict) and isinstance(entity.get("id"), str):
        return str(entity["id"])
    return None


def _live_price(item: dict[str, object], entity_name: str) -> tuple[float, str] | None:
    value, at = item.get("value_div"), iso_utc(item.get("fetched_at"))
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0 and at:
        return float(value), at
    # Visible, not fatal: the chip still renders, just without a price.
    logger.warning("coach_entities live price unusable for %s: %r", entity_name, item)
    return None


def collect_turn_evidence(outputs: Sequence[ToolOutput], catalog: "EntityCatalog") -> TurnEvidence:
    """Resolve item names from market tools and ids from lookup_entity; keep live prices."""
    ids: list[str] = []
    prices: dict[str, tuple[float, str]] = {}
    for output in outputs:
        payload = _payload(output)
        if payload is None:
            continue
        direct = _entity_id(payload) if output.name == "lookup_entity" else None
        if direct is not None and catalog.get(direct) is not None and direct not in ids:
            ids.append(direct)
        if output.name not in _ITEM_TOOLS:
            continue
        for item in _item_rows(payload):
            row = catalog.resolve(str(item.get("item_name", "")))
            if row is None:
                continue
            if row.id not in ids:
                ids.append(row.id)
            if output.name == "fetch_live_prices":
                price = _live_price(item, row.name)
                if price is not None:
                    prices[row.id] = price
    text = "\n".join(output.text for output in outputs)
    return TurnEvidence(text=text, entity_ids=tuple(ids), prices=prices)
