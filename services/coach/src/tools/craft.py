"""Craft margins: the curated recipes' stored EV reports, ranked the way the app ranks them.

Reports are written by the web app's craft poller (src/core/craftMargin.ts) into
`craft_margin_reports`, one row per (league, recipe). The poller scans under one shared account,
so reports exist only for the league it scanned; another league gets an honest "none here".
Every fresh, readable report is returned as a pick, a near-miss or unpriced (craftRank.ts), so an
answer with no profitable craft can still say which one is closest and what it would need.
"""

import json
import logging
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
    NearMiss,
    gate_reasons,
    rank_key,
    report_max_age_minutes,
    verdict_of,
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

logger = logging.getLogger("uvicorn.error")
DomainFilter = Literal["any", "jewel", "weapon", "jewellery", "armour"]
_EV_FORMULA = (
    "EV/attempt = curated hit rate × result value − base ask (p25) − materials; result value = "
    "trimmed median of the (up to 20) cheapest instant-buyout comparables matching the "
    "finished-item archetype, of the total listed"
)
_CAVEAT = (
    "Asks are observed trade listings, not sales; in a deep market the result median is its "
    "cheap end; hit rates are curated estimates, not measured probabilities."
)
# Unpriced rows carry the engine's error so the answer can say why; long multi-leg errors are cut
# here (marked with an ellipsis) so one row cannot push the ranked ones out of the byte cap.
_ERROR_CHARS = 160

_RankKey = tuple[int, float, int, str]


@dataclass
class _Triage:
    entries: list[tuple[_RankKey, dict[str, object]]] = field(default_factory=list)
    excluded: dict[str, int] = field(default_factory=lambda: {"stale": 0, "unreadable": 0})


@tool
def get_craft_margins(
    domain: DomainFilter, limit: int, league: Annotated[str, InjectedToolArg]
) -> str:
    """Return up to `limit` (1-8) curated craft recipes, best first, each with a `verdict`.

    Use for "what should I craft right now". `domain` narrows to jewel, weapon, jewellery or
    armour recipes, or "any". verdict "pick" = passes the app's confidence gate with positive
    EV (ordered by EV); "near_miss" = both legs priced but not a pick (ordered by margin), with
    cost, comparable result value and band, break-even vs curated hit rate, gap to profit,
    confidence and the `blocking` reasons; "unpriced" = a leg or material could not be priced,
    with the engine's error. Stale or unreadable reports are left out and counted in `excluded`.
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
    ranked = [entry for _, entry in sorted(triage.entries, key=lambda pair: pair[0])]
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
        "verdicts": _verdict_counts(ranked),
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


def _triage(rows: list[sqlite3.Row], domain: DomainFilter, now: datetime, max_age: int) -> _Triage:
    triage = _Triage()
    for row in rows:
        key = str(row["recipe_key"])
        meta = RECIPES.get(key)
        if domain != "any" and (meta is None or meta.domain != domain):
            continue
        report = _parse(key, str(row["report_json"]), log=not triage.excluded["unreadable"])
        if report is None:
            triage.excluded["unreadable"] += 1
        elif age_minutes(str(row["scanned_at"]), now) > max_age:
            triage.excluded["stale"] += 1
        else:
            triage.entries.append(_entry(key, row, report, now))
    return triage


def _parse(key: str, text: str, *, log: bool) -> MarginReport | None:
    """None for a row the app's schema would also reject; the first per call is logged."""
    try:
        return MarginReport.model_validate(json.loads(text))
    except json.JSONDecodeError as error:
        if log:
            logger.warning(
                "coach_craft_report_unreadable key=%s reason=json pos=%d", key, error.pos
            )
        return None
    except ValidationError as error:
        if log:
            first = error.errors()[0]
            logger.warning(
                "coach_craft_report_unreadable key=%s reason=schema loc=%s type=%s",
                key,
                ".".join(str(part) for part in first["loc"]),
                first["type"],
            )
        return None


