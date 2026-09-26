"""Snipe report: the latest autonomous snipe scan the app stored (src/core/autoSnipe.ts).

The scanner runs under one shared account in the app's default league and keeps a single
`autosnipe_report` row plus a separate `autosnipe_failure` row, so a transient failed scan never
wipes the last good findings. Neither row carries a league, so the report is served only to a
user whose league IS that default league.
"""

import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool
from pydantic import BaseModel, ConfigDict, ValidationError
from pydantic.alias_generators import to_camel

from src.config import get_settings
from src.errors import ToolNoResult, ToolSourceUnavailable
from src.league import resolve_default_league
from src.tools.engine_common import (
    age_minutes,
    engine_source,
    fit_payload,
    parse_utc,
    sig,
    validated_limit,
)
from src.tools.sqlite_source import connect_read_only, raise_source_error

_CAVEAT = (
    "Reference value = trimmed median of comparable instant-buyout asks, not sales; a listing "
    "may already be gone. Verify in-game before buying."
)


class _Stored(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, extra="ignore", strict=True)


class _Finding(_Stored):
    label: str
    item_name: str
    base_type: str
    key_mods: str
    online: bool
    price_div: float
    value_div: float
    margin_pct: float
    samples: float


class _ScanReport(_Stored):
    findings: list[_Finding]


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
        _require_scanned_league(league, resolve_default_league(settings))
        with closing(connect_read_only(settings.poe_db_path)) as connection:
            report = connection.execute(
                "SELECT report_json, scanned_at FROM autosnipe_report WHERE id = 1"
            ).fetchone()
            failure = connection.execute(
                "SELECT error, failed_at FROM autosnipe_failure WHERE id = 1"
            ).fetchone()
    except sqlite3.Error as error:
        raise_source_error(error)
    failing = _current_failure(report, failure)
    if report is None:
        raise ToolNoResult(
            "No stored snipe scan",
            public_detail=_no_scan_detail(failing is not None),
        )
    findings = _findings(str(report["report_json"]))
    scanned_at = str(report["scanned_at"])
    if not findings:
        raise ToolNoResult(
            "Latest snipe scan has no findings",
            public_detail=(
                f"The latest snipe scan ({age_minutes(scanned_at, now)} min ago) found no "
                "listing under the discount gate. Say nothing is flagged right now."
                + (" Newer scans are failing." if failing is not None else "")
            ),
        )
    return _payload(league, findings, scanned_at, failing, count, now)


def _require_scanned_league(league: str, scanned: str) -> None:
    if league != scanned:
        raise ToolNoResult(
            f"Snipe scan is not for {league!r}",
            public_detail=(
                f"The autonomous snipe scanner runs only in the app's default league "
                f"({scanned!r}), not in {league!r}. Say there is no snipe scan for this league; "
                "listings from another league cannot be bought here."
            ),
        )


def _current_failure(
    report: sqlite3.Row | None, failure: sqlite3.Row | None
) -> sqlite3.Row | None:
    """A failure matters only while it is newer than the last good report (as the UI shows it)."""
    if failure is None:
        return None
    if report is None:
        return failure
    newer = parse_utc(str(failure["failed_at"])) >= parse_utc(str(report["scanned_at"]))
    return failure if newer else None


def _no_scan_detail(failing: bool) -> str:
    base = "The autonomous snipe scanner has not stored a completed scan yet"
    tail = "; its latest attempt failed." if failing else "."
    return base + tail + " Say there is no snipe evidence right now."


def _findings(text: str) -> list[_Finding]:
    try:
        report = _ScanReport.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as error:
        raise ToolSourceUnavailable("Stored snipe report failed schema validation") from error
    # Best discount first; ties by item name so the order never depends on scan order.
    return sorted(report.findings, key=lambda finding: (-finding.margin_pct, finding.item_name))


def _payload(
    league: str,
    findings: list[_Finding],
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


def _finding(finding: _Finding) -> dict[str, object]:
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
