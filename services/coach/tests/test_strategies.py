"""Strategy KB store and the find_farm_strategies tool contract."""

import json
import re
import shutil
from collections.abc import Callable
from pathlib import Path

import pytest
from langchain_core.utils.function_calling import convert_to_openai_tool
from pydantic import ValidationError

from src.config import Settings
from src.errors import ToolInvalidInput, ToolNoResult
from src.response import citations_are_valid
from src.schemas import EvidenceSource
from src.strategies import load_strategies
from src.strategies.models import Claim
from src.tools import get_tools
from src.tools.engine_common import PAYLOAD_CAP_BYTES
from src.tools.strategies import build_strategy_tool

SETTINGS = Settings(_env_file=None)
STRATEGIES_DIR = SETTINGS.strategies_dir
CATALOG_PATH = SETTINGS.entity_catalog_path
LEAGUE = "Forbidden Rites"
EXPECTED_IDS = (
    "abyss-depths-omens",
    "anomaly-lineage",
    "boss-rush-overseer",
    "breach-hiveblood",
    "delirium-grand-mirror",
    "essence-overlord",
    "expedition-grand",
    "fracture-cleansed",
    "ritual-omens",
    "ritual-wildwood-blooms",
    "strongbox-uniques",
    "trial-of-chaos-fates",
)


def _invoke(**overrides: object) -> dict[str, object]:
    tool = build_strategy_tool(STRATEGIES_DIR, CATALOG_PATH)
    args: dict[str, object] = {
        "mechanic": None,
        "target_item": None,
        "budget": None,
        "strategy_id": None,
        "league": LEAGUE,
        **overrides,
    }
    return json.loads(tool.invoke(args))


def _ids(payload: dict[str, object]) -> list[str]:
    if payload["mode"] == "detail":
        detail = payload["strategy"]
        assert isinstance(detail, dict)
        return [detail["id"]]
    rows = payload["strategies"]
    assert isinstance(rows, list)
    return [row["id"] for row in rows]


def test_committed_strategies_load_and_are_drafts_verified_against_055() -> None:
    strategies = load_strategies(STRATEGIES_DIR)

    assert tuple(s.id for s in strategies) == EXPECTED_IDS
    assert all(s.status == "draft" and s.patch.verified_against == "0.5.5" for s in strategies)
    unsettled = [c for s in strategies for c in _claims(s.model_dump()) if c["v"] in ("uv", "cf")]
    assert unsettled and all(c.get("note") for c in unsettled)


def _claims(value: object) -> list[dict[str, object]]:
    if isinstance(value, dict):
        own = [value["claim"]] if isinstance(value.get("claim"), dict) else []
        return own + [c for k, v in value.items() if k != "claim" for c in _claims(v)]
    if isinstance(value, (list, tuple)):
        return [c for v in value for c in _claims(v)]
    return []


def _copy_one(
    tmp_path: Path, name: str, mutate: Callable[[dict[str, object]], None] | None = None
) -> Path:
    source = json.loads((STRATEGIES_DIR / "fracture-cleansed.json").read_text(encoding="utf-8"))
    if mutate is not None:
        mutate(source)
    (tmp_path / name).write_text(json.dumps(source), encoding="utf-8")
    return tmp_path


def test_store_fails_loudly_on_every_defect(tmp_path: Path) -> None:
    def unknown_key(data: dict[str, object]) -> None:
        data["extra"] = 1

    def one_source_vs(data: dict[str, object]) -> None:
        yields = data["yields"]
        assert isinstance(yields, list)
        yields[0]["claim"] = {"v": "vs", "src": ["https://poe2db.tw/us/Hidden_Scars"]}

    with pytest.raises(RuntimeError, match="must equal the filename"):
        load_strategies(_copy_one(_mk(tmp_path / "a"), "renamed.json"))
    with pytest.raises(RuntimeError, match="invalid"):
        load_strategies(_copy_one(_mk(tmp_path / "b"), "fracture-cleansed.json", unknown_key))
    with pytest.raises(RuntimeError, match="invalid"):
        load_strategies(_copy_one(_mk(tmp_path / "c"), "fracture-cleansed.json", one_source_vs))
    with pytest.raises(RuntimeError, match="No strategy files"):
        load_strategies(_mk(tmp_path / "d"))
    for name, mutate in _RATING_DEFECTS.items():
        with pytest.raises(RuntimeError, match="invalid"):
            load_strategies(_copy_one(_mk(tmp_path / name), "fracture-cleansed.json", mutate))
    with pytest.raises(RuntimeError, match="missing"):
        load_strategies(tmp_path / "nowhere")


