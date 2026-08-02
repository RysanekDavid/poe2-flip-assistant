"""Verified item-class compatibility for non-natural Essence outcomes."""

import hashlib
from collections.abc import Iterable

_LOWER_MARTIAL = frozenset(
    {
        "bow",
        "dagger",
        "flail",
        "one hand axe",
        "one hand mace",
        "one hand sword",
        "spear",
    }
)
_HIGHER_MARTIAL = frozenset(
    {
        "crossbow",
        "talisman",
        "two hand axe",
        "two hand mace",
        "two hand sword",
        "warstaff",
    }
)
_MARTIAL_WEAPONS = _LOWER_MARTIAL | _HIGHER_MARTIAL
_ABYSS_ITEMS = _MARTIAL_WEAPONS | {
    "amulet",
    "belt",
    "body armour",
    "boots",
    "buckler",
    "focus",
    "gloves",
    "helmet",
    "quiver",
    "ring",
    "sceptre",
    "shield",
    "staff",
    "wand",
}

# RePoE stores the outcomes but omits the currency target table. These classes mirror current
# PoE2DB tables for Perfect Essences, six corrupted outcomes, and Betrayal conversions.
ESSENCE_ITEM_CLASSES: dict[str, frozenset[str]] = {
    "EssenceLocalRuneAndSoulCoreEffect1": frozenset({"boots", "gloves"}),
    "EssenceCorruptForTwoEnchantments1": frozenset({"belt"}),
    "EssenceGrantedPassive": frozenset({"body armour"}),
    "EssenceAbyssPrefix": _ABYSS_ITEMS,
    "EssenceAbyssSuffix": _ABYSS_ITEMS,
    "EssenceBreach": frozenset({"amulet", "ring"}),
    "EssenceIncreasedLifePercent1": frozenset({"body armour"}),
    "EssenceIncreasedManaPercent1": frozenset({"ring"}),
    "EssenceGlobalDefences1": frozenset({"amulet"}),
    "EssenceDamageasExtraPhysical1": _LOWER_MARTIAL,
    "EssenceDamageasExtraPhysical2H": _HIGHER_MARTIAL,
    "EssenceDamageasExtraFire1": _LOWER_MARTIAL,
    "EssenceDamageasExtraFire2H": _HIGHER_MARTIAL,
    "EssenceDamageasExtraCold1": _LOWER_MARTIAL,
    "EssenceDamageasExtraCold2H": _HIGHER_MARTIAL,
    "EssenceDamageasExtraLightning1": _LOWER_MARTIAL,
    "EssenceDamageasExtraLightning2H": _HIGHER_MARTIAL,
    "EssenceFireRecoupLife1": frozenset({"belt"}),
    "EssenceColdRecoupLife1": frozenset({"helmet"}),
    "EssenceLightningRecoupLife1": frozenset({"gloves"}),
    "EssencePhysicalDamageTakenAsChaos1": frozenset({"body armour"}),
    "EssenceAttackSkillLevel1H1": _LOWER_MARTIAL,
    "EssenceAttackSkillLevel2H1": _HIGHER_MARTIAL,
    "EssenceSpellSkillLevel1H1": frozenset({"wand"}),
    "EssenceSpellSkillLevel2H1": frozenset({"staff"}),
    "EssenceOnslaughtonKill1": _MARTIAL_WEAPONS,
    "EssenceManaCostReduction": frozenset({"focus", "wand"}),
    "EssenceManaCostReduction2H": frozenset({"staff"}),
    "EssencePercentStrength1": frozenset({"amulet"}),
    "EssencePercentDexterity1": frozenset({"amulet"}),
    "EssencePercentIntelligence1": frozenset({"amulet"}),
    "EssenceReducedCriticalDamageAgainstYou1": frozenset({"body armour"}),
    "EssenceGoldDropped1": frozenset({"gloves"}),
    "EssenceAuraEffect1": frozenset({"sceptre"}),
    # Betrayal of Aldur converts the live Perfect Essence extra-elemental outcome to chaos.
    "ConvertedEssenceDamageasExtraChaos1": _LOWER_MARTIAL,
    "ConvertedEssenceDamageasExtraChaos2H": _HIGHER_MARTIAL,
}

_FISTS_OF_STONE_BASES = frozenset(
    {
        "Metadata/Items/Armours/Gloves/FourGlovesDexIntAscendancy",
        "Metadata/Items/Armours/Gloves/FourGlovesDexIntAscendancyVerisium",
    }
)
ESSENCE_BASE_IDS: dict[str, frozenset[str]] = {
    "HandWrapsEssenceGoldDropped1": _FISTS_OF_STONE_BASES,
    "HandWrapsEssenceLightningRecoupLife1": _FISTS_OF_STONE_BASES,
    "HandWrapsEssenceLocalRuneAndSoulCoreEffect1": _FISTS_OF_STONE_BASES,
}
_FISTS_REPLACED_ESSENCE_IDS = frozenset(
    {
        "EssenceGoldDropped1",
        "EssenceLightningRecoupLife1",
        "EssenceLocalRuneAndSoulCoreEffect1",
    }
)

# RePoE also carries 160 zero-weight legacy PoE1 Essence modifiers. They are deliberately
# unusable in PoE2. Pinning their set makes a data update fail loudly instead of letting a newly
# added outcome silently fall through the generic affix-family matcher.
_LEGACY_ESSENCE_COUNT = 160
_LEGACY_ESSENCE_SHA256 = (
    "c5075ff8ac7e2e8456df116dca56eaff5f88df36c3b2084ff48f69ce8c460c9c"
)


def is_essence_family(mod_id: str) -> bool:
    """Identify both current and legacy forced Essence modifier IDs."""
    return "essence" in mod_id.casefold()


def essence_matches_base(mod_id: str, base_id: str, item_class: str) -> bool:
    """Apply exact-base rules before the broader item-class compatibility table."""
    allowed_bases = ESSENCE_BASE_IDS.get(mod_id)
    if allowed_bases is not None:
        return base_id in allowed_bases
    if base_id in _FISTS_OF_STONE_BASES and mod_id in _FISTS_REPLACED_ESSENCE_IDS:
        return False
    return item_class.casefold() in ESSENCE_ITEM_CLASSES.get(mod_id, frozenset())


def validate_essence_coverage(forced_mod_ids: Iterable[str]) -> None:
    """Reject a snapshot when current or rejected legacy Essence records drift."""
    actual = {mod_id for mod_id in forced_mod_ids if is_essence_family(mod_id)}
    approved = set(ESSENCE_ITEM_CLASSES) | set(ESSENCE_BASE_IDS)
    absent = sorted(approved - actual)
    legacy = sorted(actual - approved)
    legacy_hash = hashlib.sha256("\n".join(legacy).encode()).hexdigest()
    legacy_changed = (
        len(legacy) != _LEGACY_ESSENCE_COUNT or legacy_hash != _LEGACY_ESSENCE_SHA256
    )
    # Focused unit-test fixtures intentionally omit the live Essence corpus. A real snapshot has
    # Essence-family records, and must match both the approved table and pinned rejected set.
    if actual and (absent or legacy_changed):
        raise RuntimeError(
            "Essence compatibility is stale; "
            f"absent={absent}, legacy_count={len(legacy)}, "
            f"legacy_sha256={legacy_hash}"
        )
