"""Regression tests against the committed RePoE snapshot, not synthetic schema fixtures."""

from pathlib import Path

from src.items import get_item_catalog, inspect_item_text
from src.items.catalog import ItemCatalog

MANIFEST = Path(__file__).resolve().parents[3] / "src/data/poe2/repoe/manifest.json"
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


def test_committed_catalog_resolves_paralysing_staff() -> None:
    catalog = get_item_catalog(MANIFEST)
    inspection = inspect_item_text(catalog, STAFF_TEXT)

    assert len(catalog.sources) >= 20
    assert inspection.complete is True
    assert inspection.base_name == "Paralysing Staff"
    assert inspection.base_implicits == ["Grants Skill: Enervating Nova"]
    assert inspection.prefix_count == 3
    assert inspection.suffix_count == 3
    assert [modifier.id for modifier in inspection.modifiers] == [
        "SpellDamageGainedAsColdTwoHand5",
        "SpellDamageOnTwoHandWeapon8",
        "SpellDamageGainedAsFireTwoHand5",
        "SpellCriticalStrikeChanceTwoHand6",
        "EssenceSpellSkillLevel2H1",
        "AlloyCastSpeedDamageAsExtraColdHybrid1",
    ]
    assert [modifier.source for modifier in inspection.modifiers] == [
        "natural",
        "natural",
        "natural",
        "natural",
        "special",
        "special",
    ]


def test_duplicate_ring_base_is_resolved_by_implicit() -> None:
    catalog = get_item_catalog(MANIFEST)
    variants = {
        "Fire and Cold": "FourRing13a",
        "Fire and Lightning": "FourRing13b",
        "Cold and Lightning": "FourRing13c",
    }

    for resistances, metadata_suffix in variants.items():
        text = _ring_text(f"+14% to {resistances} Resistances (implicit)")
        inspection = inspect_item_text(catalog, text)
        assert inspection.complete is True
        assert inspection.base_id is not None
        assert inspection.base_id.endswith(metadata_suffix)


def test_ambiguous_ring_and_staff_only_forced_mod_fail_loudly() -> None:
    catalog = get_item_catalog(MANIFEST)
    ambiguous = inspect_item_text(catalog, _ring_text(None))
    invalid = inspect_item_text(
        catalog,
        _ring_text("+14% to Fire and Cold Resistances (implicit)")
        + "+5 to Level of all Spell Skills\n",
    )

    assert ambiguous.complete is False
    assert ambiguous.ambiguities
    assert invalid.complete is False
    assert invalid.unmatched_lines == ["+5 to Level of all Spell Skills"]


def test_two_hand_alloy_is_not_accepted_on_a_wand() -> None:
    catalog = get_item_catalog(MANIFEST)
    text = """Item Class: Wands
Rarity: Rare
Attuned Wand
--------
Item Level: 82
--------
(39-47)% increased Cast Speed
Gain (11-16)% of Elemental Damage as Extra Cold Damage
"""

    inspection = inspect_item_text(catalog, text)

    assert inspection.complete is False
    assert inspection.unmatched_lines == [
        "(39-47)% increased Cast Speed",
        "Gain (11-16)% of Elemental Damage as Extra Cold Damage",
    ]


def test_gloves_alloy_is_not_accepted_on_a_staff() -> None:
    catalog = get_item_catalog(MANIFEST)
    text = """Item Class: Staves
Rarity: Rare
Paralysing Staff
--------
Item Level: 82
--------
(9-12)% increased Cast Speed
"""

    inspection = inspect_item_text(catalog, text)

    assert inspection.complete is False
    assert inspection.unmatched_lines == ["(9-12)% increased Cast Speed"]


def test_jewel_modifier_is_not_accepted_on_a_staff() -> None:
    catalog = get_item_catalog(MANIFEST)
    text = """Item Class: Staves
Rarity: Rare
Paralysing Staff
--------
Item Level: 82
--------
+6% to Fire Resistance
"""

    inspection = inspect_item_text(catalog, text)

    assert inspection.complete is False
    assert inspection.unmatched_lines == ["+6% to Fire Resistance"]


