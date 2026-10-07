/* Fixtures for the craft-planner tests: a frozen price table (Divine per unit, rounded 0.5-league
 * magnitudes — the tests assert plan SHAPE, not prices) and the golden requests rebuilt from the
 * curated recipes' targets. */
import { MATS, type MaterialKey } from "../../core/craftMaterials";
import { CATALYSTS } from "../../core/tools/planner/catalystTags";
import { ALLOY_OUTCOMES } from "../../core/tools/planner/alloyOutcomes";
import { ESSENCE_OUTCOMES } from "../../core/tools/planner/essenceOutcomes";
import type { PlanRequest } from "../../lib/tools/craftPlannerContract";

const BY_KEY: Partial<Record<MaterialKey, number>> = {
  exalted: 0.004,
  greaterExalted: 0.05,
  perfectExalted: 0.6,
  chaos: 0.035,
  greaterChaos: 0.3,
  perfectChaos: 2,
  annul: 0.06,
  regal: 0.002,
  greaterRegal: 0.03,
  perfectRegal: 0.4,
  alch: 0.001,
  aug: 0.0004,
  greaterAug: 0.01,
  perfectAug: 0.15,
  transmute: 0.0003,
  greaterTransmute: 0.005,
  perfectTransmute: 0.08,
  fracturing: 2.5,
  divine: 1,
  omenSinistralExaltation: 0.3,
  omenDextralExaltation: 0.3,
  omenGreaterExaltation: 1,
  omenCatalysingExaltation: 0.4,
  omenSinistralAnnulment: 2,
  omenDextralAnnulment: 2,
  omenSinistralCrystallisation: 1.5,
  omenDextralCrystallisation: 1.5,
  omenSinistralNecromancy: 0.5,
  omenDextralNecromancy: 0.5,
  omenTheLiege: 3,
  omenTheSovereign: 2,
  omenTheBlackblooded: 2.5,
  omenAbyssalEchoes: 1.2,
  omenLight: 4,
  omenSinistralErasure: 0.3,
  omenDextralErasure: 0.3,
  omenWhittling: 3,
  preservedCollarbone: 0.5,
  preservedCranium: 0.4,
  gnawedCollarbone: 0.05,
  ancientCollarbone: 1.5,
};

const ESSENCE_PRICE: Record<string, number> = {
  "perfect-essence-of-the-mind": 3,
  "perfect-essence-of-enhancement": 2,
  "perfect-essence-of-insulation": 1,
  "essence-of-the-breach": 6,
  "greater-essence-of-opulence": 0.15,
};

/** Forbidden Rites alloys (poe2scout, 2026-10-07, 1 div = 705.55 ex): Swift 91 ex, Runic 98, Protective 64, Sovereign 167. */
const ALLOY_PRICE: Record<string, number> = {
  "swift-alloy": 0.13,
  "runic-alloy": 0.14,
  "protective-alloy": 0.09,
  "sovereign-alloy": 0.24,
};

export function fixturePrices(): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, div] of Object.entries(BY_KEY)) out.set(MATS[key as MaterialKey].id, div);
  for (const c of CATALYSTS) out.set(c.mat.id, 0.02);
  for (const r of ESSENCE_OUTCOMES) out.set(r.essenceId, ESSENCE_PRICE[r.essenceId] ?? 0.05);
  for (const r of ALLOY_OUTCOMES) {
    const div = ALLOY_PRICE[r.essenceId];
    if (div == null) throw new Error(`plannerFixtures: no fixture price for ${r.essenceId}`);
    out.set(r.essenceId, div);
  }
  return out;
}

const target = (family: string, side: "prefix" | "suffix", minModId: string, fractured = false) => ({ family, side, minModId, fractured });

/** ring_breach_mana_stacker (craftRecipeData5): T1 flat mana, essence % mana, Amanamu minion damage, two ≥ level-71 resistances. */
export const BREACH_RING: PlanRequest = {
  itemClass: "Rings",
  base: "Breach Ring",
  ilvl: 82,
  targets: [
    target("IncreasedMana", "prefix", "IncreasedMana12"),
    target("MaximumManaIncreasePercent", "prefix", "EssenceIncreasedManaPercent1"),
    target("IncreasedMinionDamageIfYouHitEnemy", "prefix", "AbyssModRingAmuletAmanamuPrefixMinionDamageIfYou'veHitRecently"),
    target("FireResistance", "suffix", "FireResist7"),
    target("ColdResistance", "suffix", "ColdResist7"),
  ],
  includeUnverified: false,
  quality: null,
};

/** ring_fractured_t1res (craftRecipeData2): fractured T1 flat cold + T1 flat fire + lightning and fire resistance ≥ level 71. */
export const FRACTURED_T1RES_RING: PlanRequest = {
  itemClass: "Rings",
  base: "Gold Ring",
  ilvl: 82,
  targets: [
    target("ColdDamage", "prefix", "AddedColdDamage9", true),
    target("FireDamage", "prefix", "AddedFireDamage9"),
    target("LightningResistance", "suffix", "LightningResist7"),
    target("FireResistance", "suffix", "FireResist7"),
  ],
  includeUnverified: false,
  quality: null,
};

