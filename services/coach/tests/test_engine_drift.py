"""Pin every value the engine tools mirror from TypeScript to its TypeScript source.

The engine tools read what the Node app persisted, but a few tables and constants cannot be read
from the database (recipe labels, the craft gate, FarmAdvisor's tables, freshness windows). Each
is mirrored in Python; these tests fail when either side changes alone.
"""

import re
from pathlib import Path

import pytest
from langchain_core.utils.function_calling import convert_to_openai_tool

from src.config import APP_ROOT, Settings
from src.tools import craft_gate, farm_tables, flips, get_tools

_ENGINE_TOOLS = {"get_top_flips", "get_craft_margins", "get_snipe_report", "get_farm_advice"}


def _ts(relative: str) -> str:
    return (APP_ROOT / relative).read_text(encoding="utf-8")


def _const(source: str, name: str) -> str:
    match = re.search(rf"(?:export )?const {name} = ([^;]+);", source)
    assert match is not None, f"{name} not found"
    return match.group(1).strip()


def test_recipe_identity_matches_the_typescript_recipe_data() -> None:
    pattern = re.compile(
        r'^    key: "([^"]+)",\n    domain: "([^"]+)",\n(?:    (?!label:)[^\n]*\n)*?'
        r'    label: "([^"]+)",',
        re.MULTILINE,
    )
    found: dict[str, tuple[str, str]] = {}
    for name in ("craftRecipeData.ts", "craftRecipeData2.ts"):
        source = _ts(f"src/core/{name}")
        matches = pattern.findall(source)
        # Every recipe object must be parsed; a formatting change must not silently drop one.
        assert len(matches) == len(re.findall(r"^    key: ", source, re.MULTILINE))
        found.update({key: (label, domain) for key, domain, label in matches})

    mirrored = {key: (meta.label, meta.domain) for key, meta in craft_gate.RECIPES.items()}
    assert mirrored == found


def test_craft_gate_constants_match_craft_valuation() -> None:
    source = _ts("src/core/craftValuation.ts")
    for name in (
        "GATE_MIN_TOTAL",
        "GATE_MIN_SAMPLES",
        "GATE_FLAGGED_MIN_RESULT_TOTAL",
        "RETURN_FLAG_MULTIPLE",
    ):
        assert int(_const(source, name)) == getattr(craft_gate, name), name
    reports = _ts("src/core/craftReports.ts")
    assert "return 3 * config.craftMargin.intervalMin * RECIPES.length * 60_000;" in reports
    env = _ts("src/config/env.ts")
    default = re.search(r'num\("CRAFT_MARGIN_INTERVAL_MIN", (\d+)\)', env)
    assert default is not None
    field = Settings.model_fields["craft_margin_interval_min"]
    assert field.default == int(default.group(1))


def test_farm_tables_match_farm_advisor() -> None:
    source = _ts("src/core/farmAdvisor.ts")
    overrides_block = source.split("const SOURCE_OVERRIDES", 1)[1].split("};", 1)[0]
    overrides = dict(re.findall(r'^\s+"([a-z0-9-]+)": "(\w+)",', overrides_block, re.MULTILINE))
    assert overrides == farm_tables.SOURCE_OVERRIDES

    labels_block = source.split("const FARM_LABELS", 1)[1].split("};", 1)[0]
    labels = {
        key: (label, hint)
        for key, label, hint in re.findall(
            r'^\s+(\w+): \{ label: "([^"]+)", hint: "([^"]*)" \},', labels_block, re.MULTILINE
        )
    }
    assert labels == farm_tables.FARM_LABELS
    assert int(_const(source, "MIN_VOLUME")) == farm_tables.MIN_VOLUME
    assert 'wAvgChange7d >= 30 ? "HOT" : wAvgChange7d >= 10 ? "WARM" : "COLD"' in source
    assert "it.baseValue * Math.log10(it.volume + 10)" in source


def test_exchange_windows_and_gate_text_match_the_cx_model() -> None:
    markets = _ts("src/core/cx/cxItemMarkets.ts")
    assert _const(markets, "CX_MAX_AGE_MS") == "3 * 60 * 60 * 1000"
    assert flips._CX_MAX_AGE_SECONDS == 3 * 60 * 60
    outcomes = _ts("src/core/cx/cxOutcomes.ts")
    assert int(_const(outcomes, "PERSISTENCE_WINDOW_DAYS")) == flips._PERSISTENCE_WINDOW_DAYS
    persistence = _ts("src/core/cx/cxPersistence.ts")
    held = int(_const(persistence, "MIN_HELD_HOURS"))
    window = int(_const(persistence, "SHORT_WINDOW_HOURS"))
    assert f"at least {held} of the last {window} digest hours" in flips._GATE
    env = _ts("src/config/env.ts")
    assert re.search(r'num\("CX_LIQ_RISKY_DIV_H", 100\)', env), "gate text quotes 100 Div/h"


def test_published_detail_columns_match_the_node_migration() -> None:
    source = _ts("src/db/cxEdgeDetail.ts")
    columns = tuple(re.findall(r'^\s+\["(\w+)", "(?:INTEGER|REAL)"\]', source, re.MULTILINE))
    assert columns == flips._DETAIL_COLUMNS


@pytest.mark.parametrize("name", sorted(_ENGINE_TOOLS))
def test_engine_tools_bind_strictly_without_exposing_the_league(
    name: str, item_catalog_manifest: Path
) -> None:
    settings = Settings(_env_file=None, configured_item_catalog_path=item_catalog_manifest)
    tool = next(tool for tool in get_tools(settings) if tool.name == name)

    provider_tool = convert_to_openai_tool(tool, strict=True)["function"]
    schema = provider_tool["parameters"]

    assert provider_tool["strict"] is True
    assert schema["additionalProperties"] is False
    assert "league" not in schema["properties"]
    assert set(schema["required"]) == set(schema["properties"])
    assert schema["properties"]["limit"]["type"] == "integer"
    assert "league" in tool.get_input_schema().model_fields
