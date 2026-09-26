import { MATS } from "./craftMaterials";
import { GUIDES } from "./craftGuideData";
import { CHEAP_BASE_FLOOR_EX } from "./craftValuation";
import type { CraftRecipe } from "./craftRecipes";

/**
 * The five curated recipes, transcribed from the user's guide collection (crafting chat +
 * Fubgun / XTheFarmerX videos). Kept in their own module (data, not logic) so craftRecipes.ts
 * stays a small types file. Material ids are verified against the live ninja economy;
 * hitRate / qtyPerAttempt / stat mins are guide-derived estimates — see each `note`.
 *
 * qtyPerAttempt is EXPECTED consumption per attempt (probabilistic re-tries folded in);
 * materials a guide only spends after a hit are either excluded (paid out of profit, noted)
 * or included when they dominate the attempt cost.
 */
// Shared bill of materials for both putrefaction boot variants AND the body-armour variant in
// craftRecipeData2.ts — the process is identical, only the base's defence pool differs.
export const PUTREFACTION_MATS: CraftRecipe["materials"] = [
  { material: MATS.scrap, qtyPerAttempt: 14, note: "~14 scraps avg to 20% quality — BEFORE the omen (it corrupts)." },
  { material: MATS.artificers, qtyPerAttempt: 2, note: "Both sockets BEFORE the omen." },
  { material: MATS.omenPutrefaction, qtyPerAttempt: 1 },
  {
    material: MATS.preservedRib,
    qtyPerAttempt: 1,
    note: "Preserved tier — Gnawed Rib caps at item level 64 and FAILS on the ilvl 82+ bases this craft needs ('Item Level is too high').",
  },
  {
    material: MATS.omenAbyssalEchoes,
    qtyPerAttempt: 0.3,
    note: "Optional reroll insurance — activate only when a reveal offers junk on an already-good item (~1 in 3 runs).",
  },
];

