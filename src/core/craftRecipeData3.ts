import { MATS } from "./craftMaterials";
import { GUIDES_3 } from "./craftGuideData3";
import { CHEAP_BASE_FLOOR_EX } from "./craftValuation";
import type { CraftRecipe } from "./craftRecipes";

/**
 * Third batch of curated recipes: the Potent-liquid 5-mod BASIC jewels (docs/kb/creator-videos.md
 * [S4] + [S20]; transcripts 04-… and 19-… under docs/kb/sources/transcripts). Deleted 2026-07-15 on
 * a claim KB §6 now refutes (poe2db + RePoE, 2026-09-28: Potent Liquid Contempt grants the crafted
 * "+1 Suffix/Prefix Modifier allowed" on Rare Basic Jewels). Split from craftRecipeData2.ts to
 * respect the 500-line cap; concatenated into RECIPES in craftRecipes.ts.
 *
 * Both results are searched by `# Suffix Modifiers` ≥ 3 — a basic jewel allows 2 suffixes, so 3 is
 * the fingerprint of this craft (and excludes Vaal 5-mods, which are corrupted anyway).
 * qtyPerAttempt = expected use per BOUGHT BASE: steps after a gate are scaled by its pass rate.
 */

// Shared finished-item spec. Mins are the low end a buyer still pays for: roll ranges are RePoE
// JewelSpellCriticalChance / JewelSpellDamage (5–15) and CraftedJewelSuffixEffect (40–60).
const THREE_SUFFIXES = { text: "# Suffix Modifiers", min: 3, group: "pseudo", tier: 1 } as const;
const SUFFIX_EFFECT = { text: "#% increased Effect of Suffixes", min: 40, group: "crafted", tier: 2 } as const;

