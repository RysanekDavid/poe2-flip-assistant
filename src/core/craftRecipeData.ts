import { MATS } from "./craftMaterials";
import type { CraftRecipe } from "./craftRecipes";

/**
 * The five curated recipes. Kept in their own module (data, not logic) so craftRecipes.ts stays
 * a small types file well under the line cap. Material ids are verified against the live ninja
 * economy; hitRate / qtyPerAttempt / stat mins are market-research estimates — see each `note`.
 */
export const RECIPES: CraftRecipe[] = [
  // 1) Delirium suffix push on a Time-Lost jewel. The guide transcript ("projít Contempt → +1
  //    suffix → cranium → annul") is the source; the exact Contempt tier is uncertain, so the
  //    liquid is priced at Potent tier, qty 2 (~50% proc), and carries a manual fallback until
  //    the Delirium category has been polled at least once.
  {
    key: "jewel_suffix_push",
    label: "Time-Lost Sapphire · +1 suffix push",
    source: "guide transcript (Contempt → +1 suffix → cranium → annul)",
    base: {
      label: "Magic Time-Lost Sapphire",
      type: "Time-Lost Sapphire",
      rarity: "magic",
      stats: [],
      note: "Buy a magic Time-Lost Sapphire that already carries one wanted suffix. Base search is by type only — magic-jewel roll quality varies, treat the cheapest as a rough floor.",
    },
    result: {
      label: "Rare Time-Lost Sapphire (multi-suffix)",
      type: "Time-Lost Sapphire",
      rarity: "rare",
      stats: [],
      note: "Result valued as a rare Time-Lost Sapphire (median of the cheapest priced comparables). Specific desirable-suffix combos sell higher — this is a conservative floor, no stat filter applied.",
    },
    materials: [
      {
        material: MATS.potentLiquidContempt,
        qtyPerAttempt: 2,
        manualPriceDiv: 0.02,
        note: "Contempt emotion/tier uncertain — Potent tier assumed, ~50% proc → qty 2. manualPriceDiv is a placeholder until the Delirium category is polled; then the live price overrides it.",
      },
      { material: MATS.preservedCranium, qtyPerAttempt: 1, note: "Adds a suffix; assumes one cranium per successful push." },
      { material: MATS.annul, qtyPerAttempt: 1, note: "Remove an off-mod to finish. Annul risk is folded into hitRate, not extra qty." },
    ],
    hitRate: 0.35,
    steps: [
      "Buy a magic Time-Lost Sapphire with one desired suffix",
      "Apply Potent Liquid Contempt to push toward +1 suffix",
      "Preserved Cranium to add the extra suffix",
      "Annul the off-mod, keep the wanted suffixes",
    ],
  },

  // 2) Amanamu's Gaze abyssal bow. Result is a weapon → valued by physical DPS (pdpsMin) via the
  //    new equipment_filters extension, not by mods alone.
  {
    key: "bow_amanamu",
    label: "Bow · Amanamu's Gaze phys",
    source: "abyssal-bone bow craft (Amanamu's Gaze)",
    base: {
      label: "White high-tier bow base",
      category: "weapon.bow",
      rarity: "normal",
      ilvlMin: 80,
      stats: [],
      note: "Base is a white ilvl80+ bow with an abyssal socket. Priced by category (bow bases vary); the cheapest white base is the intended buy.",
    },
    result: {
      label: "Rare bow · high pdps",
      category: "weapon.bow",
      rarity: "rare",
      ilvlMin: 80,
      pdpsMin: 250,
      stats: [{ text: "#% increased Physical Damage", min: 100 }],
      note: "Valued as a rare bow at ≥250 pdps. pdps floor is an estimate — adjust to the league's sellable threshold.",
    },
    materials: [
      { material: MATS.amanamusGaze, qtyPerAttempt: 1, note: "Socketed abyssal bone that seeds the phys-DPS mods." },
      { material: MATS.perfectEssenceAbrasion, qtyPerAttempt: 1, note: "Guarantees a physical mod; Perfect tier assumed for the top phys roll." },
      { material: MATS.exalted, qtyPerAttempt: 4, note: "Expected exalts to fill remaining affixes across re-tries." },
    ],
    hitRate: 0.25,
    steps: [
      "Buy a white ilvl80+ bow base with an abyssal socket",
      "Socket Amanamu's Gaze",
      "Perfect Essence of Abrasion for the guaranteed physical mod",
      "Exalt-slam the remaining affixes toward the pdps threshold",
    ],
  },

  // 3) Catalysed exalt slam on a ring — Omen of Catalysing Exaltation makes the slam favour the
  //    catalyst-boosted mod type.
  {
    key: "ring_catalysing_exalt",
    label: "Ring · catalysed exalt slam",
    source: "Omen of Catalysing Exaltation ring craft",
    base: {
      label: "Rare ring (open affix)",
      type: "Sapphire Ring",
      rarity: "rare",
      ilvlMin: 75,
      stats: [],
      note: "Buy a near-finished rare ring with an open affix and quality from catalysts. Base type is an example (Sapphire Ring) — swap to the league's chase ring base.",
    },
    result: {
      label: "Rare ring · attributes",
      type: "Sapphire Ring",
      rarity: "rare",
      ilvlMin: 75,
      stats: [{ text: "# to all Attributes", min: 10 }],
      note: "Valued as a rare Sapphire Ring with +all-attributes. Real value depends on the full affix set — floor estimate.",
    },
    materials: [
      { material: MATS.adaptiveCatalyst, qtyPerAttempt: 10, note: "Catalyst quality raises the targeted mod-type weight; ~10 to reach useful quality." },
      { material: MATS.omenCatalysingExaltation, qtyPerAttempt: 1, note: "Biases the exalt slam toward the catalysed mod type." },
      { material: MATS.exalted, qtyPerAttempt: 1, note: "The slam itself." },
    ],
    hitRate: 0.4,
    steps: [
      "Buy a rare ring with an open affix",
      "Apply Adaptive Catalysts to raise quality on the wanted mod type",
      "Slam with Exalted Orb under Omen of Catalysing Exaltation",
    ],
  },

  // 4) Fracture a +3 amulet, then reforge the rest. Crystallisation omen biases which side is
  //    protected during the fracture step.
  {
    key: "amulet_fracture_plus3",
    label: "Amulet · fracture +3, reforge",
    source: "Fracturing Orb + Crystallisation omen amulet craft",
    base: {
      label: "Rare amulet with +3 skills",
      type: "Stellar Amulet",
      rarity: "rare",
      ilvlMin: 80,
      stats: [{ text: "# to Level of all Spell Skills", min: 3 }],
      note: "Buy a rare amulet that already rolled +3 to a skill group. Stellar Amulet is an example base — use the league's meta amulet.",
    },
    result: {
      label: "Rare amulet · fractured +3 + reforged suffixes",
      type: "Stellar Amulet",
      rarity: "rare",
      ilvlMin: 80,
      stats: [{ text: "# to Level of all Spell Skills", min: 3 }],
      note: "Valued as a rare amulet carrying +3 skills. A fractured +3 with good reforged mods sells well above the bare-+3 floor used here.",
    },
    materials: [
      { material: MATS.fracturing, qtyPerAttempt: 1, note: "Fractures a random mod; the +3 surviving is baked into hitRate." },
      {
        material: MATS.omenDextralCrystallisation,
        qtyPerAttempt: 1,
        note: "Crystallisation omen protects one side during the fracture. Dextral vs Sinistral depends on the +3 affix position — verify per item.",
      },
      { material: MATS.greaterChaos, qtyPerAttempt: 5, note: "Expected greater-chaos reforges of the non-fractured mods across re-tries." },
    ],
    hitRate: 0.2,
    steps: [
      "Buy a rare amulet with +3 to a skill group",
      "Fracture the +3 with a Fracturing Orb under the correct Crystallisation omen",
      "Greater Chaos the remaining mods until the suffixes land",
    ],
  },

  // 5) Putrefaction-omen boots. Omen of Putrefaction shapes the essence outcome toward the
  //    chaos/movement mod pool.
  {
    key: "boots_putrefaction",
    label: "Boots · putrefaction MS",
    source: "Omen of Putrefaction essence boots craft",
    base: {
      label: "White boots base (ES/evasion)",
      category: "armour.boots",
      rarity: "normal",
      ilvlMin: 80,
      stats: [],
      note: "Base is a white ilvl80+ boots base — priced by category (boots bases vary); the cheapest white base is the intended buy.",
    },
    result: {
      label: "Rare boots · 30%+ movement speed",
      category: "armour.boots",
      rarity: "rare",
      ilvlMin: 80,
      stats: [{ text: "#% increased Movement Speed", min: 30 }],
      note: "Valued as rare boots with ≥30% movement speed. Extra resistances/life stack value above this floor.",
    },
    materials: [
      { material: MATS.omenPutrefaction, qtyPerAttempt: 1, note: "Shapes the essence roll toward the wanted mod pool." },
      { material: MATS.greaterEssenceHaste, qtyPerAttempt: 1, note: "Seeds movement/attack speed; Greater tier assumed for a usable MS roll." },
      { material: MATS.exalted, qtyPerAttempt: 3, note: "Expected exalts to fill the remaining affixes." },
    ],
    hitRate: 0.3,
    steps: [
      "Buy a white ilvl80+ boots base",
      "Essence of Haste under Omen of Putrefaction for the movement-speed roll",
      "Exalt-slam the remaining affixes (resists / life)",
    ],
  },
];
