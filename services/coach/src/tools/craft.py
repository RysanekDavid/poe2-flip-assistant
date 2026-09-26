"""Craft margins: the curated recipes' stored EV reports, gated the way the app gates them.

Reports are written by the web app's craft poller (src/core/craftMargin.ts) into
`craft_margin_reports`, one row per (league, recipe). The poller scans under one shared account,
so reports exist only for the league it scanned; another league gets an honest "none here".
"""

import json
import sqlite3
from contextlib import closing
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Annotated, Literal, NoReturn

from langchain_core.tools import InjectedToolArg, tool
from pydantic import ValidationError

from src.config import get_settings
from src.errors import ToolNoResult, ToolSourceUnavailable
from src.tools.craft_gate import (
    RECIPES,
    LegReport,
    MarginReport,
    gate_reasons,
    report_max_age_minutes,
)
from src.tools.engine_common import (
    age_minutes,
    engine_source,
    fit_payload,
    parse_utc,
    sig,
    validated_limit,
)
from src.tools.sqlite_source import connect_read_only, raise_source_error

DomainFilter = Literal["any", "jewel", "weapon", "jewellery", "armour"]
_EV_FORMULA = (
    "EV per attempt = curated hit-rate estimate × result ask (p30 of floor-filtered listings) "
    "− base ask (p25) − materials"
)
_CAVEAT = (
    "Asks are observed trade listings, not sales; hit rates are curated estimates, not "
    "measured probabilities."
)


@dataclass
class _Triage:
    entries: list[dict[str, object]] = field(default_factory=list)
    excluded: dict[str, int] = field(
        default_factory=lambda: {"not_ok": 0, "stale": 0, "unreadable": 0}
    )


@tool
def get_craft_margins(
    domain: DomainFilter, limit: int, league: Annotated[str, InjectedToolArg]
) -> str:
    """Return up to `limit` (1-8) curated craft recipes ranked by expected Div per attempt.

    Use for "what should I craft right now". `domain` narrows to jewel, weapon, jewellery or
    armour recipes, or "any". Recipes passing the app's confidence gate come first; each row
    has EV, margin %, market depth behind both legs, and its gate reasons when it does not pass.
    """
    count = validated_limit(limit, 8)
    settings = get_settings()
    now = datetime.now(UTC)
    try:
        with closing(connect_read_only(settings.poe_db_path)) as connection:
            rows = _report_rows(connection, league)
    except sqlite3.Error as error:
        raise_source_error(error)
    max_age = report_max_age_minutes(settings.craft_margin_interval_min)
    triage = _triage(rows, domain, now, max_age)
    if not triage.entries:
        _raise_empty(triage, league, domain)
    ranked = sorted(
        triage.entries, key=lambda entry: (not entry["ranked"], -float(entry["ev_div"]))
    )
    newest = max(str(row["scanned_at"]) for row in rows)
    source = engine_source(
        f"craft|{league}|{newest}|{domain}",
        f"Craft margins: stored recipe EV reports, {league}",
    )
    payload: dict[str, object] = {
        "league": league,
        "computed_league": league,
        "observation_kind": "listed_trade_asks",
        "executable": False,
        "domain": domain,
        "ev_formula": _EV_FORMULA,
        "caveat": _CAVEAT,
        "stale_after_min": max_age,
        "excluded": triage.excluded,
        "recipes": ranked[:count],
        "evidence_id": source["id"],
        "sources": [source],
    }
    return fit_payload(payload, "recipes")


def _report_rows(connection: sqlite3.Connection, league: str) -> list[sqlite3.Row]:
    rows = connection.execute(
        """
        SELECT recipe_key, report_json, scanned_at, last_error_at
        FROM craft_margin_reports WHERE league = ? ORDER BY recipe_key
        """,
        (league,),
    ).fetchall()
    if rows:
        return rows
    others = [
        str(row["league"])
        for row in connection.execute(
            "SELECT DISTINCT league FROM craft_margin_reports ORDER BY league LIMIT 3"
        ).fetchall()
    ]
    where = f" They exist only for: {', '.join(others)}." if others else ""
    raise ToolNoResult(
        f"No craft margin reports for {league!r}",
        public_detail=(
            f"No craft-margin reports have been computed for the league {league!r}; the craft "
            f"scanner prices recipes only in the app's default league.{where} Say so and do "
            "not quote another league's craft EV as this league's."
        ),
    )


def _triage(
    rows: list[sqlite3.Row], domain: DomainFilter, now: datetime, max_age: int
) -> _Triage:
    triage = _Triage()
    for row in rows:
        key = str(row["recipe_key"])
        meta = RECIPES.get(key)
        if domain != "any" and (meta is None or meta.domain != domain):
            continue
        report = _parse(str(row["report_json"]))
        if report is None:
            triage.excluded["unreadable"] += 1
        elif report.status != "ok" or report.base is None or report.result is None:
            triage.excluded["not_ok"] += 1
        elif age_minutes(str(row["scanned_at"]), now) > max_age:
            triage.excluded["stale"] += 1
        else:
            triage.entries.append(_entry(key, row, report, report.base, report.result, now))
    return triage


def _parse(text: str) -> MarginReport | None:
    try:
        return MarginReport.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError):
        return None


def _entry(
    key: str,
    row: sqlite3.Row,
    report: MarginReport,
    base: LegReport,
    result: LegReport,
    now: datetime,
) -> dict[str, object]:
    meta = RECIPES.get(key)
    reasons = gate_reasons(report, base, result)
    entry: dict[str, object] = {
        "key": key,
        "label": meta.label if meta else key,
        "domain": meta.domain if meta else None,
        "ranked": not reasons,
        "ev_div": sig(report.ev_div),
        "margin_pct": round(report.margin_pct, 1),
        "hit_rate_curated_estimate": round(report.hit_rate, 3),
        "base_ask_div": sig(base.price_div),
        "result_ask_div": sig(result.price_div),
        "materials_div": sig(report.materials_div),
        "depth": f"base {base.samples:g}/{base.total:g}, result {result.samples:g}/{result.total:g}"
        " usable asks/listed",
        "return_flagged": report.return_flagged,
        "scanned_age_min": age_minutes(str(row["scanned_at"]), now),
    }
    if reasons:
        entry["gate_reasons"] = reasons
    last_error_at = row["last_error_at"]
    if last_error_at is not None and parse_utc(str(last_error_at)) >= parse_utc(
        str(row["scanned_at"])
    ):
        entry["rescans_failing"] = True
    return entry


def _raise_empty(triage: _Triage, league: str, domain: DomainFilter) -> NoReturn:
    excluded = triage.excluded
    if excluded["unreadable"] and not excluded["not_ok"] and not excluded["stale"]:
        raise ToolSourceUnavailable("Every stored craft report failed schema validation")
    counts = ", ".join(f"{count} {reason}" for reason, count in excluded.items() if count)
    raise ToolNoResult(
        f"No usable craft report for {league!r} in domain {domain!r}",
        public_detail=(
            f"No craft recipe in {league!r} (domain {domain}) has a current, successfully "
            f"priced report ({counts or 'no recipes in this domain'}). Say there is no craft "
            "margin evidence right now."
        ),
    )