export const RECIPES_3: CraftRecipe[] = [
  // 1) Budget path [S20]: 3-mod base → Contempt → desecrated suffix → Sinistral annul → exalt → Ferocity.
  //    hitRate 0.3 = Contempt ~0.5 (S20: "always fifty-fifty", won 2 of 3) × a usable caster reveal
  //    ~0.6 with one Echoes reroll (S20's budget reveals: 2 usable of 3; misses are discarded because
  //    the base costs less than half an Omen of Light). After the strip every gate is a retry loop.
  {
    key: "jewel_liquid_5mod_budget",
    domain: "jewel",
    label: "Sapphire · Contempt 5-mod (budget)",
    source: "Pavel CZ jewel craft [S20] budget path + 5-mod jewel guide [S4] (Contempt → Dextral cranium → Sinistral annul → exalt → Ferocity)",
    base: {
      label: "Rare Sapphire · 2 caster suffixes + 1 prefix",
      minAskEx: CHEAP_BASE_FLOOR_EX, // honest price ~10–30 ex — the default 0.05 div floor would reject real asks
      type: "Sapphire",
      rarity: "rare",
      stats: [
        { text: "#% increased Critical Hit Chance for Spells" },
        // exactly 2 suffixes + exactly 1 prefix: Contempt must replace the lone prefix, and the later
        // Sinistral Annulment is only guaranteed when the crafted mod is the ONLY prefix [S20]
        { text: "# Suffix Modifiers", min: 2, group: "pseudo" },
        { text: "# Prefix Modifiers", min: 1, group: "pseudo" },
        { text: "# Empty Prefix Modifiers", min: 1, group: "pseudo" },
      ],
      note: "Rare basic Sapphire with Crit Chance for Spells + one more suffix (2 total) and ONE junk prefix. Roll values don't matter (finished jewels get divined or sold as rolled). ~10–30 ex each [S20].",
    },
    result: {
      label: "Rare Sapphire · 3 suffixes + Spell Damage",
      type: "Sapphire",
      rarity: "rare",
      corrupted: false, // uncorrupted by construction; Vaal 5-mod jewels are a different product
      stats: [
        { text: "#% increased Critical Hit Chance for Spells", min: 10, tier: 1 },
        THREE_SUFFIXES,
        { text: "#% increased Spell Damage", min: 10, tier: 1 },
        SUFFIX_EFFECT,
      ],
      note: "Valued from instant-buyout comparables: rare Sapphire with 3 suffixes incl. Crit Chance for Spells 10%+ and Spell Damage 10%+, plus the crafted Ferocity 'Effect of Suffixes' when enough are listed. Creator's comparables started ~170 div [S20].",
    },
    materials: [
      { material: MATS.potentLiquidContempt, qtyPerAttempt: 1, note: "One per base: ~50/50 for '+1 Suffix Modifier allowed'; the '+1 Prefix' result costs a suffix → discard (loss lives in hitRate)." },
      { material: MATS.omenDextralNecromancy, qtyPerAttempt: 0.5, note: "Only after a Contempt win (~0.5 per base): forces the cranium onto a suffix while a prefix slot is open." },
      { material: MATS.preservedCranium, qtyPerAttempt: 0.5, note: "One desecration per surviving base; a dead reveal = discard the base (cheaper than Omen of Light) [S20]." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 0.5, note: "One reroll of the three reveal options per desecration." },
      { material: MATS.omenSinistralAnnulment, qtyPerAttempt: 0.3, note: "Per completed jewel (×0.3 per base): pulls the crafted '+1' — guaranteed because it is the only prefix." },
      { material: MATS.annul, qtyPerAttempt: 0.3, note: "Paired with the Sinistral omen (~10 div for the pair in S20)." },
      { material: MATS.exalted, qtyPerAttempt: 0.6, note: "Two per completed jewel — fill both prefixes, fishing Spell Damage." },
      { material: MATS.potentLiquidFerocity, qtyPerAttempt: 0.6, note: "~2 per completed jewel: 50/50 it keeps Spell Damage, retried until it does." },
      { material: MATS.chaos, qtyPerAttempt: 2.4, note: "~8 per completed jewel: prefix-only chaos between Ferocity tries (suffixes can't be hit)." },
    ],
    hitRate: 0.3,
    guide: GUIDES_3.jewel_liquid_5mod_budget!,
  },

  // 2) High-end fractured path [S20] (+ S4's ordering): cranium blocker → fracture the 20% crit damage
  //    at 4 mods → Contempt → desecrated suffix → strip → Spell Damage → Ferocity → divine.
  //    hitRate 0.3 ≈ the 1-in-3 fracture (KB §2; S20 locked 2 of 5). Every later gate is a retry loop
  //    behind the fractured mod, so its cost is below: post-fracture lines are per-completion × 1/3.
  {
    key: "jewel_fractured_5mod",
    domain: "jewel",
    label: "Sapphire · fractured 5-mod (high-end)",
    source: "Pavel CZ jewel craft [S20] high-end path + 5-mod jewel guide [S4] (cranium blocker → fracture → Contempt → desecrate → Ferocity → divine)",
    base: {
      label: "Rare Sapphire · 20% Crit Spell Damage, 3 mods",
      type: "Sapphire",
      rarity: "rare",
      stats: [
        { text: "#% increased Critical Spell Damage Bonus", min: 20 }, // RePoE JewelSpellCriticalDamage (10–20): the max roll
        // exactly 3 mods with an open PREFIX: the Sinistral cranium fills it, fracture needs ≥4 mods
        { text: "# Modifiers", min: 3, group: "pseudo" },
        { text: "# Empty Prefix Modifiers", min: 1, group: "pseudo" },
      ],
      note: "Rare basic Sapphire with a max-roll (20%) Critical Spell Damage Bonus and exactly 3 mods (2 suffixes + 1 prefix). Everything else is irrelevant — only the fractured mod survives. ~1 div each in S4.",
    },
    result: {
      label: "Rare Sapphire · fractured crit dmg + 3 suffixes + Spell Damage",
      type: "Sapphire",
      rarity: "rare",
      corrupted: false,
      stats: [
        { text: "#% increased Critical Spell Damage Bonus", min: 20, group: "fractured", tier: 1 },
        { text: "#% increased Critical Hit Chance for Spells", min: 12, tier: 1 },
        THREE_SUFFIXES,
        { text: "#% increased Spell Damage", min: 12, tier: 1 },
        SUFFIX_EFFECT,
      ],
      note: "Valued from instant-buyout comparables: FRACTURED 20% Crit Spell Damage Bonus with 3 suffixes, Crit Chance for Spells 12%+ and Spell Damage 12%+ (divined), plus the Ferocity 'Effect of Suffixes' when enough are listed. Creator sales 280 / 400 / 580 div [S20].",
    },
    materials: [
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1, note: "Forces the blocker cranium into the open prefix — never onto your crit-damage suffix." },
      { material: MATS.preservedCranium, qtyPerAttempt: 2, note: "1 blocker per base + ~3 reveal tries per completed jewel (×1/3)." },
      // KB §2 (poe2-crafting-knowledge.md): fracture needs ≥4 mods; desecrated counts, can't be fractured
      { material: MATS.fracturing, qtyPerAttempt: 1, note: "At exactly 4 mods (≥4 required) with the unrevealed blocker: 1-in-3 on the crit damage. Miss = next base." },
      { material: MATS.annul, qtyPerAttempt: 2.2, note: "~6.5 per completed jewel: 2 to strip to fractured + 1, a Contempt-fail reset, ~2 Omen-of-Light strips, ~1.5 Sinistral pulls." },
      { material: MATS.chaos, qtyPerAttempt: 10, note: "~30 per completed jewel: fish Crit Chance for Spells, then Spell Damage between Ferocity tries. UNQUANTIFIED in the sources — estimate." },
      { material: MATS.exalted, qtyPerAttempt: 1, note: "3 per completed jewel: 2 before Contempt, 1 after the strip." },
      { material: MATS.potentLiquidContempt, qtyPerAttempt: 0.7, note: "~2 per completed jewel (50/50, retried behind the fracture)." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1, note: "One reroll per reveal (~3 reveals per completed jewel)." },
      { material: MATS.omenLight, qtyPerAttempt: 0.7, note: "~2 per completed jewel: with an Annulment, strips a missed desecrated mod before the next cranium." },
      { material: MATS.omenSinistralAnnulment, qtyPerAttempt: 0.5, note: "~1.5 per completed jewel: 50/50 per try with 2 prefixes [S4]." },
      { material: MATS.potentLiquidFerocity, qtyPerAttempt: 0.7, note: "~2 per completed jewel: 50/50 it keeps Spell Damage, retried." },
      { material: MATS.divine, qtyPerAttempt: 5, note: "~15 per completed jewel — 'the most expensive step' [S20]; the count is our estimate, the sources give none." },
    ],
    hitRate: 0.3,
    guide: GUIDES_3.jewel_fractured_5mod!,
  },
];
