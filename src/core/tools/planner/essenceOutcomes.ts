import type { CraftCatalog } from "../craftmoves/catalog";
import type { EssenceWrite } from "./types";

/**
 * Curated essence → item class → the catalog mod it writes, for the planner's MVP classes (Rings,
 * Amulets, Belts, Jewels). RePoE ships no essence table (the Coach mirrors the Perfect/corrupted part
 * in services/coach/src/items/essence.py), so every row cites the poe2db page its text was read from
 * (accessed 2026-10-02) and the catalog mod whose text matches it exactly.
 *
 * Deliberately NOT here (do not add without a source that settles them):
 *   - Jewels: no essence page lists a jewel class (all 44 pages checked) — the planner writes nothing
 *     into a jewel with an essence.
 *   - Greater / Perfect Essence of the Infinite: "Strength, Dexterity or Intelligence" — which
 *     attribute is not a guaranteed choice, so it is not a guaranteed write of one target.
 *   - Essence of Hysteria: one mod per class on poe2db but no proof it is guaranteed per class.
 *   - Essence of the Abyss (a "Mark" to desecrate, not a target) and Essence of Insanity (needs
 *     corruption, out of scope).
 * poe2db shows an essence's own level (e.g. 48) beside the mod; the mod's RePoE level (e.g. 60) is
 * what the planner gates on. The independent fact-check of this table is a merge gate.
 */

export interface EssenceOutcomeRow {
  essenceId: string;
  label: string;
  itemClass: "Rings" | "Amulets" | "Belts";
  modId: string;
  /** The modifier text as poe2db words it (em-dash ranges normalised to "-"). */
  poe2dbText: string;
  tier: EssenceWrite["tier"];
  source: string;
}

const DB = "https://poe2db.tw/us/";

function rows(essenceId: string, label: string, tier: EssenceWrite["tier"], page: string, perClass: Array<[EssenceOutcomeRow["itemClass"], string, string]>): EssenceOutcomeRow[] {
  return perClass.map(([itemClass, modId, poe2dbText]) => ({ essenceId, label, itemClass, modId, poe2dbText, tier, source: `${DB}${page}` }));
}

const RES = (modId: string, text: string): Array<[EssenceOutcomeRow["itemClass"], string, string]> => [
  ["Rings", modId, text],
  ["Amulets", modId, text],
  ["Belts", modId, text],
];

export const ESSENCE_OUTCOMES: readonly EssenceOutcomeRow[] = [
  ...rows("greater-essence-of-grounding", "Greater Essence of Grounding", "greater", "Greater_Essence_of_Grounding", RES("LightningResist6", "+(31-35)% to Lightning Resistance")),
  ...rows("greater-essence-of-insulation", "Greater Essence of Insulation", "greater", "Greater_Essence_of_Insulation", RES("FireResist6", "+(31-35)% to Fire Resistance")),
  ...rows("greater-essence-of-thawing", "Greater Essence of Thawing", "greater", "Greater_Essence_of_Thawing", RES("ColdResist6", "+(31-35)% to Cold Resistance")),
  ...rows("greater-essence-of-ruin", "Greater Essence of Ruin", "greater", "Greater_Essence_of_Ruin", RES("ChaosResist4", "+(16-19)% to Chaos Resistance")),
  ...rows("greater-essence-of-opulence", "Greater Essence of Opulence", "greater", "Greater_Essence_of_Opulence", [
    ["Rings", "ItemFoundRarityIncrease3", "(15-18)% increased Rarity of Items found"],
    ["Amulets", "ItemFoundRarityIncrease3", "(15-18)% increased Rarity of Items found"],
  ]),
  ...rows("greater-essence-of-the-body", "Greater Essence of the Body", "greater", "Greater_Essence_of_the_Body", [
    ["Amulets", "IncreasedLife7", "+(85-99) to maximum Life"],
    ["Belts", "IncreasedLife8", "+(100-119) to maximum Life"],
  ]),
  ...rows("greater-essence-of-the-mind", "Greater Essence of the Mind", "greater", "Greater_Essence_of_the_Mind", [
    ["Rings", "IncreasedMana8", "+(90-104) to maximum Mana"],
    ["Amulets", "IncreasedMana8", "+(90-104) to maximum Mana"],
    ["Belts", "IncreasedMana7", "+(80-89) to maximum Mana"],
  ]),
  ...rows("perfect-essence-of-enhancement", "Perfect Essence of Enhancement", "perfect", "Perfect_Essence_of_Enhancement", [
    ["Amulets", "EssenceGlobalDefences1", "(20-30)% increased Global Armour, Evasion and Energy Shield"],
  ]),
  ...rows("perfect-essence-of-insulation", "Perfect Essence of Insulation", "perfect", "Perfect_Essence_of_Insulation", [
    ["Belts", "EssenceFireRecoupLife1", "(26-30)% of Fire Damage taken Recouped as Life"],
  ]),
  ...rows("perfect-essence-of-the-mind", "Perfect Essence of the Mind", "perfect", "Perfect_Essence_of_the_Mind", [
    ["Rings", "EssenceIncreasedManaPercent1", "(4-6)% increased maximum Mana"],
  ]),
  ...rows("essence-of-the-breach", "Essence of the Breach", "corrupted", "Essence_of_the_Breach", [
    ["Rings", "EssenceBreach", "+20% to Maximum Quality"],
    ["Amulets", "EssenceBreach", "+20% to Maximum Quality"],
  ]),
];

/** The Breach essence is the quality path, never a target write. */
export const BREACH_ESSENCE_ID = "essence-of-the-breach";

/** Every essence row for a class (the Breach quality row excluded). */
export function essencesFor(itemClass: string): EssenceOutcomeRow[] {
  return ESSENCE_OUTCOMES.filter((r) => r.itemClass === itemClass && r.essenceId !== BREACH_ESSENCE_ID);
}

/**
 * Essence writes that satisfy a target: same family, mod level at or above the minimum tier's.
 * A crafted-only target (Perfect Essence of the Mind) matches its own mod id.
 */
export function essenceWritesFor(cat: CraftCatalog, itemClass: string, family: string, minLevel: number, minModId: string): EssenceWrite[] {
  return essencesFor(itemClass)
    .filter((r) => {
      const mod = cat.mods[r.modId];
      if (!mod) throw new Error(`essenceOutcomes: ${r.essenceId} → ${r.modId} is not in the craft catalog — rebuild or fix the row`);
      return r.modId === minModId || (mod.family === family && mod.level >= minLevel && !mod.craftedOnly);
    })
    .map((r) => ({ essenceId: r.essenceId, label: r.label, modId: r.modId, tier: r.tier, source: r.source }));
}