export const RECIPES: CraftRecipe[] = [
  // 1) +1-suffix push on a caster Time-Lost Sapphire (chat transcript: Contempt → +1 suffix →
  //    cranium → annul → safe chaos phase).
  {
    key: "jewel_suffix_push",
    domain: "jewel",
    // user preference: the emerald jewel art reads better on the card than the sapphire
    heroIcon:
      "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvSmV3ZWxzL1NwZWNpYWxFbWVyYWxkSmV3ZWwiLCJ3IjoxLCJoIjoxLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/9acdb9443b/SpecialEmeraldJewel.png",
    label: "Time-Lost jewel · +1 suffix push",
    source: "crafting chat (Contempt → +1 suffix → cranium → annul → chaos prefixes)",
    base: {
      label: "Sapphire · caster suffix",
      type: "Time-Lost Sapphire",
      // Time-Lost jewel mods are the "Notable Passive Skills in Radius also grant …" variants;
      // numeric mins on them return 0 results (roll value isn't indexed) — filter by presence only.
      stats: [{ text: "Notable Passive Skills in Radius also grant #% increased Critical Hit Chance for Spells" }],
      note: "Cheapest Time-Lost Sapphire with the crit-for-spells grant, 2 caster suffixes + ≤1 junk prefix ideal (search can't see affix structure — eyeball). Must be RARE for the Ancient liquids — regal a magic one.",
    },
    result: {
      label: "Rare Sapphire · crit spell dmg grant",
      type: "Time-Lost Sapphire",
      rarity: "rare",
      stats: [{ text: "Notable Passive Skills in Radius also grant #% increased Critical Spell Damage Bonus" }],
      note: "Valued as a rare Sapphire granting Critical Spell Damage Bonus (jewel roll mins aren't searchable; double-caster-suffix pieces were <5 listed — too thin to price). Finished 5-mod jewels sell above this floor; run the guide's market check by hand via the trade link.",
    },
    materials: [
      {
        material: MATS.ancientPotentLiquidContempt,
        qtyPerAttempt: 1,
        note: "Ancient tier — the only one that works on (rare) Time-Lost jewels. Removes a random mod + grants '+1 Suffix Modifier allowed' OR the prefix version; prefix result = discard the base (loss lives in hitRate).",
      },
      {
        material: MATS.ancientPotentLiquidFerocity,
        qtyPerAttempt: 1,
        note: "Removes a random mod + grants (40–60)% increased Effect of Suffixes — eats the junk prefix and buffs your suffixes in one slam.",
      },
      { material: MATS.omenDextralNecromancy, qtyPerAttempt: 1, note: "Forces the cranium's desecration onto a suffix." },
      { material: MATS.preservedCranium, qtyPerAttempt: 1 },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1, note: "One reroll of the three reveal options — insurance, not a guarantee." },
      { material: MATS.omenSinistralAnnulment, qtyPerAttempt: 1, note: "Core step: restricts the Annulment to prefixes — pulls the '+1 Suffix Modifier allowed' mod so the prefixes can be exalted (suffixes stay over-cap)." },
      { material: MATS.omenLight, qtyPerAttempt: 0.5, note: "Fail path only: makes the Annulment strip ONLY the revealed desecrated mod, then desecrate again (~half the runs)." },
      { material: MATS.annul, qtyPerAttempt: 1.5, note: "1× the +1-suffix pull + ~0.5× the Omen-of-Light fail path." },
      { material: MATS.exalted, qtyPerAttempt: 2, note: "Fill open prefixes — exalts only ADD; PoE2 chaos removes a random existing mod and can eat a suffix." },
      { material: MATS.divine, qtyPerAttempt: 1, note: "Final rolls — rerolls ALL values incl. suffixes." },
    ],
    hitRate: 0.35,
    guide: GUIDES.jewel_suffix_push!,
  },

  // 2) Guaranteed-attack-speed phys bow: essence crit + Liege-forced Amanamu suffix.
  {
    key: "bow_amanamu",
    domain: "weapon",
    label: "Bow · phys crit + Amanamu AS",
    source: "Fubgun bow craft (Seeking → Liege jawbone → echoes unveil → greater exalt)",
    base: {
      label: "%phys bow base (Obliterator/Warmonger)",
      category: "weapon.bow",
      ilvlMin: 75,
      stats: [{ text: "#% increased Physical Damage", min: 60 }],
      note: "Magic/rare %phys base, ilvl 75+ (82 for T1 %phys, pricier). Obliterator > Warmonger. AUG a one-mod magic base first for double essence effect.",
    },
    result: {
      label: "Rare bow · 400+ pdps",
      category: "weapon.bow",
      rarity: "rare",
      ilvlMin: 75,
      pdpsMin: 400,
      stats: [],
      note: "Valued by physical DPS floor (400 = the guide's sellable line for crit-swap bows). Attack-speed tier and crit push real sales above this.",
    },
    materials: [
      { material: MATS.greaterEssenceSeeking, qtyPerAttempt: 1, note: "Guaranteed crit mod (crit-swap enabler)." },
      { material: MATS.omenDextralNecromancy, qtyPerAttempt: 1, note: "Jawbone desecration → suffix." },
      { material: MATS.omenTheLiege, qtyPerAttempt: 1, note: "Forces an Amanamu mod — attack speed is the jackpot of its 3-mod pool." },
      { material: MATS.preservedJawbone, qtyPerAttempt: 1, note: "Ancient tier on expensive bases only." },
      // KB §5: the Dextral-forced Amanamu reveal is suffix-only — Attack Speed 12–18% > Pierce
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1, note: "One reroll of the suffix reveal: Attack Speed 12–18% (jackpot) > Pierce." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1 },
      { material: MATS.greaterExalted, qtyPerAttempt: 1, note: "Applies twice under the omen — fish the prefixes for flat phys (best) or high flat ele." },
      { material: MATS.artificers, qtyPerAttempt: 2, note: "Sockets for iron runes (runes ~1 ex each, not tracked)." },
    ],
    hitRate: 0.3,
    guide: GUIDES.bow_amanamu!,
  },

  // 3) Catalysed double exalt slam fishing flat cold on a fire/lightning-flat magic ring.
  {
    key: "ring_catalysing_exalt",
    domain: "jewellery",
    label: "Ring · Tul's catalysed exalt",
    source: "XTheFarmerX ring craft (Tul's 20% → catalysing + greater exaltation → collarbone)",
    base: {
      label: "Magic ring · T1 flat fire/lightning",
      category: "accessory.ring",
      rarity: "magic",
      ilvlMin: 75,
      stats: [{ text: "Adds # to # Fire Damage to Attacks", min: 20 }],
      note: "T1 flat FIRE or LIGHTNING (never cold — you're slamming for cold; owning it blocks the hit). Search shows the fire variant; lightning equivalents count. Open suffix or good res roll, ≤2 div.",
    },
    result: {
      label: "Rare ring · double flat + rarity",
      category: "accessory.ring",
      rarity: "rare",
      ilvlMin: 75,
      stats: [
        { text: "Adds # to # Cold Damage to Attacks", min: 15 },
        { text: "#% increased Rarity of Items found", min: 20 },
      ],
      note: "Valued as flat-cold + rarity rare ring — the weighted-sum comparable from the guide. Double-flat + res pieces sell well above.",
    },
    materials: [
      { material: MATS.perfectAug, qtyPerAttempt: 1, note: "Open-suffix bases: fish rarity/res before essencing." },
      { material: MATS.greaterEssenceOpulence, qtyPerAttempt: 1, note: "Guaranteed T1 rarity (or Insulation for T3 res when rarity already rolled)." },
      // KB §4/§8: Omen of Catalysing Exaltation turns catalyst quality into a 5× tag weight at 20% (7.5× at 40%)
      { material: MATS.tulsCatalyst, qtyPerAttempt: 24, note: "~20 to reach 20% quality + 4 to re-catalyse for listing. Cold tag: 5× weight at 20% (7.5× at 40%) via Omen of Catalysing Exaltation; no brick mods in pool." },
      { material: MATS.omenCatalysingExaltation, qtyPerAttempt: 1, note: "Biases the FIRST of Greater Exaltation's two mods only (player-confirmed, wiki disputed)." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1 },
      { material: MATS.greaterExalted, qtyPerAttempt: 1 },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 0.4, note: "Prefix desecration — only spent on slams that hit (~1/3), expected qty." },
      { material: MATS.preservedCollarbone, qtyPerAttempt: 0.4, note: "Same — hit-gated." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 0.4, note: "Same — hit-gated." },
    ],
    hitRate: 0.3,
    guide: GUIDES.ring_catalysing_exalt!,
  },

  // 4) Fracture the +3-levels mod behind a desecration block (1-in-3), then finish out of profit.
  {
    key: "amulet_fracture_plus3",
    domain: "jewellery",
    label: "Amulet · fracture the +3",
    source: "XTheFarmerX amulet craft (opulence → collarbone block → Fracturing Orb 1-in-3)",
    base: {
      label: "Rare amulet · +3 spell skills",
      type: "Stellar Amulet",
      rarity: "rare",
      ilvlMin: 75,
      stats: [{ text: "# to Level of all Spell Skills", min: 3 }],
      note: "Base already rolled the +3 (that's what you're fracturing). Stellar/gold bases sell best; open prefix worth ~1 div premium.",
    },
    result: {
      label: "Fractured +3 amulet",
      type: "Stellar Amulet",
      rarity: "rare",
      ilvlMin: 75,
      stats: [
        { text: "# to Level of all Spell Skills", min: 3 },
        { text: "# to maximum Life", min: 40 },
      ],
      note: "trade2 query can't filter 'fractured' — proxied as +3 + life, an UNDERestimate: a real fractured +3 is a permanent craft base and sells well above this comparable (+3+rarity pieces were <5 listed, too thin to price).",
    },
    materials: [
      { material: MATS.perfectAug, qtyPerAttempt: 1, note: "Only on open-prefix bases — and Augmentation needs a MAGIC item (KB §1); unverified on this rare base." },
      { material: MATS.greaterEssenceOpulence, qtyPerAttempt: 1, note: "Guaranteed T1 rarity." },
      // KB §2 (poe2-crafting-knowledge.md): fracture needs ≥4 mods; desecrated counts, can't be fractured
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1, note: "Prefix desecration — the blocker: counts toward the 4-mod minimum but can't be fractured." },
      { material: MATS.preservedCollarbone, qtyPerAttempt: 1 },
      { material: MATS.fracturing, qtyPerAttempt: 1, note: "The 1-in-3 at exactly 4 mods (+3 + blocker + 2 others; ≥4 required). Miss = base survives as a normal +3 (resellable), only the orb is burned." },
    ],
    // 1/3 = odds at exactly 4 mods with one desecrated blocker (KB §2); more mods on the item = lower odds
    hitRate: 0.33,
    guide: GUIDES.amulet_fracture_plus3!,
  },

  // 5) Rathpith Globe unique gamble ("wrath pit" from the Blood Mage video, decoded): Vaal
  //    Cultivation Orb re-rolls the unique until the double per-100-Mana lines land. Mechanic
  //    detail is partially UNVERIFIED — the guide says to test one cheap copy first.
  {
    key: "focus_rathpith_gamble",
    domain: "weapon",
    label: "Rathpith Globe · cultivation gamble",
    source: "Blood Mage showcase video (double-mana “wrath pit”) + KB economy-meta research",
    base: {
      label: "Rathpith Globe (corrupted)",
      name: "Rathpith Globe",
      corrupted: true,
      stats: [],
      note: "Vaal Cultivation only works on CORRUPTED Vaal uniques — buy the cheapest corrupted copies. Mods vary per copy; one wanted mana line already present = better start.",
    },
    result: {
      label: "Rathpith · double per-100-Mana lines",
      name: "Rathpith Globe",
      corrupted: "any",
      stats: [
        { text: "Non-Channelling Spells deal #% increased Damage per 100 maximum Mana" },
        { text: "Non-Channelling Spells have #% increased Critical Hit Chance per 100 maximum Mana" },
      ],
      note: "Valued at the visible double-line floor (thin market). Reddit-reported: clean double-mana no-life-cost pieces ~600 div; players also report 300+ div spent dry — the tail is NOT in this number.",
    },
    materials: [
      {
        material: MATS.vaalCultivation,
        qtyPerAttempt: 1,
        note: "The bet (~3 div): replaces 1–2 mods with cultivated-pool mods (Life Cost Efficiency 8–15%, Ailment Magnitude per 100 Life, Damage per 100 Mana, Crit per 100 Mana).",
      },
      { material: MATS.divine, qtyPerAttempt: 0.1, note: "Value reroll on hits only." },
    ],
    hitRate: 0.05,
    guide: GUIDES.focus_rathpith_gamble!,
  },

  // 6) Putrefaction slot machine on cheap rare boots — quality+sockets BEFORE the corrupting omen.
  //    Two variants sharing the process: ES bases (caster buyers) and EV bases (attack buyers) —
  //    the EV ranking decides which one pays today.
  {
    key: "boots_putrefaction",
    domain: "armour",
    label: "Boots · putrefaction ES (caster)",
    source: "XTheFarmerX putrefaction craft (scraps+sockets FIRST → omen+rib → reveal discipline)",
    base: {
      label: "Cheap rare ES boots (not desecrated)",
      minAskEx: CHEAP_BASE_FLOOR_EX, // honest price ~1 ex — the default 0.05 floor would reject every real ask
      category: "armour.boots",
      rarity: "rare",
      ilvlMin: 82,
      esMin: 1,
      stats: [],
      note: "Cheapest rare ilvl82+ boots on an ES/ES-hybrid base (desecrated prefixes follow the base's defence type). Non-corrupted, non-desecrated — trade can't filter desecration, eyeball each base. Existing mods irrelevant (putrefies to 6).",
    },
    result: {
      label: "Rare boots · 35% MS + ES",
      category: "armour.boots",
      rarity: "rare",
      ilvlMin: 82,
      esMin: 60,
      stats: [{ text: "#% increased Movement Speed", min: 35 }],
      note: "Valued at the 35% MS + ES floor. 30% MS misses still sell 1–2 div with good suffixes (not priced here).",
    },
    materials: PUTREFACTION_MATS,
    hitRate: 0.3,
    guide: GUIDES.boots_putrefaction!,
  },

  {
    key: "boots_putrefaction_ev",
    domain: "armour",
    label: "Boots · putrefaction EV (attack)",
    source: "XTheFarmerX putrefaction craft — evasion variant for the attack meta",
    base: {
      label: "Cheap rare evasion boots (not desecrated)",
      minAskEx: CHEAP_BASE_FLOOR_EX, // honest price ~1 ex — the default 0.05 floor would reject every real ask
      category: "armour.boots",
      rarity: "rare",
      ilvlMin: 82,
      evMin: 1,
      stats: [],
      note: "Cheapest rare ilvl82+ boots on an EVASION/EV-hybrid base. Non-corrupted, non-desecrated — trade can't filter desecration, eyeball each base. Existing mods irrelevant (putrefies to 6).",
    },
    result: {
      label: "Rare boots · 35% MS + evasion",
      category: "armour.boots",
      rarity: "rare",
      ilvlMin: 82,
      evMin: 300,
      stats: [{ text: "#% increased Movement Speed", min: 35 }],
      note: "Valued at the 35% MS + evasion floor — attack builds (Deadeye/Amazon) are the buyers. 30% MS misses still sell 1–2 div.",
    },
    materials: PUTREFACTION_MATS,
    hitRate: 0.3,
    guide: GUIDES.boots_putrefaction_ev!,
  },
];