def _ratings(data: dict[str, object]) -> dict[str, dict[str, object]]:
    ratings = data["ratings"]
    assert isinstance(ratings, dict)
    return ratings


def _rated_without_source(data: dict[str, object]) -> None:
    _ratings(data)["build"]["claim"] = {"v": "syn", "src": [], "note": "no source"}


def _six_of_five(data: dict[str, object]) -> None:
    _ratings(data)["complexity"]["value"] = 6


def _budget_without_source(data: dict[str, object]) -> None:
    budget = data["budget"]
    assert isinstance(budget, dict)
    budget["claim"] = {"v": "syn", "src": [], "note": "no source"}


def _schema_v1(data: dict[str, object]) -> None:
    data["schema_version"] = 1


_RATING_DEFECTS: dict[str, Callable[[dict[str, object]], None]] = {
    "rated-no-source": _rated_without_source,
    "six-of-five": _six_of_five,
    "budget-no-source": _budget_without_source,
    "schema-v1": _schema_v1,
}


def test_ratings_are_sourced_and_an_unrated_value_needs_none(tmp_path: Path) -> None:
    for strategy in load_strategies(STRATEGIES_DIR):
        assert strategy.budget.claim.src, strategy.id
        for rating in (strategy.ratings.build, strategy.ratings.complexity):
            assert rating.value is None or rating.claim.src, strategy.id

    def unrated(data: dict[str, object]) -> None:
        _ratings(data)["build"] = {
            "value": None,
            "why": "No source says how hard it is.",
            "claim": {"v": "uv", "src": [], "note": "unrated"},
        }

    loaded = load_strategies(_copy_one(_mk(tmp_path / "u"), "fracture-cleansed.json", unrated))
    assert loaded[0].ratings.build.value is None
    detail = _invoke(strategy_id="anomaly-lineage")["strategy"]
    assert set(detail["ratings"]) == {"build", "complexity"}
    for text in detail["ratings"].values():
        assert text == "unrated" or re.fullmatch(r"[1-5]/5 \[(vp|vs|ss|uv|cf|syn)\]", text), text


