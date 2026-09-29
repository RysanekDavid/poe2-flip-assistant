/*
 * The Atlas Masters' node grid as poe2db lists it (https://poe2db.tw/us/Masters_of_the_Atlas,
 * checked 2026-09-29 against 0.5.5): 3 masters × 4 tiers × 3 nodes. The strategy loader rejects a
 * node that is not in this table or sits under the wrong master or tier — community guides have
 * put nodes under the wrong master before, and a data file must not repeat that.
 */
import type { MasterId } from "./schema";

type NamedMaster = Exclude<MasterId, "any">;

export const MASTER_LABEL: Record<MasterId, string> = {
  jado: "Jado",
  doryani: "Doryani",
  hilda: "Hilda",
  any: "Any master",
};

export const MASTER_NODES: Record<NamedMaster, readonly (readonly [string, string, string])[]> = {
  jado: [
    ["Trove Seekers", "In The Wrong Hands", "Unexpected Missions"],
    ["Unforeseen Threats", "Mysterious Gifts", "Eastern Knowledge"],
    ["Partial Translations", "Stolen Relics", "Long Days"],
    ["Keen Appraisal", "Untold Histories", "Ancient Activations"],
  ],
  doryani: [
    ["Stitch the Flesh", "Archaic Corruption", "Evolutionary Pressure"],
    ["Improved Calibration", "Disengaged Safeties", "Careful Procurement"],
    ["Volatile Connection", "Mechanical Guardians", "Hidden Patterns"],
    ["Dam the River", "Remnants of Greatness", "Head of the Snake"],
  ],
  hilda: [
    ["Breeding Season", "Mighty Prey", "Scarred Lands"],
    ["Dangerous Game", "Soul Eaters", "Will of the Draíocht"],
    ["Call of the Spirits", "Ancient Inscriptions", "Lethal Adaptation"],
    ["Patient Battue", "Gutting and Skinning", "Claimed Territories"],
  ],
};

/** Where poe2db puts a node: its master and tier, or null when no master has it. */
export function masterNodeHome(name: string): { master: NamedMaster; tier: number } | null {
  for (const master of Object.keys(MASTER_NODES) as NamedMaster[]) {
    const tierIndex = MASTER_NODES[master].findIndex((tier) => tier.includes(name));
    if (tierIndex >= 0) return { master, tier: tierIndex + 1 };
  }
  return null;
}
