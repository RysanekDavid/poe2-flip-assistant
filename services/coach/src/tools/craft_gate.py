"""Craft-report schema, metadata and confidence gate, mirrored from the web app's TypeScript.

The recipe list lives in src/core/craftRecipeData*.ts, the report schema in craftRecipes.ts
(`RecipeMarginReportSchema`, `NearMissSchema`), the gate in craftValuation.ts (`rankGate`) plus
craftReports.ts (`reportMaxAgeMs`), and the three-tier ordering in craftRank.ts. Stored report
JSON carries neither a recipe's label/domain nor its gate verdict, so both are mirrored here;
tests/test_engine_drift.py fails when the TypeScript side changes without this file.
"""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

CraftDomain = Literal["jewel", "weapon", "jewellery", "armour"]
Valuation = Literal["legacy-cheapest", "floor-percentile", "comparable-result"]
Confidence = Literal["high", "medium", "low"]
Verdict = Literal["pick", "near_miss", "unpriced"]


@dataclass(frozen=True)
class RecipeMeta:
    """Static identity of one curated recipe."""

    label: str
    domain: CraftDomain


RECIPES: dict[str, RecipeMeta] = {
    "jewel_suffix_push": RecipeMeta("Time-Lost jewel · +1 suffix push", "jewel"),
    "bow_amanamu": RecipeMeta("Bow · phys crit + Amanamu AS", "weapon"),
    "ring_catalysing_exalt": RecipeMeta("Ring · Tul's catalysed exalt", "jewellery"),
    "amulet_fracture_plus3": RecipeMeta("Amulet · fracture the +3", "jewellery"),
    "focus_rathpith_gamble": RecipeMeta("Rathpith Globe · cultivation gamble", "weapon"),
    "boots_putrefaction": RecipeMeta("Boots · putrefaction ES (caster)", "armour"),
    "boots_putrefaction_ev": RecipeMeta("Boots · putrefaction EV (attack)", "armour"),
    "armour_putrefaction": RecipeMeta("Body Armour · putrefaction ES", "armour"),
    "gloves_projectile_plus2": RecipeMeta("Gloves · +2 Projectile Skills", "armour"),
    "wand_alloy_crystallisation": RecipeMeta("Wand · alloy crystallisation (budget)", "weapon"),
    "amulet_giga_spirit": RecipeMeta("Amulet · giga Spirit", "jewellery"),
    "quarterstaff_desecrate_crit": RecipeMeta("Quarterstaff · desecrate-first crit", "weapon"),
    "amulet_desecrated_beginner": RecipeMeta("Amulet · beginner desecrated", "jewellery"),
    "ring_fractured_t1res": RecipeMeta("Ring · fractured flat + T1 res (high-end)", "jewellery"),
    "jewel_liquid_5mod_budget": RecipeMeta("Sapphire · Contempt 5-mod (budget)", "jewel"),
    "jewel_fractured_5mod": RecipeMeta("Sapphire · fractured 5-mod (high-end)", "jewel"),
    "helmet_tiara_es": RecipeMeta("Helmet · Tiara ES essence + desecrated", "armour"),
    "armour_vile_robe_spirit": RecipeMeta("Body Armour · Vile Robe Spirit essence", "armour"),
    "armour_vile_robe_es": RecipeMeta("Body Armour · Vile Robe ES essence", "armour"),
    "quiver_putrefaction": RecipeMeta("Quiver · putrefaction bow damage", "weapon"),
    "crossbow_sovereign_ballista": RecipeMeta("Crossbow · Sovereign ballista", "weapon"),
    "ring_breach_mana_stacker": RecipeMeta("Ring · Breach mana stacker", "jewellery"),
    "jewel_timelost_fractured_radius": RecipeMeta(
        "Time-Lost Sapphire · fractured Large radius", "jewel"
    ),
    "amulet_plus3_spirit_chaos": RecipeMeta("Amulet · fractured +3 + chaos Spirit", "jewellery"),
    "amulet_plus4_breach_quality": RecipeMeta(
        "Amulet · +4 Spell quality tech (unverified)", "jewellery"
    ),
}

# craftValuation.ts gate constants.
GATE_MIN_TOTAL = 8
GATE_MIN_SAMPLES = 5
GATE_FLAGGED_MIN_RESULT_TOTAL = 12
RETURN_FLAG_MULTIPLE = 10


class _Stored(BaseModel):
    # strict: like zod, a numeric field stored as a string is a corrupt row, not a number.
    model_config = ConfigDict(alias_generator=to_camel, extra="ignore", strict=True)


