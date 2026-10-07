import type { CraftCatalog } from "../craftmoves/catalog";
import { ALLOY_OUTCOMES, alloysFor } from "./alloyOutcomes";
import { ESSENCE_OUTCOMES, essencesFor, type EssenceOutcomeRow } from "./essenceOutcomes";
import type { EssenceWrite } from "./types";

/** Every curated crafted-mod writer: the essences, then the alloys (alloyOutcomes.ts). */
export const CRAFTED_WRITE_OUTCOMES: readonly EssenceOutcomeRow[] = [...ESSENCE_OUTCOMES, ...ALLOY_OUTCOMES];

/**
 * Essence and alloy writes that satisfy a target: same family, mod level at or above the minimum
 * tier's. A crafted-only target (Perfect Essence of the Mind, every alloy mod) matches its own mod id.
 */
export function essenceWritesFor(cat: CraftCatalog, itemClass: string, family: string, minLevel: number, minModId: string): EssenceWrite[] {
  return [...essencesFor(itemClass), ...alloysFor(itemClass)]
    .filter((r) => {
      const mod = cat.mods[r.modId];
      if (!mod) throw new Error(`craftedWrites: ${r.essenceId} → ${r.modId} is not in the craft catalog — rebuild or fix the row`);
      return r.modId === minModId || (mod.family === family && mod.level >= minLevel && !mod.craftedOnly);
    })
    .map((r) => ({ essenceId: r.essenceId, label: r.label, modId: r.modId, tier: r.tier, source: r.source }));
}
