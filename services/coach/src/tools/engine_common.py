"""Shared plumbing for the read-only tools over the app's own engines (flips, craft, snipe, farm).

Every engine tool answers from what the Node app already computed and persisted, returns one
compact JSON payload under a hard byte cap, and cites one market evidence source.
"""

import json
from datetime import UTC, datetime

from src.errors import ToolInvalidInput
from src.evidence import evidence_id

#: Hard cap per tool payload. Two tool rounds share one model context; an engine dump that grows
#: with the market must be trimmed here, deterministically, rather than by the provider.
PAYLOAD_CAP_BYTES = 4000


def validated_limit(limit: int, maximum: int) -> int:
    """Strict schemas cannot express ranges portably, so the body enforces them."""
    if not 1 <= limit <= maximum:
        raise ToolInvalidInput(f"limit must be between 1 and {maximum}")
    return limit


def parse_utc(stamp: str) -> datetime:
    """Parse SQLite CURRENT_TIMESTAMP text or ISO-8601; zone-less stamps are UTC by convention."""
    parsed = datetime.fromisoformat(stamp.strip().replace("Z", "+00:00"))
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def age_minutes(stamp: str, now: datetime) -> int:
    """Whole minutes since a stored timestamp (never negative: clocks of two processes drift)."""
    return max(0, int((now - parse_utc(stamp)).total_seconds() // 60))


def utc_iso(unix_seconds: int) -> str:
    """Render a unix second as a compact ISO-8601 UTC string."""
    return datetime.fromtimestamp(unix_seconds, UTC).strftime("%Y-%m-%dT%H:%MZ")


def sig(value: float | None, digits: int = 4) -> float | None:
    """Round to significant digits: a 0.00012 Div price and a 240 Ex price both stay readable."""
    if value is None:
        return None
    return float(f"{value:.{digits}g}")


def engine_source(prefix_identity: str, title: str) -> dict[str, object]:
    """One market evidence source per engine answer; identity includes league and data time."""
    return {
        "id": evidence_id("M", prefix_identity),
        "type": "market",
        "title": title,
        "url": None,
    }


def fit_payload(payload: dict[str, object], rows_key: str) -> str:
    """Serialize compactly, dropping trailing (lowest-ranked) rows until under the byte cap.

    Rows are ranked best-first by every caller, so trimming from the end keeps the answer's top
    and records how much was cut instead of silently truncating mid-JSON.
    """
    rows = payload.get(rows_key)
    if not isinstance(rows, list):
        raise RuntimeError(f"payload has no row list under {rows_key!r}")
    kept = list(rows)
    while True:
        body = {**payload, rows_key: kept}
        if len(rows) > len(kept):
            body["trimmed_rows"] = len(rows) - len(kept)
        text = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
        if len(text.encode("utf-8")) <= PAYLOAD_CAP_BYTES:
            return text
        if not kept:
            raise RuntimeError("engine payload exceeds the byte cap even without rows")
        kept.pop()