class _Band(_Stored):
    p25: float
    p50: float
    p75: float


class LegReport(_Stored):
    """The fields of one priced leg that the gate and the answer need."""

    price_div: float
    samples: float
    total: float
    search_url: str
    outliers_dropped: float
    unresolved_stats: list[str]
    method: Literal["floor-percentile", "comparable-median"] = "floor-percentile"
    band: _Band | None = None
    relaxed: bool = False


class _BandDiv(_Stored):
    lo: float
    hi: float


class NearMiss(_Stored):
    """craftRecipes.ts NearMissSchema: how far a priced recipe is from profit."""

    cost_div: float
    result_median_div: float
    result_band_div: _BandDiv
    ev_div: float
    ev_low_div: float
    break_even_hit_rate: float
    model_hit_rate: float
    hit_rate_gap: float
    result_needed_div: float
    gap_div: float
    confidence: Confidence


class MarginReport(_Stored):
    """A stored RecipeMarginReport; rows that do not parse are unreadable, never guessed at."""

    key: str
    status: Literal["ok", "missing-materials", "leg-failed"]
    base: LegReport | None
    result: LegReport | None
    # Validated only as present, like the app's schema requires; lines are not read here.
    materials: list[object]
    materials_div: float
    hit_rate: float
    ev_div: float
    margin_pct: float
    error: str | None
    valuation: Valuation = "legacy-cheapest"
    return_flagged: bool = False
    near_miss: NearMiss | None = None


def report_max_age_minutes(interval_min: int) -> int:
    """craftReports.ts reportMaxAgeMs: three full round-robin poller cycles over every recipe."""
    return 3 * interval_min * len(RECIPES)


def gate_reasons(report: MarginReport, base: LegReport, result: LegReport) -> list[str]:
    """rankGate() minus the status and staleness checks, which the caller applies as filters."""
    reasons: list[str] = []
    # Only comparable-result reports value the result against finished-item comparables; a
    # floor-percentile report priced it at p30 of a loose one-mod search, so it waits for a rescan.
    if report.valuation != "comparable-result":
        reasons.append("legacy valuation — awaiting rescan")
    if report.return_flagged and result.total < GATE_FLAGGED_MIN_RESULT_TOTAL:
        reasons.append(
            f"return >{RETURN_FLAG_MULTIPLE}× cost needs ≥{GATE_FLAGGED_MIN_RESULT_TOTAL} "
            f"result listings ({result.total:g})"
        )
    for name, leg in (("base", base), ("result", result)):
        if leg.total < GATE_MIN_TOTAL:
            reasons.append(f"{name}: only {leg.total:g} listed (need {GATE_MIN_TOTAL})")
        if leg.samples < GATE_MIN_SAMPLES:
            reasons.append(f"{name}: only {leg.samples:g} usable asks (need {GATE_MIN_SAMPLES})")
        if leg.outliers_dropped >= leg.samples:
            reasons.append(f"{name}: more asks dropped as bait than kept")
        if leg.unresolved_stats:
            reasons.append(f"{name}: search widened (unresolved stats)")
    return reasons


_TIER: dict[Verdict, int] = {"pick": 0, "near_miss": 1, "unpriced": 2}
_CONFIDENCE_ORDER: dict[Confidence, int] = {"high": 0, "medium": 1, "low": 2}


def verdict_of(gate_ok: bool, ev_div: float, priced: bool) -> Verdict:
    """craftRank.ts verdictOf: priced means both legs priced in an "ok" report."""
    if not priced:
        return "unpriced"
    return "pick" if gate_ok and ev_div > 0 else "near_miss"


def rank_key(
    verdict: Verdict,
    ev_div: float,
    margin_pct: float,
    confidence: Confidence | None,
    scanned_age_min: int,
    key: str,
) -> tuple[int, float, int, str]:
    """craftRank.ts rankCandidates as one sort key, on the unrounded report values.

    Picks by EV desc; near-misses by margin % desc then confidence (missing = low); unpriced by
    most recent scan first. The recipe key breaks every tie, as in TypeScript.
    """
    if verdict == "pick":
        return (_TIER[verdict], -ev_div, 0, key)
    if verdict == "near_miss":
        return (_TIER[verdict], -margin_pct, _CONFIDENCE_ORDER[confidence or "low"], key)
    return (_TIER[verdict], float(scanned_age_min), 0, key)