/** amulet_fracture_plus3 (craftRecipeData): fractured +3 Spell Skills + the Greater Opulence rarity. */
export const FRACTURE_PLUS3_AMULET: PlanRequest = {
  itemClass: "Amulets",
  base: "Stellar Amulet",
  ilvl: 82,
  targets: [target("GlobalIncreaseSpellSkillGemLevel", "suffix", "GlobalSpellGemsLevel3", true), target("ItemFoundRarityIncrease", "suffix", "ItemFoundRarityIncrease3")],
  includeUnverified: false,
  quality: null,
};

export { target };

/**
 * The owner's refused prod plan (2026-10-04): three top-tier flat attack-damage prefixes + Cast Speed
 * + Rarity on a Breach Ring, "include unverified methods" on. With catalysts unpriced it rebuilt the
 * prod bill exactly (13,201 Greater Exalted Orbs + Sinistral Exaltations in one prefix chain) until
 * the whittle loop replaced that chain.
 */
export const OWNER_FLAT_RING: PlanRequest = {
  itemClass: "Rings",
  base: "Breach Ring",
  ilvl: 82,
  targets: [
    target("PhysicalDamage", "prefix", "AddedPhysicalDamage9"),
    target("LightningDamage", "prefix", "AddedLightningDamage9"),
    target("ColdDamage", "prefix", "AddedColdDamage9"),
    target("IncreasedCastSpeed", "suffix", "CastSpeedJewellery5"),
    target("ItemFoundRarityIncrease", "suffix", "ItemFoundRarityIncrease3"),
  ],
  includeUnverified: true,
  quality: null,
};

/** The four "Adds X to Y … to Attacks" ring prefixes: catalog family and tier-id stem (tier 9 = the top, level 75). */
export const FLAT_FAMILIES: ReadonlyArray<readonly [string, string]> = [
  ["ColdDamage", "AddedColdDamage"],
  ["FireDamage", "AddedFireDamage"],
  ["LightningDamage", "AddedLightningDamage"],
  ["PhysicalDamage", "AddedPhysicalDamage"],
];

/** Four top-tier attack flats on a Dusk Ring (its fourth prefix slot): still a whittle step past the limit. */
export const FOUR_FLAT_DUSK: PlanRequest = {
  itemClass: "Rings",
  base: "Dusk Ring",
  ilvl: 82,
  targets: FLAT_FAMILIES.map(([family, id]) => target(family, "prefix", `${id}9`)),
  includeUnverified: true,
  quality: null,
};

/** SaVeQ's Dusk Ring as a pool: any 3 of the four attack flats at tier 3 or better, clean start. */
export const DUSK_FLAT_POOL: PlanRequest = {
  itemClass: "Rings",
  base: "Dusk Ring",
  ilvl: 82,
  targets: [],
  includeUnverified: false,
  quality: null,
  groups: [{ side: "prefix", need: 3, candidates: FLAT_FAMILIES.map(([family, id]) => ({ family, minModId: `${id}7` })) }],
  start: { kind: "clean" },
};

/**
 * The owner's Breach Ring as a pool (2026-10-06): any 3 of the four attack flats at tier 3 or better
 * (T1–T3 of 9: level 60+), any 2 of fire / cold / lightning resistance (T2+, level 71) or all
 * elemental resistance (T2+, level 54), item level 82. Attack speed, on the owner's list, doesn't
 * roll on a Breach Ring (catalog), so the suffix pool holds the resistances.
 */
export const OWNER_POOL_RING = (start: PlanRequest["start"], quality: PlanRequest["quality"] = null, flatTier = 7): PlanRequest => ({
  itemClass: "Rings",
  base: "Breach Ring",
  ilvl: 82,
  targets: [],
  includeUnverified: false,
  quality,
  groups: [
    { side: "prefix", need: 3, candidates: FLAT_FAMILIES.map(([family, id]) => ({ family, minModId: `${id}${flatTier}` })) },
    {
      side: "suffix",
      need: 2,
      candidates: [
        { family: "FireResistance", minModId: "FireResist7" },
        { family: "ColdResistance", minModId: "ColdResist7" },
        { family: "LightningResistance", minModId: "LightningResist7" },
        { family: "AllResistances", minModId: "AllResistances4" },
      ],
    },
  ],
  start,
});

/** fixturePrices() with every catalyst unpriced: the table that rebuilds the owner's prod route and bill. */
export function pricesWithoutCatalysts(): Map<string, number> {
  const out = fixturePrices();
  for (const c of CATALYSTS) out.delete(c.mat.id);
  return out;
}
