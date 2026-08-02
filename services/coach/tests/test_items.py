"""Complete local catalog and deterministic clipboard parsing tests."""

import json
from pathlib import Path

from src.agent import _incomplete_item_answer
from src.config import Settings
from src.items import get_item_catalog, inspect_item_text, looks_like_item_text
from src.tools import get_tools

STAFF_TEXT = """i want to craft this: Paralysing Staff Staves
Requires: 52 Level, 92 Intelligence.

• Grants Skill: Enervating Nova
• Gain (49–54)% of Damage as Extra Cold Damage — P2
• (209–238)% increased Spell Damage — P1
• Gain (49–54)% of Damage as Extra Fire Damage — P2
• (90–109)% increased Critical Hit Chance for Spells — S1
• +5 to Level of all Spell Skills — S1
• (39–47)% increased Cast Speed — S1
• Gain (11–16)% of Elemental Damage as Extra Cold Damage
"""

REAL_CLIPBOARD = """Item Class: Staves
Rarity: Rare
Fixture Reach
Paralysing Staff
--------
Quality: +20% (augmented)
Physical Damage: 45-74
Critical Hit Chance: 10.00%
Attacks per Second: 1.20
--------
Requirements:
Level: 52
Int: 92
--------
Item Level: 82
--------
15% increased Damage (rune)
Cannot be Frozen
"""


def test_staff_is_six_affixes_and_compound_alloy(item_catalog_manifest: Path) -> None:
    catalog = get_item_catalog(item_catalog_manifest)
    inspection = inspect_item_text(catalog, STAFF_TEXT)

    assert inspection.recognized is True
    assert inspection.complete is True
    assert inspection.base_name == "Paralysing Staff"
    assert inspection.item_class == "Staves"
    assert inspection.item_level is None
    assert inspection.requirements == {"level": 52, "intelligence": 92}
    assert len(inspection.modifiers) == 6
    assert inspection.prefix_count == 3
    assert inspection.suffix_count == 3
    assert inspection.open_prefixes == 0
    assert inspection.open_suffixes == 0
    spell_damage = next(
        mod for mod in inspection.modifiers if mod.id == "RunicSpellDamage"
    )
    assert spell_damage.tier == 1
    alloy = next(
        mod for mod in inspection.modifiers if mod.id == "TranscendentAlloyCold"
    )
    assert len(alloy.observed_lines) == 2
    assert alloy.source == "special"


def test_unknown_modifier_makes_inspection_incomplete(
    item_catalog_manifest: Path,
) -> None:
    catalog = get_item_catalog(item_catalog_manifest)
    inspection = inspect_item_text(
        catalog,
        STAFF_TEXT + "• 999% increased Banana Damage\n",
    )

    assert inspection.complete is False
    assert inspection.unmatched_lines == ["999% increased Banana Damage"]
    answer = _incomplete_item_answer(inspection)
    assert "cannot provide an exact crafting sequence" in answer
    assert "999% increased Banana Damage" in answer


def test_over_cap_affixes_make_inspection_incomplete(
    item_catalog_manifest: Path,
) -> None:
    catalog = get_item_catalog(item_catalog_manifest)
    inspection = inspect_item_text(
        catalog,
        STAFF_TEXT + "• Gain (49–54)% of Damage as Extra Cold Damage — P2\n",
    )

    assert inspection.complete is False
    assert inspection.prefix_count == 4
    assert inspection.open_prefixes == 0
    assert inspection.ambiguities == ["Observed 4 prefixes exceeds ordinary cap 3"]


