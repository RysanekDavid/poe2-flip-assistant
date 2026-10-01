import { MATS } from "./craftMaterials";
import { GUIDES_5 } from "./craftGuideData5";
import type { CraftRecipe } from "./craftRecipes";

/**
 * Fifth batch (2026-09-30 expansion, jewellery + jewel): the Breach Ring mana stacker, the fractured
 * Large-radius Time-Lost Sapphire, the fractured +3 amulet with chaos-spammed Spirit and the +4
 * amulet quality tech (draft only). Provenance lives in craftProvenanceData2.ts; split from
 * craftRecipeData4.ts for the 500-line cap. Tiers/levels: committed RePoE snapshot (game data 0.5.5b).
 * qtyPerAttempt is the expected use per BOUGHT BASE (steps after a gate are scaled by its pass rate).
 */
export const RECIPES_5: CraftRecipe[] = [
  // 1) Mana-stacker Breach Ring. hitRate 0.5: every gate is a retry loop (chaos until T1 mana, reveal
  //    rerolls, annul-and-reslam), so most bases finish; the minion-damage reveal and the resistance
  //    slams decide whether it clears the comparable band.
  {
    key: "ring_breach_mana_stacker",
    domain: "jewellery",
    label: "Ring · Breach mana stacker",
    base: {
      label: "Rare Breach Ring · fractured rarity suffix",
      type: "Breach Ring",
      rarity: "rare",
      ilvlMin: 75, // T1 flat mana (+165–179) is modifier level 75 on Breach Rings (RePoE)
      stats: [{ text: "#% increased Rarity of Items found", group: "fractured" }],
      note: "Breach Ring (implicit '+20% to Maximum Quality', RePoE) with a FRACTURED rarity SUFFIX, ilvl 75+. A fractured rarity PREFIX would take one of the three prefixes this craft fills.",
    },
    result: {
      label: "Breach Ring · T1 flat mana + % mana",
      type: "Breach Ring",
      rarity: "rare",
      ilvlMin: 75,
      stats: [
        { text: "# to maximum Mana", min: 165, tier: 1 },
        { text: "#% increased maximum Mana", min: 4, tier: 1 },
        { text: "Minions deal #% increased Damage if you've Hit Recently", group: "desecrated", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: Breach Ring with T1 flat mana (165+) and the essence's 4–6% maximum mana, plus the desecrated Amanamu minion-damage prefix when enough are listed.",
    },
    materials: [
      { material: MATS.annul, qtyPerAttempt: 2.5, note: "Strip to the fractured rarity + one mod before the chaos phase, plus ~0.5 for a missed resistance slam." },
      {
        material: MATS.chaos,
        qtyPerAttempt: 200,
        note: "Chaos until TRUE T1 flat mana. Our estimate, no reviewed source gives a count: T1 is one of ~195–200 mod tiers a Breach Ring rolls at ilvl 75–82 (RePoE), equal spawn weights assumed.",
      },
      { material: MATS.omenDextralExaltation, qtyPerAttempt: 1, note: "Plants the sacrificial suffix the Crystallisation eats." },
      { material: MATS.exalted, qtyPerAttempt: 1 },
      { material: MATS.omenDextralCrystallisation, qtyPerAttempt: 1, note: "The Perfect essence then removes only a suffix (item text) — the fractured rarity can't go." },
      { material: MATS.perfectEssenceMind, qtyPerAttempt: 1, note: "Ring: (4–6)% increased maximum Mana (poe2db), a prefix (RePoE EssenceIncreasedManaPercent1)." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1 },
      { material: MATS.omenTheLiege, qtyPerAttempt: 1, note: "Forces an Amanamu mod; RePoE lists three Amanamu ring prefixes (minion damage, Remnant effect, Ignite magnitude)." },
      { material: MATS.preservedCollarbone, qtyPerAttempt: 1.5, note: "~0.5 extra for a re-desecration after an Omen of Light strip." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1, note: "One reroll of the three options, fishing minion damage." },
      { material: MATS.xophsCatalyst, qtyPerAttempt: 80, note: "40% elemental quality before EACH of the two slams — Catalysing consumes it all (KB §4). Tul's/Esh's work the same." },
      { material: MATS.omenCatalysingExaltation, qtyPerAttempt: 2.5, note: "7.5× tag weight at 40% (KB §4) — a bias, not a guarantee." },
      { material: MATS.perfectExalted, qtyPerAttempt: 2.5, note: "Two resistance suffixes + ~0.5 re-slam." },
      { material: MATS.omenDextralAnnulment, qtyPerAttempt: 0.5, note: "Keeps the miss-annul on the suffixes." },
    ],
    hitRate: 0.5,
    guide: GUIDES_5.ring_breach_mana_stacker!,
  },

  // 2) Fractured Large-radius Time-Lost Sapphire. hitRate 0.33: the 1-in-3 fracture with a desecrated
  //    blocker (KB §2; the Codex summary of Scorpius says the same). Post-fracture lines are ×1/3.
  {
    key: "jewel_timelost_fractured_radius",
    domain: "jewel",
    label: "Time-Lost Sapphire · fractured Large radius",
    base: {
      label: "Rare Time-Lost Sapphire · Large radius, 3 mods",
      type: "Time-Lost Sapphire",
      rarity: "rare",
      stats: [{ text: "Upgrades Radius to Large" }],
      note: "Rare Time-Lost Sapphire with 'Upgrades Radius to Large' (RePoE JewelRadiusLargeSize, a prefix) and exactly 3 mods; not fractured, corrupted or desecrated (eyeball). ~25–40 ex each (Codex summary).",
    },
    result: {
      label: "Time-Lost Sapphire · fractured Large radius + crit/notable",
      type: "Time-Lost Sapphire",
      rarity: "rare",
      stats: [
        { text: "Upgrades Radius to Large", group: "fractured", tier: 1 },
        { text: "#% increased Effect of Notable Passive Skills in Radius", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables with a FRACTURED Large radius, plus a notable-effect line when enough are listed. The Codex example cost ~9 div and price-checked at 50–60 div.",
    },
    materials: [
      { material: MATS.preservedCranium, qtyPerAttempt: 1, note: "The blocker (~1.6 div): the 4th mod, can't be fractured (KB §2). Cranium = rare jewel (bone text)." },
      { material: MATS.fracturing, qtyPerAttempt: 1, note: "At exactly 4 mods (≥4 required) with the desecrated blocker: 1-in-3 on the radius. Miss = next base." },
      { material: MATS.annul, qtyPerAttempt: 0.7, note: "~2 per locked jewel: strip to the fractured radius + one mod." },
      { material: MATS.chaos, qtyPerAttempt: 5, note: "~15 per locked jewel swapping the one open mod — our estimate, the sources give no count." },
      { material: MATS.divine, qtyPerAttempt: 0.3, note: "Optional: nudge a good roll (fractured values are Divine-proof, KB §2)." },
    ],
    hitRate: 0.33,
    guide: GUIDES_5.jewel_timelost_fractured_radius!,
  },

  // 3) Fractured +3 Projectile amulet + chaos-spammed Spirit (merges our fracture-+3 and giga-Spirit
  //    ideas). hitRate 0.5: the Spirit chaos loop runs until done; the resistance slams swing the sale.
  {
    key: "amulet_plus3_spirit_chaos",
    domain: "jewellery",
    label: "Amulet · fractured +3 + chaos Spirit",
    base: {
      label: "Rare amulet · fractured +3 Projectile Skills",
      category: "accessory.amulet",
      rarity: "rare",
      ilvlMin: 75, // +3 to Level of all Projectile Skills is modifier level 75 (RePoE)
      stats: [{ text: "# to Level of all Projectile Skills", min: 3, group: "fractured" }],
      note: "Rare amulet with a FRACTURED +3 Projectile Skills (buy it, or fracture one with the fracture-the-+3 recipe). Solar Amulet adds (10–15) Spirit as its implicit; Stellar adds attributes.",
    },
    result: {
      label: "Amulet · fractured +3 Projectile + Spirit + res",
      category: "accessory.amulet",
      rarity: "rare",
      ilvlMin: 75,
      stats: [
        { text: "# to Level of all Projectile Skills", min: 3, group: "fractured", tier: 1 },
        { text: "# to Spirit", min: 43, tier: 1 },
        { text: "+#% total Elemental Resistance", min: 60, group: "pseudo", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: FRACTURED +3 Projectile Skills with T1/T2 Spirit (43+), plus 60%+ total elemental res when enough are listed.",
    },
    materials: [
      { material: MATS.annul, qtyPerAttempt: 3, note: "Strip to the fractured +3 + one mod, plus ~1 for a missed resistance slam." },
      { material: MATS.chaos, qtyPerAttempt: 40, note: "Chaos swaps the one open mod until T1/T2 Spirit — the count is our estimate, the sources give none." },
      { material: MATS.omenDextralExaltation, qtyPerAttempt: 3, note: "One for the sacrificial suffix, two for the resistance slams." },
      { material: MATS.greaterExalted, qtyPerAttempt: 1, note: "The sacrificial suffix." },
      { material: MATS.omenDextralCrystallisation, qtyPerAttempt: 1 },
      { material: MATS.perfectEssenceEnhancement, qtyPerAttempt: 1, note: "Eats that suffix into (20–30)% increased Global Armour, Evasion and ES (RePoE EssenceGlobalDefences1)." },
      { material: MATS.xophsCatalyst, qtyPerAttempt: 20, note: "20% elemental quality — buffs the resistance numbers (KB §8)." },
      { material: MATS.perfectExalted, qtyPerAttempt: 2.5, note: "Two resistance suffixes + ~0.5 re-slam." },
      { material: MATS.preservedCollarbone, qtyPerAttempt: 2, note: "Last prefix via the Collarbone loop (~2 desecrations)." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 2 },
      { material: MATS.omenLight, qtyPerAttempt: 1, note: "Strips a missed desecrated mod (with an Annulment)." },
    ],
    hitRate: 0.5,
    guide: GUIDES_5.amulet_plus3_spirit_chaos!,
  },

  // 4) +3 → "+4" Spell Skills via Breach-essence max quality + caster catalyst. DRAFT: the whole value
  //    rests on catalyst quality scaling a "+N to Level" mod (KB conflict K4), so hitRate 0.2 is a guess.
  {
    key: "amulet_plus4_breach_quality",
    domain: "jewellery",
    label: "Amulet · +4 Spell quality tech (unverified)",
    base: {
      label: "Rare amulet · +3 Spell Skills",
      category: "accessory.amulet",
      rarity: "rare",
      ilvlMin: 75, // +3 to Level of all Spell Skills is modifier level 75 (RePoE)
      stats: [{ text: "# to Level of all Spell Skills", min: 3 }],
      note: "Cheap rare amulet with +3 to Level of all Spell Skills (~1 div per the compilation) and an open suffix. Gold Amulet in the Forge of Exiles write-up.",
    },
    result: {
      label: "Amulet · +4 Spell Skills (quality)",
      category: "accessory.amulet",
      rarity: "rare",
      ilvlMin: 75,
      stats: [{ text: "# to Level of all Spell Skills", min: 4, tier: 1 }],
      note: "Valued from instant-buyout comparables showing +4 Spell Skills (the natural top tier is +3, RePoE). The compilation claims 70–300 div; nothing here is confirmed in game.",
    },
    materials: [
      { material: MATS.omenSinistralExaltation, qtyPerAttempt: 1 },
      { material: MATS.exalted, qtyPerAttempt: 1, note: "A throwaway PREFIX for the Breach essence to eat." },
      { material: MATS.omenSinistralCrystallisation, qtyPerAttempt: 1, note: "The Corrupted Breach essence then removes only a prefix — the +3 suffix is safe (compilation AMULET_004)." },
      { material: MATS.essenceOfTheBreach, qtyPerAttempt: 1, note: "Adds '+20% to Maximum Quality' (RePoE EssenceBreach, a prefix). Forge's 'Perfect Essence of the Breach' doesn't exist." },
      { material: MATS.sibilantCatalyst, qtyPerAttempt: 34, note: "Caster quality to ~34% (cap 40% with the Breach mod); RePoE tags the +Spell Skills mod caster + gem." },
      { material: MATS.preservedCollarbone, qtyPerAttempt: 2, note: "The compilation's 'Collarbone twice' — conflicts with one desecrated mod per item (KB §5)." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1 },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1 },
      { material: MATS.perfectExalted, qtyPerAttempt: 1 },
    ],
    hitRate: 0.2,
    guide: GUIDES_5.amulet_plus4_breach_quality!,
  },
];
