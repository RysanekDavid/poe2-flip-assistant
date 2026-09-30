import { MATS } from "./craftMaterials";
import { GUIDES_6 } from "./craftGuideData6";
import { CHEAP_BASE_FLOOR_EX } from "./craftValuation";
import type { CraftRecipe } from "./craftRecipes";

/**
 * Sixth batch (2026-09-30 second wave, armour + weapons): the Katla's Gloom putrefaction gloves, the
 * two essence + Sinistral-desecration bows, the Flames quarterstaff, the 35% MS evasion boots and the
 * budget Evasion/ES body armour. All come from single entries of the fixerpimp-gamer 0.5 compilation
 * (provenance in craftProvenanceData2.ts), so every recipe ships as a draft.
 *
 * Bases, tiers and item levels were read from the committed RePoE snapshot (craft catalog + base
 * items, game data 0.5.5b); essence mods from poe2db's per-class tables. qtyPerAttempt is the
 * expected use per BOUGHT BASE. Stat thresholds on the legs are ours unless a note says otherwise.
 */

/** The bows share the materials except the essence (the compilation's bow_001 / bow_002). */
function bowMats(essence: typeof MATS.greaterEssenceAbrasion | typeof MATS.greaterEssenceSeeking): CraftRecipe["materials"] {
  return [
    { material: essence, qtyPerAttempt: 1, note: "Magic → rare with the guaranteed third-highest tier (poe2db + RePoE)." },
    { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1, note: "Forces the Jawbone's desecration onto the open prefix." },
    { material: MATS.preservedJawbone, qtyPerAttempt: 1, note: "'Desecrates a Rare Weapon or Quiver' (item text); Preserved works at any item level." },
    { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 0.3, note: "Optional in the compilation — only on a junk option set." },
    { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1 },
    { material: MATS.greaterExalted, qtyPerAttempt: 1, note: "Modifier-level 35 floor (KB §1); the compilation allows a Perfect Exalt instead." },
  ];
}

const BOW_BASE: CraftRecipe["base"] = {
  label: "Magic bow · 110%+ phys (ilvl 75+)",
  category: "weapon.bow",
  rarity: "magic",
  ilvlMin: 75, // the (155–169)% phys tier is modifier level 75 on bows (RePoE)
  stats: [{ text: "#% increased Physical Damage", min: 110 }],
  note: "MAGIC bow with % increased Physical Damage (110%+ is our threshold; the compilation: 'higher is better, any % works') and one suffix, the second prefix open. ilvl 75+.",
};

