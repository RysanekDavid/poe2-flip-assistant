"""Strategy KB store and the find_farm_strategies tool contract."""

import json
import shutil
from collections.abc import Callable
from pathlib import Path

import pytest
from langchain_core.utils.function_calling import convert_to_openai_tool

from src.config import Settings
from src.errors import ToolInvalidInput, ToolNoResult
from src.response import citations_are_valid
from src.schemas import EvidenceSource
from src.strategies import load_strategies
from src.tools import get_tools
from src.tools.engine_common import PAYLOAD_CAP_BYTES
from src.tools.strategies import build_strategy_tool

SETTINGS = Settings(_env_file=None)
STRATEGIES_DIR = SETTINGS.strategies_dir
CATALOG_PATH = SETTINGS.entity_catalog_path
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
    "strongbox-uniques",
)


def _invoke(**overrides: object) -> dict[str, object]:
    tool = build_strategy_tool(STRATEGIES_DIR, CATALOG_PATH)
    args: dict[str, object] = {"mechanic": None, "target_item": None, "budget": None, **overrides}
    return json.loads(tool.invoke(args))


def _ids(payload: dict[str, object]) -> list[str]:
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
    with pytest.raises(RuntimeError, match="missing"):
        load_strategies(tmp_path / "nowhere")


def _mk(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_filters_by_mechanic_item_and_budget() -> None:
    assert _ids(_invoke(mechanic="breach")) == ["breach-hiveblood"]
    assert _ids(_invoke(target_item="fracturing orbs")) == ["fracture-cleansed"]
    cheap = _invoke(budget="league_start")
    rows = cheap["strategies"]
    assert isinstance(rows, list) and rows
    assert all(row["budget"] == "league_start" for row in rows)
    everything = _invoke()
    assert everything["matches_total"] == len(EXPECTED_IDS)
    assert len(_ids(everything)) <= 4


def test_rows_carry_grades_stamps_and_bounded_poe2db_sources() -> None:
    payload = _invoke(target_item="Rakiata's Flow")
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    assert len(raw.encode("utf-8")) <= PAYLOAD_CAP_BYTES
    (row,) = payload["strategies"]
    assert row["id"] == "anomaly-lineage"
    assert row["status"] == "draft" and row["verified_against"] == "0.5.5"
    assert row["evidence_id"].startswith("S") and len(row["evidence_id"]) == 13
    assert 0 < len(row["poe2db_sources"]) <= 6
    assert all(url.startswith("https://poe2db.tw/us/") for url in row["poe2db_sources"])
    assert all(y.endswith("ss)") for y in row["yields"]), "single-source drop list stays graded"
    (ritual,) = _invoke(mechanic="ritual")["strategies"]
    assert any(line.startswith("waystone [uv]: ") for line in ritual["unsettled"])
    sources = [EvidenceSource.model_validate(s) for s in payload["sources"]]
    assert [s.id for s in sources] == [row["evidence_id"]]
    assert sources[0].type == "knowledge"
    assert citations_are_valid(f"Farm Manoki [{row['evidence_id']}].", sources)


def test_no_match_and_bad_items_fail_loudly() -> None:
    with pytest.raises(ToolNoResult) as no_match:
        _invoke(mechanic="breach", budget="league_start")
    assert "do not invent" in (no_match.value.public_detail or "")
    with pytest.raises(ToolNoResult):
        _invoke(target_item="Completely Imaginary Widget")
    with pytest.raises(ToolInvalidInput):
        _invoke(target_item=" x ")


def test_schema_is_strict_with_every_field_required_and_nullable() -> None:
    tool = build_strategy_tool(STRATEGIES_DIR, CATALOG_PATH)
    provider_tool = convert_to_openai_tool(tool, strict=True)["function"]
    schema = provider_tool["parameters"]
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == {"mechanic", "target_item", "budget"}
    for name in ("mechanic", "target_item", "budget"):
        assert {"type": "null"} in schema["properties"][name]["anyOf"], name


def test_tool_is_registered(item_catalog_manifest: Path) -> None:
    settings = Settings(_env_file=None, configured_item_catalog_path=item_catalog_manifest)
    assert "find_farm_strategies" in {tool.name for tool in get_tools(settings)}


def test_copy_of_real_dir_loads(tmp_path: Path) -> None:
    target = tmp_path / "copy"
    shutil.copytree(STRATEGIES_DIR, target)
    assert tuple(s.id for s in load_strategies(target)) == EXPECTED_IDS
