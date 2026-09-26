"""Snipe report: the latest autonomous snipe scan the app stored (src/core/autoSnipe.ts).

The scanner keeps a single `autosnipe_report` row plus a separate `autosnipe_failure` row, so a
transient failed scan never wipes the last good findings. The report names the league it was
scanned in; it is served only when that league is the asking user's league, because a league
switch leaves the previous league's report in place until the next successful scan.
"""

import json
import logging
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool
from pydantic import BaseModel, ConfigDict, ValidationError
from pydantic.alias_generators import to_camel

from src.config import get_settings
from src.errors import ToolNoResult, ToolSourceUnavailable
from src.tools.engine_common import (
    age_minutes,
    engine_source,
    fit_payload,
    parse_utc,
    sig,
    validated_limit,
)
from src.tools.sqlite_source import connect_read_only, raise_source_error

logger = logging.getLogger("uvicorn.error")
_CAVEAT = (
    "Reference value = trimmed median of comparable instant-buyout asks, not sales; a listing "
    "may already be gone. Verify in-game before buying."
)
_FAILING_TAIL = " Newer scans are failing."
#: A report older than this many scan intervals no longer describes the listings on trade.
STALE_AFTER_INTERVALS = 3


class _Stored(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, extra="ignore", strict=True)


class SnipeFinding(_Stored):
    """The fields of a stored SnipeFinding the answer uses (seller identity is never read)."""

    label: str
    item_name: str
    base_type: str
    key_mods: str
    online: bool
    price_div: float
    value_div: float
    margin_pct: float
    samples: float


class ScanReport(_Stored):
    """A stored ScanReport. `league` is absent on reports written before it was stamped."""

    league: str | None = None
    findings: list[SnipeFinding]


@tool
def get_snipe_report(limit: int, league: Annotated[str, InjectedToolArg]) -> str:
    """Return up to `limit` (1-8) underpriced listings from the app's latest snipe scan.

    Use for "is there anything to snipe right now". Each finding has the ask, the reference
    value from comparable listings, the discount, how many comparables back it, and the scan age.
    """
    count = validated_limit(limit, 8)
    settings = get_settings()
    now = datetime.now(UTC)
    try:
        with closing(connect_read_only(settings.poe_db_path)) as connection:
            stored = connection.execute(
                "SELECT report_json, scanned_at FROM autosnipe_report WHERE id = 1"
            ).fetchone()
            failure = connection.execute(
                "SELECT error, failed_at FROM autosnipe_failure WHERE id = 1"
            ).fetchone()
    except sqlite3.Error as error:
        raise_source_error(error)
    failing = _current_failure(stored, failure)
    if stored is None:
        raise ToolNoResult("No stored snipe scan", public_detail=_no_scan_detail(failing))
    report = _parse(str(stored["report_json"]))
    scanned_at = str(stored["scanned_at"])
    _require_scanned_league(report, league)
    _require_fresh(
        scanned_at, now, STALE_AFTER_INTERVALS * settings.autosnipe_interval_min, failing
    )
    if not report.findings:
        raise ToolNoResult(
            "Latest snipe scan has no findings",
            public_detail=(
                f"The latest snipe scan ({age_minutes(scanned_at, now)} min ago) found no "
                "listing under the discount gate. Say nothing is flagged right now."
                + _FAILING_TAIL
                * (failing is not None)
            ),
        )
    return _payload(league, _ranked(report.findings), scanned_at, failing, count, now)


def _parse(text: str) -> ScanReport:
    try:
        return ScanReport.model_validate(json.loads(text))
    except json.JSONDecodeError as error:
        logger.warning("coach_snipe_report_unreadable reason=json pos=%d", error.pos)
        raise ToolSourceUnavailable("Stored snipe report is not JSON") from error
    except ValidationError as error:
        first = error.errors()[0]
        logger.warning(
            "coach_snipe_report_unreadable reason=schema loc=%s type=%s",
            ".".join(str(part) for part in first["loc"]),
            first["type"],
        )
        raise ToolSourceUnavailable("Stored snipe report failed schema validation") from error


def _require_scanned_league(report: ScanReport, league: str) -> None:
    if report.league == league:
        return
    scanned = (
        f"the league {report.league!r}"
        if report.league is not None
        else "an unrecorded league (the report predates league stamping)"
    )
    raise ToolNoResult(
        f"Snipe report is not for {league!r}",
        public_detail=(
            f"The latest stored snipe scan ran in {scanned}, not in {league!r}. Say there is no "
            "snipe scan for this league; listings from another league cannot be bought here."
        ),
    )


def _require_fresh(
    scanned_at: str, now: datetime, max_age_min: int, failing: sqlite3.Row | None
) -> None:
    age = age_minutes(scanned_at, now)
    if age > max_age_min:
        raise ToolNoResult(
            f"Snipe report is {age} min old",
            public_detail=(
                f"The latest successful snipe scan is {age} min old (stale after "
                f"{max_age_min} min), so its listings are likely gone. Say the snipe scanner "
                "has no current results." + _FAILING_TAIL * (failing is not None)
            ),
        )


def _current_failure(report: sqlite3.Row | None, failure: sqlite3.Row | None) -> sqlite3.Row | None:
    """A failure matters only while it is newer than the last good report (as the UI shows it)."""
    if failure is None:
        return None
    if report is None:
        return failure
    newer = parse_utc(str(failure["failed_at"])) >= parse_utc(str(report["scanned_at"]))
    return failure if newer else None


def _no_scan_detail(failing: sqlite3.Row | None) -> str:
    base = "The autonomous snipe scanner has not stored a completed scan yet"
    tail = "; its latest attempt failed." if failing is not None else "."
    return base + tail + " Say there is no snipe evidence right now."


def _ranked(findings: list[SnipeFinding]) -> list[SnipeFinding]:
    # Best discount first; ties by item name so the order never depends on scan order.
    return sorted(findings, key=lambda finding: (-finding.margin_pct, finding.item_name))


def _payload(
    league: str,
    findings: list[SnipeFinding],
    scanned_at: str,
    failing: sqlite3.Row | None,
    count: int,
    now: datetime,
) -> str:
    source = engine_source(
        f"snipe|{league}|{scanned_at}", f"Snipe scan: underpriced listings, {league}"
    )
    payload: dict[str, object] = {
        "league": league,
        "observation_kind": "listed_trade_asks",
        "executable": False,
        "scan_utc": scanned_at,
        "scan_age_min": age_minutes(scanned_at, now),
        "listing_age": "not recorded per finding; each was listed when the scan above ran",
        "instant_buyout": True,
        "caveat": _CAVEAT,
        "findings_total": len(findings),
        "findings": [_finding(finding) for finding in findings[:count]],
        "evidence_id": source["id"],
        "sources": [source],
    }
    if failing is not None:
        payload["newer_scan_failed_at"] = str(failing["failed_at"])
    return fit_payload(payload, "findings")


def _finding(finding: SnipeFinding) -> dict[str, object]:
    return {
        "item": finding.item_name,
        "base_type": finding.base_type,
        "archetype": finding.label,
        "key_mods": finding.key_mods,
        "ask_div": sig(finding.price_div),
        "reference_value_div": sig(finding.value_div),
        "discount_pct": round(finding.margin_pct, 1),
        "comparables": int(finding.samples),
        "seller_online": finding.online,
    }
