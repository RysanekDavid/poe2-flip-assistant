import { MATS } from "./craftMaterials";
import { GUIDES_8 } from "./craftGuideData8";
import { GUIDES_9 } from "./craftGuideData9";
import type { CraftRecipe } from "./craftRecipes";

/**
 * Eighth batch (2026-10-01 creator-video wave, weapons): the bleed spear and the cold-spell wand
 * (craft-to-use: never scanned, no margin), the ilvl-80 Perfect-orb wand lottery and the +4 wand
 * with two alloys and a fracture (both priced live). Tiers/levels: committed RePoE snapshot (game
 * data 0.5.5b). qtyPerAttempt is the expected use per BOUGHT BASE. Provenance and durability:
 * craftProvenanceData3.ts.
 */

const USE_NOTE = "Craft to use: this leg is never priced — it only describes the item.";

export const RECIPES_8: CraftRecipe[] = [
  // 1) Bleed spear (Bosorkana). For your own character; hitRate is the reveal (creator: ~3 in 4).
  {
    key: "spear_bleed_abrasion_necro",
    domain: "weapon",
    purpose: "use",
    label: "Spear · bleed Abrasion + desecrated phys/accuracy (craft to use)",
    base: {
      label: "Magic spear · +3 melee levels + 150%+ physical",
      category: "weapon.spear",
      rarity: "magic",
      stats: [
        { text: "# to Level of all Melee Skills", min: 3 },
        { text: "#% increased Physical Damage", min: 150 },
      ],
      note: `${USE_NOTE} MAGIC spear with +3 or more melee levels and 150%+ increased Physical Damage (the creator's search).`,
    },
    result: {
      label: "Rare spear · +3 melee, % phys, flat phys, phys/accuracy hybrid",
      category: "weapon.spear",
      rarity: "rare",
      stats: [
        { text: "# to Level of all Melee Skills", min: 3, tier: 1 },
        { text: "#% increased Physical Damage", min: 150, tier: 1 },
      ],
      note: USE_NOTE,
    },
    materials: [
      { material: MATS.greaterEssenceAbrasion, qtyPerAttempt: 1, note: "Flat Physical prefix; makes the spear rare." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1.33, note: "One per desecration; ~1.33 at the creator's ~3-in-4 hybrid rate." },
      { material: MATS.preservedJawbone, qtyPerAttempt: 1.33, note: "One per desecration." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1.33, note: "One per reveal." },
      { material: MATS.omenLight, qtyPerAttempt: 0.33, note: "Paired with an Annulment on a missed reveal." },
      { material: MATS.annul, qtyPerAttempt: 0.33, note: "Removes only the desecrated mod under Omen of Light." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1, note: "Two suffixes from one exalt." },
      { material: MATS.greaterExalted, qtyPerAttempt: 1, note: "Modifier-level 35 floor (KB §1); a Perfect Exalted Orb is the pricier option." },
      { material: MATS.whetstone, qtyPerAttempt: 20, note: "Quality to 20% — worst-case count." },
    ],
    hitRate: 0.75,
    guide: GUIDES_8.spear_bleed_abrasion_necro!,
  },

  // 2) Cold-spell wand (ASaVeQ). For your own character; every step lands, the reveal loop is optional.
  {
    key: "wand_cold_skills_sorcery_desecrate",
    domain: "weapon",
    purpose: "use",
    label: "Wand · cold spells + Liege elemental damage (craft to use)",
    base: {
      label: "Magic wand · + cold spell levels + gain as cold (ilvl 65+)",
      category: "weapon.wand",
      rarity: "magic",
      ilvlMin: 65, // Amanamu's (74–89)% increased Elemental Damage wand prefix is modifier level 65 (RePoE)
      stats: [{ text: "# to Level of all Cold Spell Skills", min: 1 }],
      note: `${USE_NOTE} MAGIC wand with + to Level of all Cold Spell Skills and a gain-as-extra-cold prefix.`,
    },
    result: {
      label: "Rare wand · cold levels + spell + elemental damage",
      category: "weapon.wand",
      rarity: "rare",
      ilvlMin: 65,
      stats: [
        { text: "# to Level of all Cold Spell Skills", min: 1, tier: 1 },
        { text: "#% increased Elemental Damage", min: 74, tier: 1 },
      ],
      note: USE_NOTE,
    },
    materials: [
      { material: MATS.greaterEssenceSorcery, qtyPerAttempt: 1, note: "Spell Damage prefix; makes the wand rare." },
      { material: MATS.omenTheLiege, qtyPerAttempt: 1, note: "Guarantees an Amanamu desecration (item text)." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1, note: "Forces the prefix side." },
      { material: MATS.preservedJawbone, qtyPerAttempt: 1, note: "'Desecrates a Rare Weapon or Quiver' (item text)." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1, note: "One reroll of the offered options." },
      { material: MATS.exalted, qtyPerAttempt: 2, note: "The two suffixes." },
    ],
    hitRate: 0.6,
    guide: GUIDES_8.wand_cold_skills_sorcery_desecrate!,
  },

  // 3) ilvl-80 Perfect-orb lottery (Belton). hitRate 0.05: the creator hit 6 of 41 bases across four
  //    hit kinds; T1 Spell Damage — the leg priced here — is taken as about a third of those.
  {
    key: "wand_ilvl80_perfect_orb_lottery",
    domain: "weapon",
    label: "Wand · ilvl-80 Perfect-orb lottery (T1 spell damage)",
    base: {
      label: "Normal Dueling Wand, item level exactly 80",
      type: "Dueling Wand",
      rarity: "normal",
      ilvlMin: 80,
      ilvlMax: 80, // ilvl 81 opens the +5 element-spell suffixes (RePoE) — a different product
      stats: [],
      note: "NORMAL Dueling Wand at item level exactly 80. The creator buys the exceptional 2-socket ones; this search can't filter sockets, so the price is the cheapest ilvl-80 Dueling Wand.",
    },
    result: {
      label: "Magic ilvl-80 Dueling Wand · T1 spell damage",
      type: "Dueling Wand",
      rarity: "magic",
      ilvlMin: 80,
      ilvlMax: 80,
      stats: [{ text: "#% increased Spell Damage", min: 105, tier: 1 }],
      note: "Valued from instant-buyout comparables: magic ilvl-80 Dueling Wands with T1 (105–119)% increased Spell Damage. Spell crit, +4 spell levels and 30%-quality misses also sell; the EV does not count them.",
    },
    materials: [
      { material: MATS.etcher, qtyPerAttempt: 20, note: "Quality to 20% — worst-case count." },
      { material: MATS.perfectTransmute, qtyPerAttempt: 1, note: "Modifier-level 70 floor (KB §1)." },
      { material: MATS.perfectAug, qtyPerAttempt: 1, note: "Modifier-level 70 floor (KB §1)." },
    ],
    hitRate: 0.05,
    guide: GUIDES_8.wand_ilvl80_perfect_orb_lottery!,
  },

  // 4) +4 wand with two alloys, sold right after the fracture (Belton). hitRate 1/3: the fracture picks
  //    one of three mods; the leg prices the best outcome (fractured +4).
  {
    key: "wand_plus4_alloy_fracture",
    domain: "weapon",
    label: "Wand · +4 spells, two alloys, fractured",
    base: {
      label: "Magic wand · +4 spell levels, open prefix (ilvl 80)",
      category: "weapon.wand",
      rarity: "magic",
      ilvlMin: 80,
      ilvlMax: 80, // the craft's later Whittles rely on no ilvl-81 mods (video 8:33–8:42)
      stats: [
        { text: "# to Level of all Spell Skills", min: 4 },
        { text: "# Empty Prefix Modifiers", min: 1, group: "pseudo" },
      ],
      note: "MAGIC ilvl-80 wand with +4 to Level of all Spell Skills and an open prefix. Sockets are not filtered.",
    },
    result: {
      label: "Rare ilvl-80 wand · FRACTURED +4 spell levels",
      category: "weapon.wand",
      rarity: "rare",
      ilvlMin: 80,
      stats: [
        { text: "# to Level of all Spell Skills", min: 4, group: "fractured", tier: 1 },
        { text: "#% increased Cast Speed", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: rare wands with a fractured +4 to Level of all Spell Skills, with cast speed when enough are listed. A fractured alloy mod (the other two outcomes) also sells; the EV does not count it.",
    },
    materials: [
      { material: MATS.greaterEssenceSorcery, qtyPerAttempt: 1, note: "Spell Damage prefix; makes the wand rare." },
      { material: MATS.astridsCreativity, qtyPerAttempt: 1, note: "'Can have 1 additional Crafted Modifiers' (poe2db)." },
      { material: MATS.omenSinistralCrystallisation, qtyPerAttempt: 2, note: "One per alloy — activate after the essence." },
      { material: MATS.transcendentAlloy, qtyPerAttempt: 1, note: "Crafted cast speed + gain as extra cold (suffix)." },
      { material: MATS.omenSinistralExaltation, qtyPerAttempt: 1, note: "Forces the throwaway prefix the Celestial Alloy replaces." },
      { material: MATS.exalted, qtyPerAttempt: 1, note: "The throwaway prefix." },
      { material: MATS.celestialAlloy, qtyPerAttempt: 1, note: "Crafted +1 spell levels + maximum Mana (prefix)." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1, note: "The blocker goes on the prefix side." },
      { material: MATS.omenTheLiege, qtyPerAttempt: 1, note: "Makes the later reveal an Amanamu mod." },
      { material: MATS.preservedJawbone, qtyPerAttempt: 1, note: "The fracture blocker." },
      { material: MATS.fracturing, qtyPerAttempt: 1, note: "1 in 3 per mod with the blocker (KB §2)." },
    ],
    hitRate: 0.33,
    guide: GUIDES_9.wand_plus4_alloy_fracture!,
  },
];
