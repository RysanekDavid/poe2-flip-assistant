import type { EssenceOutcomeRow } from "./essenceOutcomes";

/**
 * Curated alloy → item class → the crafted mod it writes, for the planner's classes (Rings, Amulets,
 * Belts; poe2db lists no alloy for jewels). An alloy reads "Removes a random modifier and augments a
 * Rare item with a new guaranteed modifier" (entity catalog, game data 0.5.5b) and its mod is the
 * item's ONE crafted mod (0.5.0 notes, forum 3932540) — so the planner treats it as a Perfect-tier
 * write. Every row cites the poe2db page its text was read from (accessed 2026-10-07; em-dash ranges
 * normalised to "-") and the RePoE Alloy* mod whose catalog text matches it exactly.
 *
 * Deliberately NOT here: the alloys with no Ring/Amulet/Belt mod (Adaptive, Expansive, Cyclonic,
 * Prismatic, Mystic, Celestial, Transcendent, Runebinder's, Runefather's), and the other classes of
 * the alloys below (Swift gloves/shields, Protective weapons/shields, Sovereign weapons/armour).
 * poe2db's "Required Level" is the character requirement, not the RePoE mod level the planner reads.
 */

type ClassRow = [EssenceOutcomeRow["itemClass"], string, string];

const DB = "https://poe2db.tw/us/";

function rows(alloyId: string, label: string, page: string, perClass: ClassRow[]): EssenceOutcomeRow[] {
  return perClass.map(([itemClass, modId, poe2dbText]) => ({ essenceId: alloyId, label, itemClass, modId, poe2dbText, tier: "alloy", source: `${DB}${page}` }));
}

const SOVEREIGN_TEXT = "(20-30)% increased Explicit Resistance Modifier magnitudes";

export const ALLOY_OUTCOMES: readonly EssenceOutcomeRow[] = [
  ...rows("swift-alloy", "Swift Alloy", "Swift_Alloy", [
    ["Rings", "AlloyAttackSpeedRing1", "(7-9)% increased Attack Speed"],
    ["Belts", "AlloyFlaskChargesPerSecond1", "Flasks gain (0.75-1) charges per Second"],
  ]),
  ...rows("runic-alloy", "Runic Alloy", "Runic_Alloy", [
    ["Rings", "AlloyMaximumRunicWard1", "+(37-49) to maximum Runic Ward"],
    ["Amulets", "AlloyMaximumRunicWardPercent1", "(6-10)% increased maximum Runic Ward"],
    ["Belts", "AlloyRunicWardRechargeRate1", "(15-20)% increased Runic Ward Regeneration Rate"],
  ]),
  ...rows("protective-alloy", "Protective Alloy", "Protective_Alloy", [["Belts", "AlloyRecoverRunicWardOnCharmUse1", "Recover (32-45) Runic Ward when a Charm is used"]]),
  ...rows("sovereign-alloy", "Sovereign Alloy", "Sovereign_Alloy", [
    ["Rings", "AlloyEffectOfResistanceMods1", SOVEREIGN_TEXT],
    ["Amulets", "AlloyEffectOfResistanceMods1", SOVEREIGN_TEXT],
    ["Belts", "AlloyEffectOfResistanceMods1", SOVEREIGN_TEXT],
  ]),
];

/** Every alloy row for a class. */
export function alloysFor(itemClass: string): EssenceOutcomeRow[] {
  return ALLOY_OUTCOMES.filter((r) => r.itemClass === itemClass);
}

/**
 * Omen of Crystallisation steering an alloy. Its item text names only "your next Perfect or
 * Corrupted Essence", yet creators steer alloys with it on camera (docs/kb/sources/transcripts/25
 * 0:51–1:20, 27 17:12–17:21) and players report the same (forum 3949532). `text` is player-facing.
 */
export const CRYSTALLISATION_ALLOY_FACT = {
  basis: "creator_stated",
  text: "A Crystallisation omen steering an alloy is shown in creator videos and player reports (forum thread 3949532), but the omen's own text names only Perfect or Corrupted Essences — it may change.",
} as const;