def _entry(
    key: str, row: sqlite3.Row, report: MarginReport, now: datetime
) -> tuple[_RankKey, dict[str, object]]:
    meta = RECIPES.get(key)
    age = age_minutes(str(row["scanned_at"]), now)
    entry: dict[str, object] = {
        "key": key,
        "label": meta.label if meta else key,
        "domain": meta.domain if meta else None,
    }
    if report.status == "ok" and report.base is not None and report.result is not None:
        verdict = _priced_fields(entry, report, report.base, report.result)
    else:
        verdict = "unpriced"
        entry["verdict"] = verdict
        entry["status"] = report.status
        entry["error"] = _clip(report.error or "no error recorded")
    entry["scanned_age_min"] = age
    last_error_at = row["last_error_at"]
    if last_error_at is not None and parse_utc(str(last_error_at)) >= parse_utc(
        str(row["scanned_at"])
    ):
        entry["rescans_failing"] = True
    confidence = report.near_miss.confidence if report.near_miss else None
    rank = rank_key(verdict, report.ev_div, report.margin_pct, confidence, age, key)
    return rank, entry


def _priced_fields(
    entry: dict[str, object], report: MarginReport, base: LegReport, result: LegReport
) -> Literal["pick", "near_miss"]:
    reasons = gate_reasons(report, base, result)
    verdict = verdict_of(not reasons, report.ev_div, True)
    if verdict == "unpriced":
        raise RuntimeError("a priced report cannot rank as unpriced")
    entry.update(
        {
            "verdict": verdict,
            "ev_div": sig(report.ev_div),
            "margin_pct": round(report.margin_pct, 1),
            "hit_rate_curated_estimate": round(report.hit_rate, 3),
            "base_ask_div": sig(base.price_div),
            "result_median_div": sig(result.price_div),
            "materials_div": sig(report.materials_div),
            "depth": f"base {base.samples:g}/{base.total:g}, result {result.samples:g}/"
            f"{result.total:g} usable/listed" + (" (relaxed)" if result.relaxed else ""),
            "return_flagged": report.return_flagged,
        }
    )
    if report.near_miss is not None:
        entry.update(_near_miss_fields(report.near_miss))
    blocking = reasons + (["EV not positive"] if report.ev_div <= 0 else [])
    if blocking:
        entry["blocking"] = blocking
    return verdict


def _near_miss_fields(near_miss: NearMiss) -> dict[str, object]:
    return {
        "cost_div": sig(near_miss.cost_div),
        "result_band_div": [
            sig(near_miss.result_band_div.lo),
            sig(near_miss.result_band_div.hi),
        ],
        "break_even_hit_rate": round(near_miss.break_even_hit_rate, 3),
        "hit_rate_gap": round(near_miss.hit_rate_gap, 3),
        "result_needed_div": sig(near_miss.result_needed_div),
        "gap_div": sig(near_miss.gap_div),
        "confidence": near_miss.confidence,
    }


def _clip(text: str) -> str:
    return text if len(text) <= _ERROR_CHARS else text[: _ERROR_CHARS - 1] + "…"


def _verdict_counts(entries: list[dict[str, object]]) -> dict[str, int]:
    counts = {"pick": 0, "near_miss": 0, "unpriced": 0}
    for entry in entries:
        counts[str(entry["verdict"])] += 1
    return counts


def _raise_empty(triage: _Triage, league: str, domain: DomainFilter) -> NoReturn:
    excluded = triage.excluded
    if excluded["unreadable"] and not excluded["stale"]:
        raise ToolSourceUnavailable("Every stored craft report failed schema validation")
    counts = ", ".join(f"{count} {reason}" for reason, count in excluded.items() if count)
    raise ToolNoResult(
        f"No usable craft report for {league!r} in domain {domain!r}",
        public_detail=(
            f"No craft recipe in {league!r} (domain {domain}) has a current, readable report "
            f"({counts or 'no recipes in this domain'}). Say there is no craft margin evidence "
            "right now."
        ),
    )