def test_overlapping_modifier_candidates_are_reported_as_ambiguous(
    item_catalog_manifest: Path,
) -> None:
    catalog = get_item_catalog(item_catalog_manifest)
    base = catalog.find_base("Paralysing Staff")
    assert base is not None
    original = catalog.mods["ApprenticeSpellDamage"]
    catalog.mods["ReplicaSpellDamage"] = original.model_copy()
    catalog.mods_by_base["item"]["staff"]["mods"]["ReplicaSpellDamage"] = {}
    catalog._base_mod_cache.clear()

    inspection = inspect_item_text(
        catalog,
        "Item Class: Staves\nRarity: Rare\nParalysing Staff\n--------\n"
        "Item Level: 82\n--------\n120% increased Spell Damage\n",
    )

    assert inspection.complete is False
    assert inspection.unmatched_lines == ["120% increased Spell Damage"]
    assert "ambiguous between" in inspection.ambiguities[0]


def test_real_clipboard_handles_properties_rune_and_static_mod(
    item_catalog_manifest: Path,
) -> None:
    catalog = get_item_catalog(item_catalog_manifest)
    inspection = inspect_item_text(catalog, REAL_CLIPBOARD)

    assert inspection.complete is True
    assert inspection.item_level == 82
    assert [mod.id for mod in inspection.modifiers] == [
        "StaffRuneDamage",
        "CannotBeFrozen",
    ]
    assert inspection.prefix_count == 0
    assert inspection.suffix_count == 1
    assert inspection.modifiers[0].source == "special"


def test_unknown_structured_item_replaces_prior_context(
    item_catalog_manifest: Path,
) -> None:
    catalog = get_item_catalog(item_catalog_manifest)
    text = "Item Class: Staves\nRarity: Rare\nFuture Patch Staff\nItem Level: 90"

    assert looks_like_item_text(catalog, text) is True
    inspection = inspect_item_text(catalog, text)
    assert inspection.recognized is False
    assert inspection.complete is False


def test_clean_normal_base_is_complete(item_catalog_manifest: Path) -> None:
    catalog = get_item_catalog(item_catalog_manifest)
    text = """Item Class: Staves
Rarity: Normal
Paralysing Staff
--------
Item Level: 82
--------
"""

    inspection = inspect_item_text(catalog, text)

    assert inspection.recognized is True
    assert inspection.complete is True
    assert inspection.modifiers == []


def test_unknown_static_clipboard_modifier_is_not_dropped(
    item_catalog_manifest: Path,
) -> None:
    catalog = get_item_catalog(item_catalog_manifest)
    inspection = inspect_item_text(
        catalog,
        REAL_CLIPBOARD + "Future Patch Modifier\n",
    )

    assert inspection.complete is False
    assert inspection.unmatched_lines == ["Future Patch Modifier"]


def test_range_parser_does_not_treat_separator_as_minus(
    item_catalog_manifest: Path,
) -> None:
    catalog = get_item_catalog(item_catalog_manifest)
    inspection = inspect_item_text(catalog, STAFF_TEXT)

    spell_damage = next(
        mod for mod in inspection.modifiers if mod.id == "RunicSpellDamage"
    )
    assert spell_damage.observed_lines == ["(209-238)% increased Spell Damage"]


def test_item_tool_returns_game_data_evidence(item_catalog_manifest: Path) -> None:
    settings = Settings(
        _env_file=None, configured_item_catalog_path=item_catalog_manifest
    )
    tool = next(
        tool for tool in get_tools(settings) if tool.name == "inspect_poe2_item"
    )

    result = json.loads(tool.invoke({"item_text": STAFF_TEXT}))

    assert result["inspection"]["complete"] is True
    assert result["sources"][0]["type"] == "game_data"
    assert result["sources"][0]["id"].startswith("D")


def test_complete_catalog_lookup_exposes_item_description(
    item_catalog_manifest: Path,
) -> None:
    settings = Settings(
        _env_file=None, configured_item_catalog_path=item_catalog_manifest
    )
    tool = next(
        tool for tool in get_tools(settings) if tool.name == "lookup_poe2_game_data"
    )

    result = json.loads(tool.invoke({"query": "Omen of Light", "limit": 3}))

    assert result["hits"][0]["data"]["name"] == "Omen of Light"
    assert (
        "Desecrated modifier" in result["hits"][0]["data"]["properties"]["description"]
    )
    assert result["evidence_id"].startswith("D")