def test_weapon_skill_modifiers_are_not_accepted_on_gloves() -> None:
    catalog = get_item_catalog(MANIFEST)
    text = """Item Class: Gloves
Rarity: Rare
Stocky Mitts
--------
Item Level: 82
--------
+5 to Level of all Minion Skills
+1 to Level of all Projectile Skills
"""

    inspection = inspect_item_text(catalog, text)

    assert inspection.complete is False
    assert inspection.unmatched_lines == [
        "+5 to Level of all Minion Skills",
        "+1 to Level of all Projectile Skills",
    ]


def test_quarterstaff_desecrated_modifier_is_accepted() -> None:
    catalog = get_item_catalog(MANIFEST)
    text = """Item Class: Quarterstaves
Rarity: Rare
Wrapped Quarterstaff
--------
Item Level: 82
--------
86% increased Chaos Damage
14% increased Magnitude of Ailments you inflict
"""

    inspection = inspect_item_text(catalog, text)

    assert inspection.complete is True
    assert [modifier.id for modifier in inspection.modifiers] == [
        "ConvertedAbyssModQuarterstaffChaosAndAilment1"
    ]
    assert inspection.modifiers[0].source == "special"


def test_perfect_essence_skill_levels_are_class_specific() -> None:
    catalog = get_item_catalog(MANIFEST)
    base = """Item Class: Quarterstaves
Rarity: Rare
Wrapped Quarterstaff
--------
Item Level: 82
--------
"""

    spell = inspect_item_text(catalog, base + "+5 to Level of all Spell Skills\n")
    attack = inspect_item_text(catalog, base + "+3 to Level of all Attack Skills\n")

    assert spell.complete is False
    assert spell.unmatched_lines == ["+5 to Level of all Spell Skills"]
    assert attack.complete is True
    assert [modifier.id for modifier in attack.modifiers] == [
        "EssenceAttackSkillLevel2H1"
    ]


def test_legacy_essence_modifier_is_rejected_on_jewel() -> None:
    catalog = get_item_catalog(MANIFEST)
    text = """Item Class: Jewels
Rarity: Rare
Ruby
--------
Item Level: 82
--------
46% increased Stun Threshold
"""

    inspection = inspect_item_text(catalog, text)

    assert inspection.complete is False
    assert inspection.unmatched_lines == ["46% increased Stun Threshold"]


def test_betrayal_of_aldur_essence_conversions_are_current() -> None:
    catalog = get_item_catalog(MANIFEST)
    cases = [
        (
            """Item Class: Spears
Rarity: Rare
Hardwood Spear
--------
Item Level: 82
--------
Gain 15% of Damage as Extra Chaos Damage
""",
            "ConvertedEssenceDamageasExtraChaos1",
        ),
        (
            """Item Class: Quarterstaves
Rarity: Rare
Wrapped Quarterstaff
--------
Item Level: 82
--------
Gain 25% of Damage as Extra Chaos Damage
""",
            "ConvertedEssenceDamageasExtraChaos2H",
        ),
    ]

    for text, expected_id in cases:
        inspection = inspect_item_text(catalog, text)
        assert inspection.complete is True
        assert [modifier.id for modifier in inspection.modifiers] == [expected_id]


def test_fists_of_stone_essence_outcomes_are_base_specific() -> None:
    catalog = get_item_catalog(MANIFEST)
    fists = [_glove_text("Fists of Stone"), _glove_text("Runeforged Fists of Stone")]
    ordinary = _glove_text("Stocky Mitts")

    _assert_fists_only_outcomes(catalog, fists, ordinary)
    _assert_replaced_outcomes(catalog, fists, ordinary)
    _assert_special_mod_sets(catalog, fists)


def _assert_fists_only_outcomes(catalog: ItemCatalog, fists: list[str], ordinary: str) -> None:
    outcomes = [
        ("Charms gain 0.13 charges per Second", "HandWrapsEssenceGoldDropped1"),
        (
            "12% of Damage taken from Deflected Hits Recouped as Life",
            "HandWrapsEssenceLightningRecoupLife1",
        ),
        (
            "Life Flasks gain 0.13 charges per Second\nMana Flasks gain 0.13 charges per Second",
            "HandWrapsEssenceLocalRuneAndSoulCoreEffect1",
        ),
    ]
    for lines, expected_id in outcomes:
        accepted = [inspect_item_text(catalog, base + lines + "\n") for base in fists]
        rejected = inspect_item_text(catalog, ordinary + lines + "\n")
        assert all(inspection.complete is True for inspection in accepted)
        assert all(
            [modifier.id for modifier in inspection.modifiers] == [expected_id]
            for inspection in accepted
        )
        assert rejected.complete is False
        assert rejected.unmatched_lines == lines.splitlines()


