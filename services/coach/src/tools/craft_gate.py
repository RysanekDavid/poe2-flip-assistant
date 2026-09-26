"""Craft-report schema, metadata and confidence gate, mirrored from the web app's TypeScript.

The recipe list lives in src/core/craftRecipeData*.ts, the report schema in craftRecipes.ts
(`RecipeMarginReportSchema`), and the gate in craftValuation.ts (`rankGate`) plus craftReports.ts
(`reportMaxAgeMs`). Stored report JSON carries neither a recipe's label/domain nor its gate
verdict, so both are mirrored here; tests/test_engine_drift.py fails when the TypeScript side
changes without this file.
"""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

CraftDomain = Literal["jewel", "weapon", "jewellery", "armour"]


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
}

# craftValuation.ts gate constants.
GATE_MIN_TOTAL = 8
GATE_MIN_SAMPLES = 5
GATE_FLAGGED_MIN_RESULT_TOTAL = 20
RETURN_FLAG_MULTIPLE = 10


class _Stored(BaseModel):
    # strict: like zod, a numeric field stored as a string is a corrupt row, not a number.
    model_config = ConfigDict(alias_generator=to_camel, extra="ignore", strict=True)


class LegReport(_Stored):
    """The fields of one priced leg that the gate and the answer need."""

    price_div: float
    samples: float
    total: float
    search_url: str
    outliers_dropped: float
    unresolved_stats: list[str]


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
    valuation: Literal["legacy-cheapest", "floor-percentile"] = "legacy-cheapest"
    return_flagged: bool = False


def report_max_age_minutes(interval_min: int) -> int:
    """craftReports.ts reportMaxAgeMs: three full round-robin poller cycles over every recipe."""
    return 3 * interval_min * len(RECIPES)


def gate_reasons(report: MarginReport, base: LegReport, result: LegReport) -> list[str]:
    """rankGate() minus the status and staleness checks, which the caller applies as filters."""
    reasons: list[str] = []
    if report.valuation != "floor-percentile":
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
