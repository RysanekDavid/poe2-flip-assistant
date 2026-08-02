"""Verified item-class compatibility for currently usable Alloy outcomes."""

from collections.abc import Iterable

_MARTIAL_WEAPONS = frozenset(
    {
        "bow",
        "crossbow",
        "dagger",
        "flail",
        "one hand axe",
        "one hand mace",
        "one hand sword",
        "spear",
        "talisman",
        "two hand axe",
        "two hand mace",
        "two hand sword",
        "warstaff",
    }
)
_ALL_WEAPONS = _MARTIAL_WEAPONS | {"sceptre", "staff", "wand"}
_WARD_ARMOUR = frozenset(
    {"body armour", "boots", "buckler", "focus", "gloves", "helmet", "shield"}
)

# RePoE exposes the modifier records but not their Alloy target tables. These class sets mirror
# the 13 current PoE2DB Alloy tables; exact IDs and ranges still come from the pinned RePoE data.
ALLOY_ITEM_CLASSES: dict[str, frozenset[str]] = {
    "AlloyAccuracyAttackSpeedHybrid1": _MARTIAL_WEAPONS,
    "AlloyAilmentMagnitude1": _MARTIAL_WEAPONS,
    "AlloyArchonDuration1": frozenset({"helmet"}),
    "AlloyAttackAreaOfEffect1": frozenset({"gloves"}),
    "AlloyAttackSpeedIfMissingWardRecently1": frozenset({"gloves"}),
    "AlloyAttackSpeedRing1": frozenset({"ring"}),
    "AlloyAttributeIncreasedLocalPhysicalDamageHybrid1": _MARTIAL_WEAPONS,
    "AlloyBallistaLimit1": frozenset({"crossbow"}),
    "AlloyBellLimit1": frozenset({"warstaff"}),
    "AlloyCastSpeedDamageAsExtraColdHybrid1": frozenset({"staff"}),
    "AlloyCastSpeedDamageAsExtraColdHybridOneHand1": frozenset({"focus", "wand"}),
    "AlloyCastSpeedGloves1": frozenset({"gloves"}),
    "AlloyChanceToChain1": frozenset({"quiver"}),
    "AlloyDamageAsExtraFireTwoHandWhileMissingRunicWard1": frozenset({"staff"}),
    "AlloyDamageAsExtraFireWhileMissingRunicWard1": frozenset({"wand"}),
    "AlloyDamagingAilmentDuration1": frozenset({"gloves"}),
    "AlloyEffectOfResistanceMods1": frozenset({"amulet", "belt", "ring"}),
    "AlloyEffectOfSocketedAugments1": _ALL_WEAPONS,
    "AlloyElementalPenetration1": frozenset({"gloves"}),
    "AlloyElementalSkillLimit1": frozenset({"wand"}),
    "AlloyExposureEffect1": frozenset({"focus", "staff", "wand"}),
    "AlloyFlaskChargesPerSecond1": frozenset({"belt"}),
    "AlloyLightningDamageIgnites1": frozenset({"talisman"}),
    "AlloyLocalWardIncreasePercent1": _WARD_ARMOUR,
    "AlloyManaCostEfficiency1": frozenset({"helmet"}),
    "AlloyMarkEffect": frozenset({"bow"}),
    "AlloyMaximumElementalInfusions1": frozenset({"sceptre", "staff", "wand"}),
    "AlloyMaximumRunicWard1": frozenset({"ring"}),
    "AlloyMaximumRunicWardPercent1": frozenset({"amulet"}),
    "AlloyMaximumRunicWardWeapon1": _ALL_WEAPONS,
    "AlloyMeleeStrikeRange1": frozenset({"spear"}),
    "AlloyMinionDamagingAilmentMagnitude1": frozenset({"sceptre"}),
    "AlloyNaturesArchon1": frozenset({"staff"}),
    "AlloyPresenceAreaOfEffect1": frozenset({"body armour"}),
    "AlloyPuppetMasterChance1": frozenset({"sceptre"}),
    "AlloyPuppeteerStacks1": frozenset({"sceptre"}),
    "AlloyRecoverRunicWardOnCharmUse1": frozenset({"belt"}),
    "AlloyReducedSlowPotency1": frozenset({"body armour"}),
    "AlloyRemnantPickupRange1": frozenset({"gloves"}),
    "AlloyRetainGlory1": frozenset({"one hand mace", "two hand mace"}),
    "AlloyRunicWardOnBlock1": frozenset({"buckler", "shield"}),
    "AlloyRunicWardRechargeRate1": frozenset({"belt"}),
    "AlloySkillEffectDuration1": frozenset({"boots"}),
    "AlloySpellAreaOfEffect1": frozenset({"helmet"}),
    "AlloySpellLevelManaHybrid1": frozenset({"staff", "wand"}),
    "AlloySpiritOnBoots1": frozenset({"boots"}),
    "AlloyTemporaryMinionSkillLimit1": frozenset({"boots"}),
    "AlloyTotemPlacementSpeed1": frozenset({"buckler", "focus", "shield"}),
}

# These records exist in the current data files but do not appear in any live Alloy target table.
UNUSED_ALLOY_MOD_IDS = frozenset(
    {
        "AlloyLocalWardIncreasePercent2",
        "AlloyManaNearbyAllyAttackSpeedHybrid1",
        "AlloySpiritPresenceAreaOfEffectHybrid1",
    }
)


def validate_alloy_coverage(mod_ids: Iterable[str]) -> None:
    """Reject a new snapshot until every Alloy record has an explicit disposition."""
    actual = {mod_id for mod_id in mod_ids if mod_id.startswith("Alloy")}
    expected = set(ALLOY_ITEM_CLASSES) | set(UNUSED_ALLOY_MOD_IDS)
    # Small unit-test fixtures intentionally omit the live Alloy corpus. A real snapshot has
    # Alloy records, and must then match the reviewed table exactly in both directions.
    if actual and actual != expected:
        missing = sorted(actual - expected)
        stale = sorted(expected - actual)
        raise RuntimeError(
            f"Alloy compatibility is stale; unknown={missing}, absent={stale}"
        )