def _mk(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_list_mode_returns_every_match_under_the_cap() -> None:
    assert _ids(_invoke(mechanic="breach")) == ["breach-hiveblood"]
    assert _ids(_invoke(target_item="fracturing orbs")) == ["fracture-cleansed"]
    for filters in ({"budget": "league_start"}, {"mechanic": "map_boss"}, {}):
        payload = _invoke(**filters)
        rows = payload["strategies"]
        assert isinstance(rows, list) and rows
        assert len(rows) == payload["matches_total"], filters
        assert "trimmed_rows" not in payload
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        assert len(raw.encode("utf-8")) <= PAYLOAD_CAP_BYTES
    assert all(
        row["budget"] == "league_start" for row in _invoke(budget="league_start")["strategies"]
    )
    assert len(_ids(_invoke())) == len(EXPECTED_IDS)
    listed = _invoke()
    sources = [EvidenceSource.model_validate(s) for s in listed["sources"]]
    assert [s.id for s in sources] == [listed["evidence_id"]]
    assert citations_are_valid(f"Twelve setups [{listed['evidence_id']}].", sources)


def test_detail_mode_carries_grades_notes_risks_and_bounded_sources() -> None:
    payload = _invoke(strategy_id="anomaly-lineage")
    assert payload["mode"] == "detail"
    row = payload["strategy"]
    assert row["status"] == "draft" and row["verified_against"] == "0.5.5"
    assert row["checked_in_league"] is True and "league_note" not in row
    assert row["evidence_id"].startswith("S") and len(row["evidence_id"]) == 13
    assert 0 < len(row["poe2db_sources"]) <= 6
    assert all(url.startswith("https://poe2db.tw/us/") for url in row["poe2db_sources"])
    assert all(y.endswith("[ss]") for y in row["yields"]), "single-source drop list stays graded"
    assert row["risks"] and any("Deadly" in risk for risk in row["risks"])
    notes = row["claim_notes"]
    assert any(line.startswith("mod ") and "[vp]: " in line for line in notes), "vp notes too"
    strongbox = _invoke(strategy_id="strongbox-uniques")["strategy"]
    assert any(line.startswith("waystone [uv]: ") for line in strongbox["claim_notes"])
    sources = [EvidenceSource.model_validate(s) for s in payload["sources"]]
    assert [s.id for s in sources] == [row["evidence_id"]] and sources[0].type == "knowledge"
    assert citations_are_valid(f"Farm Manoki [{row['evidence_id']}].", sources)
    with pytest.raises(ToolInvalidInput):
        _invoke(strategy_id="anomaly-lineage", mechanic="anomaly")
    with pytest.raises(ToolNoResult):
        _invoke(strategy_id="no-such-strategy")


def test_rows_flag_a_league_the_strategy_was_not_checked_in() -> None:
    other = "Runes of Aldur"
    listed = _invoke(budget="mid", league=other)
    rows = {row["id"]: row for row in listed["strategies"]}
    assert rows["expedition-grand"]["checked_in_league"] is False
    assert other in listed["league_note"]
    assert _invoke(budget="mid")["league_note"] is None
    detail = _invoke(mechanic="expedition", league=other)
    assert detail["mode"] == "detail", "a single match skips the list round"
    assert detail["strategy"]["checked_in_league"] is False
    assert "Forbidden Rites" in detail["strategy"]["league_note"]


def test_trial_of_chaos_is_a_mechanic_without_atlas_setup() -> None:
    detail = _invoke(mechanic="trial_of_chaos")
    assert detail["mode"] == "detail", "the only Trial of Chaos strategy comes back as detail"
    row = detail["strategy"]
    assert row["id"] == "trial-of-chaos-fates"
    assert row["master"] == "any" and row["master_nodes"] == [] and row["tablets"] == []
    assert row["waystone_prefer"] == []
    assert _ids(_invoke(mechanic="ritual")) == ["ritual-omens", "ritual-wildwood-blooms"]


def test_oversized_data_fails_at_tool_build(tmp_path: Path) -> None:
    def bloat(data: dict[str, object]) -> None:
        data["risks"] = [f"risk {i} " + "x" * 200 for i in range(30)]

    with pytest.raises(RuntimeError, match="exceeds"):
        build_strategy_tool(
            _copy_one(_mk(tmp_path / "big"), "fracture-cleansed.json", bloat), CATALOG_PATH
        )


def test_no_match_and_bad_items_fail_loudly() -> None:
    with pytest.raises(ToolNoResult) as no_match:
        _invoke(mechanic="breach", budget="league_start")
    assert "do not invent" in (no_match.value.public_detail or "")
    with pytest.raises(ToolNoResult):
        _invoke(target_item="Completely Imaginary Widget")
    with pytest.raises(ToolInvalidInput):
        _invoke(target_item=" x ")


def test_claim_note_null_is_rejected_like_zod_optional() -> None:
    with pytest.raises(ValidationError):
        Claim.model_validate({"v": "uv", "src": [], "note": None})
    assert Claim.model_validate({"v": "uv", "src": []}).note is None


def test_claim_rejects_rmt_shop_sources_like_zod() -> None:
    for url in ("https://www.poecurrency.com/news/x", "https://iggm.com/news/y"):
        with pytest.raises(ValidationError):
            Claim.model_validate({"v": "ss", "src": [url]})
    primary = "https://poe2db.tw/us/Omen_of_Light"
    assert Claim.model_validate({"v": "ss", "src": [primary]}).v == "ss"


def test_schema_is_strict_with_every_field_required_and_nullable() -> None:
    tool = build_strategy_tool(STRATEGIES_DIR, CATALOG_PATH)
    provider_tool = convert_to_openai_tool(tool, strict=True)["function"]
    schema = provider_tool["parameters"]
    visible = {"mechanic", "target_item", "budget", "strategy_id"}
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == visible == set(schema["properties"])
    for name in visible:
        assert {"type": "null"} in schema["properties"][name]["anyOf"], name
    assert "league" in tool.get_input_schema().model_fields, "league is injected, never model-set"


def test_tool_is_registered(item_catalog_manifest: Path) -> None:
    settings = Settings(_env_file=None, configured_item_catalog_path=item_catalog_manifest)
    assert "find_farm_strategies" in {tool.name for tool in get_tools(settings)}


def test_copy_of_real_dir_loads(tmp_path: Path) -> None:
    target = tmp_path / "copy"
    shutil.copytree(STRATEGIES_DIR, target)
    assert tuple(s.id for s in load_strategies(target)) == EXPECTED_IDS
