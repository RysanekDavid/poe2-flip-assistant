/* Fixtures for the craft-planner tests: a frozen price table (Divine per unit, rounded 0.5-league
 * magnitudes — the tests assert plan SHAPE, not prices) and the golden requests rebuilt from the
 * curated recipes' targets. */
import { MATS, type MaterialKey } from "../../core/craftMaterials";
import { CATALYSTS } from "../../core/tools/planner/catalystTags";
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

export function fixturePrices(): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, div] of Object.entries(BY_KEY)) out.set(MATS[key as MaterialKey].id, div);
  for (const c of CATALYSTS) out.set(c.mat.id, 0.02);
  for (const r of ESSENCE_OUTCOMES) out.set(r.essenceId, ESSENCE_PRICE[r.essenceId] ?? 0.05);
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
 * + Rarity on a Breach Ring, "include unverified methods" on. With catalysts unpriced it rebuilds the
 * prod bill exactly (13,201 Greater Exalted Orbs + Sinistral Exaltations in one prefix chain).
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

/** fixturePrices() with every catalyst unpriced: the table that rebuilds the owner's prod route and bill. */
export function pricesWithoutCatalysts(): Map<string, number> {
  const out = fixturePrices();
  for (const c of CATALYSTS) out.delete(c.mat.id);
  return out;
}