export const RECIPES_6: CraftRecipe[] = [
  // 1) Katla's Gloom putrefaction gloves. hitRate 0.2: the boots/body slot machine's ~1 in 3, shaded
  //    down because the sale needs a Decay line and the leg values only one of the five families.
  {
    key: "gloves_putrefaction_decay",
    domain: "armour",
    label: "Gloves · Katla's Gloom putrefaction (Decay)",
    base: {
      label: "Rare gloves · 6 mods, 20% quality (ilvl 75+)",
      category: "armour.gloves",
      rarity: "rare",
      ilvlMin: 75, // the higher Decay tiers are modifier level 75 (RePoE DecayInfluence*2)
      stats: [],
      note: "RARE gloves, 6 mods, 20% quality already on, not corrupted, not desecrated — ~8–10 chaos (compilation). Mods are wiped; the defence type steers the reveals.",
    },
    result: {
      label: "Corrupted rare gloves · Decay ailment magnitude",
      category: "armour.gloves",
      rarity: "rare",
      ilvlMin: 75,
      corrupted: true, // the putrefaction omen corrupts — uncorrupted listings are a different product
      stats: [{ text: "#% increased Magnitude of Ailments you inflict", min: 20, tier: 1 }],
      note: "Valued from instant-buyout CORRUPTED comparables with the Decay '(20–32)% increased Magnitude of Ailments you inflict' line — one of the five Decay prefix families, the generic one.",
    },
    materials: [
      { material: MATS.artificers, qtyPerAttempt: 1, note: "One Augment socket for the rune (the compilation says 2; KB: gloves cap at 1)." },
      { material: MATS.katlasGloom, qtyPerAttempt: 1, note: "'Can roll Decay modifiers' (RePoE). 5–25 ex per the compilation, which calls it 'Cutthroat's Gloom'." },
      { material: MATS.omenPutrefaction, qtyPerAttempt: 1 },
      { material: MATS.preservedRib, qtyPerAttempt: 1, note: "The compilation names no bone; a Rib 'Desecrates a Rare Armour' (item text)." },
    ],
    hitRate: 0.2,
    guide: GUIDES_6.gloves_putrefaction_decay!,
  },

  // 2) Non-crit bow (bow_001). hitRate 0.5: the essence and exalts always land; about half the
  //    Sinistral reveals give a flat-damage prefix worth selling on.
  {
    key: "bow_abrasion_desecrated_prefix",
    domain: "weapon",
    label: "Bow · Abrasion + desecrated prefix (non-crit)",
    base: BOW_BASE,
    result: {
      label: "Rare bow · %phys + flat phys, 300+ pdps",
      category: "weapon.bow",
      rarity: "rare",
      ilvlMin: 75,
      // Obliterator (62–115, 1.1 aps) with 135% phys + the essence's flat ≈ 300 pdps before quality
      pdpsMin: 300,
      stats: [{ text: "#% increased Physical Damage", min: 110, tier: 1 }],
      note: "Valued from instant-buyout comparables: rare bow with 110%+ physical and 300+ pdps. Flat elemental from the reveal is upside the leg does not search.",
    },
    materials: bowMats(MATS.greaterEssenceAbrasion),
    hitRate: 0.5,
    guide: GUIDES_6.bow_abrasion_desecrated_prefix!,
  },

  // 3) Crit bow (bow_002) — same process with the crit essence.
  {
    key: "bow_seeking_desecrated_prefix",
    domain: "weapon",
    label: "Bow · Seeking + desecrated prefix (crit)",
    base: BOW_BASE,
    result: {
      label: "Rare bow · %phys + 3%+ crit",
      category: "weapon.bow",
      rarity: "rare",
      ilvlMin: 75,
      pdpsMin: 250,
      stats: [
        { text: "+#% to Critical Hit Chance", min: 3.1, tier: 1 },
        { text: "#% increased Physical Damage", min: 110, tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: rare bow with the essence's +3.1%+ crit and 250+ pdps, with 110%+ physical when enough are listed.",
    },
    materials: bowMats(MATS.greaterEssenceSeeking),
    hitRate: 0.5,
    guide: GUIDES_6.bow_seeking_desecrated_prefix!,
  },

  // 4) Beginner quarterstaff (quarterstaff_003, credited to Dopamine Hunter). hitRate 0.5: every step
  //    lands; the reveal decides whether a % damage prefix joins the flat line.
  {
    key: "quarterstaff_flames_desecrated_prefix",
    domain: "weapon",
    label: "Quarterstaff · Flames essence + desecrated prefix",
    base: {
      label: "Magic quarterstaff · % elemental (ilvl 75+)",
      category: "weapon.warstaff",
      rarity: "magic",
      ilvlMin: 75, // the compilation's base note
      stats: [{ text: "#% increased Elemental Damage with Attacks", min: 72 }],
      note: "MAGIC quarterstaff with % increased Elemental Damage with Attacks (72%+ is our threshold: RePoE's (72–85)% tier, level 33, or better) and an open prefix. The compilation also accepts % Physical or Added Elemental bases.",
    },
    result: {
      label: "Rare quarterstaff · % elemental + flat fire",
      category: "weapon.warstaff",
      rarity: "rare",
      ilvlMin: 75,
      stats: [{ text: "#% increased Elemental Damage with Attacks", min: 72, tier: 1 }],
      note: "Valued from instant-buyout comparables: rare quarterstaff with 72%+ elemental damage with attacks. The compilation's headline is '1000+ DPS'.",
    },
    materials: [
      { material: MATS.greaterEssenceFlames, qtyPerAttempt: 1, note: "Two-hander flat fire, Adds (56–70) to (84–107) (poe2db) — the compilation's example essence." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1 },
      { material: MATS.preservedJawbone, qtyPerAttempt: 1 },
      { material: MATS.artificers, qtyPerAttempt: 2, note: "Two sockets (runes not tracked)." },
      { material: MATS.whetstone, qtyPerAttempt: 10, note: "~10 to 20% quality — our estimate, the compilation names no count." },
    ],
    hitRate: 0.5,
    guide: GUIDES_6.quarterstaff_flames_desecrated_prefix!,
  },

  // 5) Evasion boots (boots_003). hitRate 0.6: the base already carries the 35% MS + resistance and
  //    every step before the reveal adds value; the reveal sets the price band.
  {
    key: "boots_evasion_ms_ruin",
    domain: "armour",
    label: "Boots · evasion 35% MS + Ruin essence",
    base: {
      label: "Magic evasion boots · 35% MS (ilvl 82+)",
      category: "armour.boots",
      rarity: "magic",
      ilvlMin: 82, // 35% Movement Speed is modifier level 82 (RePoE MovementVelocity6; KB §3)
      evMin: 1,
      stats: [{ text: "#% increased Movement Speed", min: 35 }],
      note: "MAGIC pure-evasion boots with 35% MS and a resistance (the compilation: your missing one, e.g. Lightning 35+). 35% needs ilvl 82 — the compilation's 'ilvl 75+' tops at 30%. Armour/ES bases can't be excluded by the leg: eyeball them.",
    },
    result: {
      label: "Rare evasion boots · 35% MS + chaos res",
      category: "armour.boots",
      rarity: "rare",
      ilvlMin: 82,
      evMin: 200,
      stats: [
        { text: "#% increased Movement Speed", min: 35, tier: 1 },
        { text: "#% to Chaos Resistance", min: 16, tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: 35% MS evasion boots, with the essence's 16%+ chaos res when enough are listed.",
    },
    materials: [
      { material: MATS.greaterEssenceRuin, qtyPerAttempt: 1, note: "'+(16—19)% to Chaos Resistance' on boots (poe2db)." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 0.5, note: "Sinistral OR Dextral — the player picks the side." },
      { material: MATS.omenDextralNecromancy, qtyPerAttempt: 0.5 },
      { material: MATS.preservedRib, qtyPerAttempt: 1.2, note: "One per boot, plus a retry after ~1 in 5 Light strips (our estimate)." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1 },
      { material: MATS.greaterExalted, qtyPerAttempt: 1, note: "Modifier-level 35 floor (KB §1)." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 0.3, note: "Conditional in the compilation (~93 ex)." },
      { material: MATS.omenLight, qtyPerAttempt: 0.2, note: "Conditional in the compilation (~3 div): strips a bad desecrated mod with an Annulment." },
      { material: MATS.annul, qtyPerAttempt: 0.2 },
      { material: MATS.scrap, qtyPerAttempt: 14, note: "~14 scraps to 20% quality (our estimate)." },
      { material: MATS.artificers, qtyPerAttempt: 1, note: "One socket — the boots cap (runes not tracked)." },
    ],
    hitRate: 0.6,
    guide: GUIDES_6.boots_evasion_ms_ruin!,
  },

  // 6) Budget Evasion/ES body armour (body_armour_003). hitRate 0.6: essence, bone and exalts all land
  //    on a ~1 ex base; the reveal and the exalted resistances set the sale.
  {
    key: "armour_evasion_es_body_essence",
    domain: "armour",
    label: "Body Armour · budget Evasion/ES + Body essence",
    base: {
      label: "Magic Evasion/ES chest · 92%+ EV/ES (ilvl 70+)",
      minAskEx: CHEAP_BASE_FLOOR_EX, // the compilation prices the base at ~1 ex
      category: "armour.chest",
      rarity: "magic",
      ilvlMin: 70,
      evMin: 1,
      esMin: 1,
      stats: [{ text: "#% increased Evasion and Energy Shield", min: 92 }],
      note: "MAGIC Evasion/ES body armour, ilvl 70+, ~1 ex (compilation). 92%+ = RePoE's two top tiers: (92–100)% at level 65, (101–110)% at 75.",
    },
    result: {
      label: "Rare EV/ES chest · 100+ life + res",
      category: "armour.chest",
      rarity: "rare",
      ilvlMin: 70,
      evMin: 400,
      esMin: 120,
      stats: [
        { text: "# to maximum Life", min: 100, tier: 1 },
        { text: "+#% total Elemental Resistance", min: 40, group: "pseudo", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: rare EV/ES chest with the essence's 100+ life, with 40%+ total elemental res when enough are listed. The compilation: '~12 ex in → ~1 div out'.",
    },
    materials: [
      { material: MATS.greaterEssenceTheBody, qtyPerAttempt: 1, note: "'+(100—119) to maximum Life' on body armours (poe2db)." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1, note: "Optional in the compilation; forces the prefix." },
      { material: MATS.preservedRib, qtyPerAttempt: 1 },
      { material: MATS.exalted, qtyPerAttempt: 2, note: "The compilation's 'Exalted Orb x2' for the open slots." },
      { material: MATS.scrap, qtyPerAttempt: 14, note: "~14 scraps to 20% quality (our estimate)." },
      { material: MATS.artificers, qtyPerAttempt: 2, note: "Two sockets for Iron Runes (runes not tracked)." },
    ],
    hitRate: 0.6,
    guide: GUIDES_6.armour_evasion_es_body_essence!,
  },
];
