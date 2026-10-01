import { MATS } from "./craftMaterials";
import { GUIDES_9 } from "./craftGuideData9";
import { GUIDES_10 } from "./craftGuideData10";
import type { CraftRecipe } from "./craftRecipes";
import { CHEAP_BASE_FLOOR_EX } from "./craftValuation";

/**
 * Ninth batch (2026-10-01 creator-video wave, armour/jewellery/jewel): the Gold Ring rarity ring
 * (craft-to-use), the fractured-armour Tower Shield, the Liquid Fear Emerald, the four-flat Dusk Ring
 * and the 35% MS energy shield boots. Tiers/levels: committed RePoE snapshot (game data 0.5.5b).
 * qtyPerAttempt is the expected use per BOUGHT BASE. Provenance and durability: craftProvenanceData3.ts.
 */

export const RECIPES_9: CraftRecipe[] = [
  // 1) Gold Ring triple rarity (Diztoh). For your own character; every step lands.
  {
    key: "ring_gold_rarity_opulence",
    domain: "jewellery",
    purpose: "use",
    label: "Ring · Gold Ring triple rarity (craft to use)",
    base: {
      label: "Magic Gold Ring · rarity prefix + a resistance",
      type: "Gold Ring",
      rarity: "magic",
      stats: [{ text: "#% increased Rarity of Items found", min: 10 }],
      note: "Craft to use: this leg is never priced — it only describes the item. MAGIC Gold Ring with 10%+ rarity on the PREFIX and a resistance you need.",
    },
    result: {
      label: "Rare Gold Ring · rarity prefix + suffix + resistances",
      type: "Gold Ring",
      rarity: "rare",
      stats: [{ text: "#% increased Rarity of Items found", min: 25, tier: 1 }],
      note: "Craft to use: this leg is never priced — it only describes the item.",
    },
    materials: [
      { material: MATS.greaterEssenceOpulence, qtyPerAttempt: 1, note: "The rarity suffix; makes the ring rare." },
      { material: MATS.omenDextralNecromancy, qtyPerAttempt: 1, note: "Forces the desecration onto the suffix side." },
      { material: MATS.preservedCollarbone, qtyPerAttempt: 1, note: "'Desecrates a Rare Amulet, Ring or Belt' (item text)." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1, note: "One reroll of the offered options." },
    ],
    hitRate: 0.8,
    guide: GUIDES_10.ring_gold_rarity_opulence!,
  },

  // 2) Fractured-armour Tower Shield (LilBotQ). hitRate 0.3: the 1-in-3 fracture, shaded for corrupting infusers.
  {
    key: "shield_armour_fracture",
    domain: "armour",
    label: "Shield · fractured flat Armour Tower Shield",
    base: {
      label: "Normal Tawhoan Tower Shield (ilvl 81+)",
      type: "Tawhoan Tower Shield",
      rarity: "normal",
      ilvlMin: 81,
      stats: [],
      note: "NORMAL Tawhoan Tower Shield, ilvl 81+. The creator buys the exceptional 2-socket ones; this search can't filter sockets, so the price is the cheapest one.",
    },
    result: {
      label: "Rare Tawhoan Tower Shield · 1,900+ Armour",
      type: "Tawhoan Tower Shield",
      rarity: "rare",
      arMin: 1900,
      stats: [],
      note: "Valued from instant-buyout comparables: rare Tawhoan Tower Shields with 1,900+ Armour (the shield's Armour is what Shield Wall builds pay for). Suffixes are not searched.",
    },
    materials: [
      { material: MATS.scrap, qtyPerAttempt: 20, note: "Quality to 20% — worst-case count." },
      { material: MATS.vaalArmourersInfuser, qtyPerAttempt: 3, note: "Our estimate for 24–26% quality." },
      { material: MATS.perfectTransmute, qtyPerAttempt: 1, note: "Modifier-level 70 floor (KB §1)." },
      { material: MATS.perfectAug, qtyPerAttempt: 3, note: "Our estimate incl. the Annul + Augment retries for T1 flat Armour." },
      { material: MATS.annul, qtyPerAttempt: 5, note: "Augment retries; after a hit (×1/3) down to the fracture and one per Light." },
      { material: MATS.greaterEssenceEnhancement, qtyPerAttempt: 1, note: "Insurance % defences prefix." },
      { material: MATS.preservedRib, qtyPerAttempt: 1, note: "The fracture blocker." },
      { material: MATS.divine, qtyPerAttempt: 3, note: "2 to roll the flat Armour before the fracture, ~3 more after a hit (×1/3)." },
      { material: MATS.fracturing, qtyPerAttempt: 1, note: "1 in 3 with the blocker (KB §2)." },
      // Everything below is spent only after a hit fracture: the counts are ×1/3 per bought base.
      { material: MATS.chaos, qtyPerAttempt: 17, note: "The creator's Craft of Exile estimate of 51 for T1 % Armour (video 2:24–2:27), ×1/3." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 0.67, note: "~2 desecrations, ×1/3." },
      { material: MATS.ancientRib, qtyPerAttempt: 0.67, note: "~2 desecrations, ×1/3." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 0.67, note: "One per reveal, ×1/3." },
      { material: MATS.omenLight, qtyPerAttempt: 0.33, note: "With an Annulment per missed reveal, ×1/3." },
      { material: MATS.ironRune, qtyPerAttempt: 0.67, note: "Two augment sockets, ×1/3." },
      { material: MATS.masterworkRune, qtyPerAttempt: 0.67, note: "Upgrades each Iron Rune, ×1/3." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 0.33, note: "Two suffixes from one exalt, ×1/3." },
      { material: MATS.perfectExalted, qtyPerAttempt: 0.67, note: "Modifier-level 50 floor (KB §1), ×1/3." },
    ],
    hitRate: 0.3,
    guide: GUIDES_10.shield_armour_fracture!,
  },

  // 3) Liquid Fear Emerald (LilBotQ budget section). hitRate 0.5: the creator's 50/50, KB §6 (a) model.
  {
    key: "jewel_liquid_fear_4mod_budget",
    domain: "jewel",
    label: "Emerald · Liquid Fear 4-mod (budget)",
    base: {
      label: "Rare Emerald · 2 prefixes + attack crit chance + a junk suffix",
      type: "Emerald",
      rarity: "rare",
      stats: [
        { text: "#% increased Critical Hit Chance for Attacks" },
        { text: "# Prefix Modifiers", min: 2, group: "pseudo" },
        { text: "# Suffix Modifiers", min: 2, group: "pseudo" },
      ],
      note: "RARE Emerald with attack crit chance as the one wanted suffix, two prefixes and a second suffix. The search can't exclude crafted mods; the creator filters crafted = no and corrupted = no.",
    },
    result: {
      label: "Rare Emerald · crafted attack Critical Damage Bonus + attack crit chance",
      type: "Emerald",
      rarity: "rare",
      stats: [
        { text: "#% increased Critical Damage Bonus for Attack Damage", group: "crafted", tier: 1 },
        { text: "#% increased Critical Hit Chance for Attacks", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: Emeralds with the crafted attack Critical Damage Bonus, with attack crit chance when enough are listed.",
    },
    materials: [{ material: MATS.concentratedLiquidFear, qtyPerAttempt: 1, note: "The crafted attack Critical Damage Bonus suffix (poe2db)." }],
    hitRate: 0.5,
    guide: GUIDES_10.jewel_liquid_fear_4mod_budget!,
  },

  // 4) Four-flat Dusk Ring (ASaVeQ). hitRate 1/3: the fracture per base; later loops add cost, not misses.
  {
    key: "ring_dusk_four_flat",
    domain: "jewellery",
    label: "Ring · Dusk Ring four flat attack prefixes",
    base: {
      label: "Rare Dusk Ring (ilvl 79+)",
      type: "Dusk Ring",
      rarity: "rare",
      ilvlMin: 79,
      minAskEx: CHEAP_BASE_FLOOR_EX, // honest price ~1 ex — the default 0.05 floor would reject every real ask
      stats: [],
      note: "Any RARE Dusk Ring at ilvl 79+ — it gets annulled down to one mod.",
    },
    result: {
      label: "Rare Dusk Ring · four prefixes, flat attack damage",
      type: "Dusk Ring",
      rarity: "rare",
      stats: [
        { text: "# Prefix Modifiers", min: 4, group: "pseudo", tier: 1 },
        { text: "Adds # to # Cold Damage to Attacks", tier: 2 },
        { text: "Adds # to # Fire Damage to Attacks", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: Dusk Rings with four prefixes, with flat Cold and Fire to Attacks when enough are listed. The relaxed search (four prefixes only) can include rings whose prefixes are not all flat damage.",
    },
    materials: [
      // Before the fracture every base pays in full; after it (×1/3) only the hits do.
      { material: MATS.annul, qtyPerAttempt: 4.6, note: "1 down to one mod; after a hit (×1/3) 1 to the fracture + ~10 under Omen of Light." },
      { material: MATS.chaos, qtyPerAttempt: 213, note: "~160 per T1 flat (creator: 1 in 162 incl. Physical, video 4:58–5:19); a second flat + the Whittle after a hit (×1/3)." },
      { material: MATS.omenSinistralExaltation, qtyPerAttempt: 1.33, note: "The pre-fracture slam; the catalysed slam after a hit (×1/3)." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1, note: "Two mods from one exalt." },
      { material: MATS.exalted, qtyPerAttempt: 1.33, note: "The pre-fracture slam; the throwaway suffix after a hit (×1/3)." },
      { material: MATS.preservedCollarbone, qtyPerAttempt: 1, note: "The fracture blocker (Preserved: a Gnawed bone fails above ilvl 64)." },
      { material: MATS.fracturing, qtyPerAttempt: 1, note: "1 in 3 with the blocker (KB §2)." },
      { material: MATS.omenDextralExaltation, qtyPerAttempt: 0.33, note: "The throwaway suffix, ×1/3." },
      { material: MATS.omenDextralCrystallisation, qtyPerAttempt: 0.67, note: "Breach essence + Swift Alloy, ×1/3." },
      { material: MATS.essenceOfTheBreach, qtyPerAttempt: 0.33, note: "+20% maximum quality, ×1/3." },
      { material: MATS.reaverCatalyst, qtyPerAttempt: 27, note: "Our estimate: two fills to 40% (~80), ×1/3." },
      { material: MATS.omenCatalysingExaltation, qtyPerAttempt: 0.33, note: "The catalysed slam, ×1/3." },
      { material: MATS.perfectExalted, qtyPerAttempt: 0.67, note: "Catalysed slam + last suffix, ×1/3." },
      { material: MATS.omenWhittling, qtyPerAttempt: 0.33, note: "Strips the Breach mod, ×1/3." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 3.3, note: "~10 desecrations for the 4th flat (video 13:10–16:41), ×1/3." },
      { material: MATS.ancientCollarbone, qtyPerAttempt: 3.3, note: "~10 desecrations, ×1/3." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 3.3, note: "One per reveal, ×1/3." },
      { material: MATS.omenLight, qtyPerAttempt: 3, note: "~9 strips, ×1/3." },
      { material: MATS.swiftAlloy, qtyPerAttempt: 0.33, note: "(7—9)% increased Attack Speed (suffix), ×1/3." },
    ],
    hitRate: 0.33,
    guide: GUIDES_9.ring_dusk_four_flat!,
  },

  // 5) 35% MS ES boots (ASaVeQ). hitRate 0.35: the creator keeps most fractures; the prefix loops add cost.
  {
    key: "boots_es_ms_spirit_fracture",
    domain: "armour",
    label: "Boots · ES 35% MS + Spirit, fractured",
    base: {
      label: "Normal Luxurious Slippers (ilvl 82+)",
      type: "Luxurious Slippers",
      rarity: "normal",
      ilvlMin: 82, // T1 35% Movement Speed is modifier level 82 (KB §3)
      stats: [],
      note: "NORMAL Luxurious Slippers at ilvl 82+. The creator buys exceptional ones; sockets are not filtered.",
    },
    result: {
      label: "Rare Luxurious Slippers · 35% MS + mana",
      type: "Luxurious Slippers",
      rarity: "rare",
      ilvlMin: 82,
      stats: [
        { text: "#% increased Movement Speed", min: 35, tier: 1 },
        { text: "# to maximum Mana", tier: 2 },
        { text: "# to Spirit", group: "crafted", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: rare Luxurious Slippers with 35% Movement Speed, with maximum Mana and crafted Spirit when enough are listed. The sanctify gamble is not counted.",
    },
    materials: [
      { material: MATS.perfectTransmute, qtyPerAttempt: 1, note: "Modifier-level 70 floor (KB §1)." },
      { material: MATS.perfectAug, qtyPerAttempt: 6, note: "Our estimate for two keepers with Annul retries." },
      { material: MATS.annul, qtyPerAttempt: 8, note: "Augment retries, then off the unwanted prefixes." },
      { material: MATS.divine, qtyPerAttempt: 1, note: "Roll the keepers before the fracture." },
      { material: MATS.perfectRegal, qtyPerAttempt: 1, note: "Modifier-level 50 floor (KB §1)." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 3, note: "One per desecration." },
      { material: MATS.preservedRib, qtyPerAttempt: 1, note: "The fracture blocker." },
      { material: MATS.fracturing, qtyPerAttempt: 1, note: "The fracture." },
      { material: MATS.omenSinistralExaltation, qtyPerAttempt: 2, note: "Prefix slams." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 3, note: "Prefix slams, then the suffix fill." },
      { material: MATS.perfectExalted, qtyPerAttempt: 2, note: "Modifier-level 50 floor (KB §1)." },
      { material: MATS.ancientRib, qtyPerAttempt: 2, note: "The missing prefix." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 3, note: "One per reveal." },
      { material: MATS.omenLight, qtyPerAttempt: 1, note: "With an Annulment per missed reveal." },
      { material: MATS.astridsCreativity, qtyPerAttempt: 1, note: "Room for the second crafted suffix." },
      { material: MATS.exalted, qtyPerAttempt: 1, note: "The suffix fill." },
      { material: MATS.omenDextralCrystallisation, qtyPerAttempt: 1, note: "Steers the Essence of Horror to a suffix." },
      { material: MATS.essenceOfHorror, qtyPerAttempt: 1, note: "Socketed-augment effect (suffix)." },
      { material: MATS.mysticAlloy, qtyPerAttempt: 1, note: "+(10—15) to Spirit (suffix)." },
      { material: MATS.perfectIronRune, qtyPerAttempt: 2, note: "Two augment sockets." },
      { material: MATS.scrap, qtyPerAttempt: 20, note: "Quality to 20% — worst-case count." },
    ],
    hitRate: 0.35,
    guide: GUIDES_10.boots_es_ms_spirit_fracture!,
  },
];
