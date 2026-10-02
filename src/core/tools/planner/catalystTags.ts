import type { CraftMaterial } from "../../craftMaterials";

/**
 * Ring/amulet catalysts (entity catalog, game data 0.5.5b: "Adds quality that enhances <X> modifiers
 * on a ring or amulet") → the RePoE implicit tags an Omen of Catalysing Exaltation biases toward.
 * The item text names the theme, not the tag ids: this mapping is OUR reading (grade uv), which is
 * why every catalysed odds figure is an estimate. KB §8 lists the same 13 themes.
 */

export interface CatalystInfo {
  mat: CraftMaterial;
  /** A mod counts as matching when any of its implicit tags is in this list. */
  tags: readonly string[];
}

const cat = (id: string, label: string, tags: string[]): CatalystInfo => ({ mat: { id, label, group: "catalyst" }, tags });

export const CATALYSTS: readonly CatalystInfo[] = [
  cat("xophs-catalyst", "Xoph's Catalyst", ["fire"]),
  cat("tuls-catalyst", "Tul's Catalyst", ["cold"]),
  cat("eshs-catalyst", "Esh's Catalyst", ["lightning"]),
  cat("uul-netols-catalyst", "Uul-Netol's Catalyst", ["physical"]),
  cat("chayulas-catalyst", "Chayula's Catalyst", ["chaos"]),
  cat("flesh-catalyst", "Flesh Catalyst", ["life"]),
  cat("neural-catalyst", "Neural Catalyst", ["mana"]),
  cat("carapace-catalyst", "Carapace Catalyst", ["defences"]),
  cat("reaver-catalyst", "Reaver Catalyst", ["attack"]),
  cat("sibilant-catalyst", "Sibilant Catalyst", ["caster"]),
  cat("skittering-catalyst", "Skittering Catalyst", ["speed"]),
  cat("adaptive-catalyst", "Adaptive Catalyst", ["attribute"]),
  cat("necrotic-catalyst", "Necrotic Catalyst", ["minion"]),
];

export const CATALYST_TAG_GRADE = "uv" as const;

/**
 * Quality one catalyst adds on an ilvl-75+ ring/amulet: ~1% (creator footage: 18 Tul's took 0 → 20%,
 * GDLDxn6yxEs 4:26–4:47; theory-gaps 2a). Used ONLY inside the cost estimate — steps say "to 40%".
 */
export const QUALITY_PER_CATALYST = 1;
/** Player prose for the step text and badge; its evidence is creator footage (sources.ts "creators"). */
export const QUALITY_PER_CATALYST_NOTE = "About 1% quality per catalyst on item level 75+ (seen in creator videos) — the cost counts that, the step just says the target quality.";

export function catalystById(id: string): CatalystInfo {
  const hit = CATALYSTS.find((c) => c.mat.id === id);
  if (!hit) throw new Error(`unknown catalyst "${id}"`);
  return hit;
}

export const matchesCatalyst = (catalyst: CatalystInfo, modTags: readonly string[]): boolean => catalyst.tags.some((t) => modTags.includes(t));

/** The catalyst whose tag the target mod carries (first in table order), or null when none does. */
export function catalystFor(modTags: readonly string[]): CatalystInfo | null {
  return CATALYSTS.find((c) => matchesCatalyst(c, modTags)) ?? null;
}
