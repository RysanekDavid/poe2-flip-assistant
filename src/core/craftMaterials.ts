/**
 * Single source of truth for craft-material identity. Every `id` is the poe.ninja item id
 * (kebab-case, verified live against the DB / ninja endpoint) so the margin engine can price
 * a material straight from the shared price_snapshots pipeline — no per-recipe id guessing.
 *
 * Naming traps that bit us live (kept as regression notes): British spellings —
 * "Catalysing", "Crystallisation"; omens are "…of the Liege" not "…of Liege"; the Delirium
 * "Contempt" liquid only exists as a Potent/Ancient-Potent tier, no plain "Liquid Contempt".
 */
export type MaterialGroup = "omen" | "essence" | "catalyst" | "bone" | "currency" | "delirium";

export interface CraftMaterial {
  id: string; // poe.ninja item id (matches price_snapshots.item_id)
  label: string; // display name
  group: MaterialGroup;
}

// Grouped so the UI can render sections and the engine knows which ninja category feeds each.
export const MATS = {
  // --- omens (ninja category "Ritual") ---
  omenPutrefaction: { id: "omen-of-putrefaction", label: "Omen of Putrefaction", group: "omen" },
  omenCatalysingExaltation: { id: "omen-of-catalysing-exaltation", label: "Omen of Catalysing Exaltation", group: "omen" },
  omenTheLiege: { id: "omen-of-the-liege", label: "Omen of the Liege", group: "omen" },
  omenDextralCrystallisation: { id: "omen-of-dextral-crystallisation", label: "Omen of Dextral Crystallisation", group: "omen" },
  omenSinistralCrystallisation: { id: "omen-of-sinistral-crystallisation", label: "Omen of Sinistral Crystallisation", group: "omen" },
  omenGreaterExaltation: { id: "omen-of-greater-exaltation", label: "Omen of Greater Exaltation", group: "omen" },
  omenDextralExaltation: { id: "omen-of-dextral-exaltation", label: "Omen of Dextral Exaltation", group: "omen" },
  omenSinistralExaltation: { id: "omen-of-sinistral-exaltation", label: "Omen of Sinistral Exaltation", group: "omen" },
  omenDextralAnnulment: { id: "omen-of-dextral-annulment", label: "Omen of Dextral Annulment", group: "omen" },
  omenWhittling: { id: "omen-of-whittling", label: "Omen of Whittling", group: "omen" },
  omenSinistralNecromancy: { id: "omen-of-sinistral-necromancy", label: "Omen of Sinistral Necromancy", group: "omen" },
  omenDextralNecromancy: { id: "omen-of-dextral-necromancy", label: "Omen of Dextral Necromancy", group: "omen" },
  omenAbyssalEchoes: { id: "omen-of-abyssal-echoes", label: "Omen of Abyssal Echoes", group: "omen" },
  omenSinistralErasure: { id: "omen-of-sinistral-erasure", label: "Omen of Sinistral Erasure", group: "omen" },
  omenLight: { id: "omen-of-light", label: "Omen of Light", group: "omen" },
  omenSinistralAnnulment: { id: "omen-of-sinistral-annulment", label: "Omen of Sinistral Annulment", group: "omen" },

  // --- abyssal bones + gazes (ninja category "Abyss") ---
  preservedCranium: { id: "preserved-cranium", label: "Preserved Cranium", group: "bone" },
  preservedJawbone: { id: "preserved-jawbone", label: "Preserved Jawbone", group: "bone" },
  ancientJawbone: { id: "ancient-jawbone", label: "Ancient Jawbone", group: "bone" },
  preservedCollarbone: { id: "preserved-collarbone", label: "Preserved Collarbone", group: "bone" },
  amanamusGaze: { id: "amanamus-gaze", label: "Amanamu's Gaze", group: "bone" },
  ancientRib: { id: "ancient-rib", label: "Ancient Rib", group: "bone" },
  gnawedRib: { id: "gnawed-rib", label: "Gnawed Rib", group: "bone" },
  preservedRib: { id: "preserved-rib", label: "Preserved Rib", group: "bone" },

  // --- catalysts (ninja category "Breach") ---
  adaptiveCatalyst: { id: "adaptive-catalyst", label: "Adaptive Catalyst", group: "catalyst" },
  refinedAdaptiveCatalyst: { id: "refined-adaptive-catalyst", label: "Refined Adaptive Catalyst", group: "catalyst" },
  tulsCatalyst: { id: "tuls-catalyst", label: "Tul's Catalyst", group: "catalyst" },
  // Fire (Xoph's) / Lightning (Esh's) — the giga-spirit amulet biases toward these res rolls (never Cold).
  xophsCatalyst: { id: "xophs-catalyst", label: "Xoph's Catalyst", group: "catalyst" },
  eshsCatalyst: { id: "eshs-catalyst", label: "Esh's Catalyst", group: "catalyst" },

  // --- essences (ninja category "Essences") ---
  greaterEssenceAbrasion: { id: "greater-essence-of-abrasion", label: "Greater Essence of Abrasion", group: "essence" },
  perfectEssenceAbrasion: { id: "perfect-essence-of-abrasion", label: "Perfect Essence of Abrasion", group: "essence" },
  greaterEssenceHaste: { id: "greater-essence-of-haste", label: "Greater Essence of Haste", group: "essence" },
  greaterEssenceBattle: { id: "greater-essence-of-battle", label: "Greater Essence of Battle", group: "essence" },
  greaterEssenceTheBody: { id: "greater-essence-of-the-body", label: "Greater Essence of the Body", group: "essence" },
  greaterEssenceSeeking: { id: "greater-essence-of-seeking", label: "Greater Essence of Seeking", group: "essence" },
  greaterEssenceOpulence: { id: "greater-essence-of-opulence", label: "Greater Essence of Opulence", group: "essence" },
  greaterEssenceInsulation: { id: "greater-essence-of-insulation", label: "Greater Essence of Insulation", group: "essence" },
  perfectEssenceEnhancement: { id: "perfect-essence-of-enhancement", label: "Perfect Essence of Enhancement", group: "essence" },
  // Base tier only on the exchange — no Greater/Perfect "Hysteria" (the +2-projectile gloves suffix 50/50).
  essenceOfHysteria: { id: "essence-of-hysteria", label: "Essence of Hysteria", group: "essence" },
  // Converts an existing mod into a "Mark of the Abyssal Lord" that a Jawbone turns into a Desecrated slot.
  essenceOfTheAbyss: { id: "essence-of-the-abyss", label: "Essence of the Abyss", group: "essence" },
  // Replaces a designated mod with the breach quality mod (the attack-ring craft's whittle shuttle).
  essenceOfTheBreach: { id: "essence-of-the-breach", label: "Essence of the Breach", group: "essence" },

  // --- currency (ninja category "Currency") ---
  divine: { id: "divine", label: "Divine Orb", group: "currency" },
  exalted: { id: "exalted", label: "Exalted Orb", group: "currency" },
  greaterExalted: { id: "greater-exalted-orb", label: "Greater Exalted Orb", group: "currency" },
  perfectExalted: { id: "perfect-exalted-orb", label: "Perfect Exalted Orb", group: "currency" },
  annul: { id: "annul", label: "Orb of Annulment", group: "currency" },
  fracturing: { id: "fracturing-orb", label: "Fracturing Orb", group: "currency" },
  artificers: { id: "artificers", label: "Artificer's Orb", group: "currency" },
  artificersShard: { id: "artificers-shard", label: "Artificer's Shard", group: "currency" },
  scrap: { id: "scrap", label: "Armourer's Scrap", group: "currency" },
  chaos: { id: "chaos", label: "Chaos Orb", group: "currency" },
  greaterChaos: { id: "greater-chaos-orb", label: "Greater Chaos Orb", group: "currency" },
  regal: { id: "regal", label: "Regal Orb", group: "currency" },
  aug: { id: "aug", label: "Orb of Augmentation", group: "currency" },
  perfectAug: { id: "perfect-orb-of-augmentation", label: "Perfect Orb of Augmentation", group: "currency" },
  transmute: { id: "transmute", label: "Orb of Transmutation", group: "currency" },
  vaal: { id: "vaal", label: "Vaal Orb", group: "currency" },
  vaalCultivation: { id: "vaal-cultivation-orb", label: "Vaal Cultivation Orb", group: "currency" },
  chance: { id: "chance", label: "Orb of Chance", group: "currency" },
  // Force-converts a prefix into the alloy's guaranteed near-min-tier mod (e.g. cast speed) under a
  // Crystallisation omen. Ninja lists it under "Verisium", priced through the same snapshot pipeline.
  transcendentAlloy: { id: "transcendent-alloy", label: "Transcendent Alloy", group: "currency" },
  // The "additional crafted modifier" orb (auto-captioned "Acid's Creativity" in the source video).
  astridsCreativity: { id: "astrids-creativity", label: "Astrid's Creativity", group: "currency" },

  // --- delirium instills (ninja category "Delirium") ---
  // Non-Ancient Potent Contempt works on rare BASIC jewels but grants a FIXED damage prefix
  // (Sapphire→chaos, Ruby→phys, Emerald→ele) — NOT the "+1 Modifier allowed" mod. That one comes
  // only from the Ancient tier, and Ancient liquids apply ONLY to rare Time-Lost jewels.
  potentLiquidContempt: { id: "potent-liquid-contempt", label: "Potent Liquid Contempt", group: "delirium" },
  ancientPotentLiquidContempt: { id: "ancient-potent-liquid-contempt", label: "Ancient Potent Liquid Contempt", group: "delirium" },
  ancientPotentLiquidFerocity: { id: "ancient-potent-liquid-ferocity", label: "Ancient Potent Liquid Ferocity", group: "delirium" },
} as const satisfies Record<string, CraftMaterial>;

export type MaterialKey = keyof typeof MATS;

/** Flat list of every registered material — for id-sanity checks and the materials panel. */
export const ALL_MATERIALS: readonly CraftMaterial[] = Object.values(MATS);

/** Group render/order metadata for the materials panel (dark-theme section headings). */
export const MATERIAL_GROUPS: ReadonlyArray<{ group: MaterialGroup; label: string }> = [
  { group: "omen", label: "Omens" },
  { group: "essence", label: "Essences" },
  { group: "catalyst", label: "Catalysts" },
  { group: "bone", label: "Abyssal Bones" },
  { group: "delirium", label: "Delirium Instills" },
  { group: "currency", label: "Currency" },
];