def _assert_replaced_outcomes(catalog: ItemCatalog, fists: list[str], ordinary: str) -> None:
    outcomes = [
        ("26% of Lightning Damage taken Recouped as Life", "EssenceLightningRecoupLife1"),
        ("60% increased effect of Socketed Augment Items", "EssenceLocalRuneAndSoulCoreEffect1"),
    ]
    for lines, expected_id in outcomes:
        accepted = inspect_item_text(catalog, ordinary + lines + "\n")
        rejected = [inspect_item_text(catalog, base + lines + "\n") for base in fists]
        assert accepted.complete is True
        assert [modifier.id for modifier in accepted.modifiers] == [expected_id]
        assert all(inspection.complete is False for inspection in rejected)
        assert all(inspection.unmatched_lines == [lines] for inspection in rejected)


def _assert_special_mod_sets(catalog: ItemCatalog, fists: list[str]) -> None:
    replaced_ids = {
        "EssenceGoldDropped1",
        "EssenceLightningRecoupLife1",
        "EssenceLocalRuneAndSoulCoreEffect1",
    }
    ordinary_base = catalog.find_base("Stocky Mitts")
    assert ordinary_base is not None
    ordinary_special = {
        mod_id for mod_id, _ in catalog.special_mods_for_base(ordinary_base[0])
    }
    assert replaced_ids <= ordinary_special
    for base_text in fists:
        fist_base = catalog.find_base(base_text)
        assert fist_base is not None
        fist_special = {
            mod_id for mod_id, _ in catalog.special_mods_for_base(fist_base[0])
        }
        assert replaced_ids.isdisjoint(fist_special)
        gold = inspect_item_text(
            catalog, base_text + "10% increased Quantity of Gold Dropped by Slain Enemies\n"
        )
        assert gold.complete is True
        assert [modifier.id for modifier in gold.modifiers] == ["CorruptionGoldFoundIncrease1"]


def _glove_text(name: str) -> str:
    return f"""Item Class: Gloves
Rarity: Rare
{name}
--------
Item Level: 82
--------
"""


def test_staff_alloy_is_not_accepted_on_ring() -> None:
    catalog = get_item_catalog(MANIFEST)
    text = (
        _ring_text("+14% to Fire and Cold Resistances (implicit)")
        + """
(39-47)% increased Cast Speed
Gain (11-16)% of Elemental Damage as Extra Cold Damage
"""
    )

    inspection = inspect_item_text(catalog, text)

    assert inspection.complete is False
    assert inspection.unmatched_lines == [
        "(39-47)% increased Cast Speed",
        "Gain (11-16)% of Elemental Damage as Extra Cold Damage",
    ]


def test_martial_weapon_alloy_is_not_accepted_on_ring_or_gloves() -> None:
    catalog = get_item_catalog(MANIFEST)
    texts = [
        _ring_text("+14% to Fire and Cold Resistances (implicit)"),
        """Item Class: Gloves
Rarity: Rare
Stocky Mitts
--------
Item Level: 82
--------
""",
    ]

    for base_text in texts:
        inspection = inspect_item_text(
            catalog,
            base_text + "+7 to all Attributes\n15% increased Physical Damage\n",
        )
        assert inspection.complete is False
        assert "15% increased Physical Damage" in inspection.unmatched_lines
        assert "AlloyAttributeIncreasedLocalPhysicalDamageHybrid1" not in {
            modifier.id for modifier in inspection.modifiers
        }


def _ring_text(implicit: str | None) -> str:
    suffix = f"{implicit}\n" if implicit else ""
    return f"""Item Class: Rings
Rarity: Normal
Two-Stone Ring
--------
Item Level: 35
--------
{suffix}"""
