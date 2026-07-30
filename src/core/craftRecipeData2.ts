import { MATS } from "./craftMaterials";
import { GUIDES_2 } from "./craftGuideData2";
import { PUTREFACTION_MATS } from "./craftRecipeData";
import type { CraftRecipe } from "./craftRecipes";

/**
 * Second batch of curated recipes (docs/kb/creator-videos.md, "Recipe candidates for the app"
 * items 1-5,7,8 — #6 gem_corrupt_discount deliberately skipped). Split from craftRecipeData.ts to
 * keep both files under the 500-line cap; concatenated into RECIPES there.
 *
 * Every material id is verified against the live DB (see testCraftMargin's id gate). hitRate =
 * probability an attempt yields the SELLABLE result the `result` leg searches (NOT the jackpot
 * rate) — reasoning is in each recipe's comment. qtyPerAttempt folds probabilistic re-tries in.
 */
export const RECIPES_2: CraftRecipe[] = [
  // 1) Body-armour clone of boots_putrefaction — same ~36-ex slot machine, highest-demand slot.
  //    hitRate 0.3: identical mechanic to the boots recipe (KB: ≥1 div avg profit, ~1-in-3 sellable).
  {
    key: "armour_putrefaction",
    domain: "armour",
    label: "Body Armour · putrefaction ES",
    source: "XTheFarmerX putrefaction craft [S10] — body-armour variant (scraps+sockets FIRST → omen+rib)",
    base: {
      label: "Cheap rare body armour (not desecrated)",
      category: "armour.chest",
      rarity: "rare",
      ilvlMin: 80,
      stats: [],
      note: "Cheapest rare ilvl80+ body armour on an ES/ES-hybrid base — desecrated prefixes follow the base's defence type, and this recipe leans ES (caster buyers). 3-mod rares fine (all wiped). Non-corrupted (trade filters it), non-desecrated (eyeball).",
    },
    result: {
      label: "Rare body armour · ES + res",
      category: "armour.chest",
      rarity: "rare",
      ilvlMin: 80,
      esMin: 200,
      stats: [{ text: "#% to Lightning Resistance", min: 30 }],
      note: "Valued at a solid-ES + one 30%+ res floor (KB best ~230 ES / 45% ele res, listed ~18 div). Recorded batch sold 1/2/6/6/10/13 div — most hits sit well under the top roll.",
    },
    materials: PUTREFACTION_MATS,
    hitRate: 0.3,
    guide: GUIDES_2.armour_putrefaction!,
  },

  // 2) Alt/chaos-spam the +2, fracture-lock it (~1-in-3), finish with essence + desecration.
  //    hitRate 0.2: the fracture is the dominant gate (~1-in-3) and the finish adds brick risk —
  //    lower than the putrefaction slot machine because a missed fracture restarts the whole base.
  {
    key: "gloves_projectile_plus2",
    domain: "armour",
    label: "Gloves · +2 Projectile Skills",
    source: "Fubgun/XTheFarmerX +2 projectile gloves [S5] (chaos-spam → fracture → Hysteria + ribcage)",
    base: {
      label: "Rare glove base (high ilvl)",
      category: "armour.gloves",
      rarity: "rare",
      ilvlMin: 82,
      stats: [],
      note: "Cheapest rare ilvl82+ gloves — you roll the +2 yourself (Method 1: chaos/annul-spam), so a plain base is the buy. 82 needed for the T1 flat-damage finish.",
    },
    result: {
      label: "Rare gloves · +2 Projectile Skills",
      category: "armour.gloves",
      rarity: "rare",
      ilvlMin: 82,
      stats: [{ text: "# to Level of all Projectile Skills", min: 2 }],
      note: "Valued by the +2 Projectile prefix — the value driver for Ice Shot/Twisters. A lower T3 flat-damage pair sold 250 div, full BiS ~500; this floor prices the mod, not the god-roll suffixes.",
    },
    materials: [
      { material: MATS.chaos, qtyPerAttempt: 15, note: "Method 1: chaos-spam the rare toward +2 Projectile Skills." },
      { material: MATS.annul, qtyPerAttempt: 5, note: "Clear wrong mods between chaos passes — 50/50 gamble each with 2+ mods." },
      { material: MATS.fracturing, qtyPerAttempt: 1, note: "~1-in-3 to lock the +2 (best odds at ~3 total mods). Miss = restart on a fresh base — the loss lives in hitRate." },
      { material: MATS.essenceOfHysteria, qtyPerAttempt: 1, note: "Guaranteed suffix, straight 50/50 (Crit Spell Damage Bonus vs Cold Res)." },
      { material: MATS.exalted, qtyPerAttempt: 2, note: "Fill the remaining prefix/suffix after the lock." },
      { material: MATS.ancientRib, qtyPerAttempt: 1, note: "Desecrate the last slot (T1 flat Cold/Lightning/Physical, or Suppress). Ancient tier for the ilvl82 base." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1, note: "Reroll the desecration options once." },
      { material: MATS.artificers, qtyPerAttempt: 1, note: "Socket for a rune (rune ~1 ex, not tracked)." },
    ],
    hitRate: 0.2,
    guide: GUIDES_2.gloves_projectile_plus2!,
  },

  // 3) Essence crit + Astrid's crafted slot + alloy-forced cast speed + perfect-exalt spell damage.
  //    hitRate 0.3: each guaranteed step is deterministic; the gate is the final T1 'gain' exalt
  //    (~1-in-3 to 1-in-4) plus the buggy mana-block conversion, but a miss still sells as a mid wand.
  {
    key: "wand_alloy_crystallisation",
    domain: "weapon",
    label: "Wand · alloy crystallisation (budget)",
    source: "Fubgun budget caster wand [S8] (Seeking → Astrid's slot → Transcendent Alloy → perfect-exalt)",
    base: {
      label: "Cheap wand · existing/open crit",
      category: "weapon.wand",
      rarity: "rare",
      ilvlMin: 80,
      stats: [{ text: "#% increased Critical Hit Chance for Spells" }],
      note: "~5 div wand with 2 open suffixes or an existing T3+ crit mod, ilvl 80+. Prefix content is irrelevant — the alloy overwrites it. Cheapest such wands ≈ the buy.",
    },
    result: {
      label: "Rare wand · cast speed + spell dmg + crit",
      category: "weapon.wand",
      rarity: "rare",
      ilvlMin: 80,
      stats: [
        { text: "#% increased Spell Damage", min: 40 },
        { text: "#% increased Cast Speed", min: 15 },
        { text: "#% increased Critical Hit Chance for Spells" },
      ],
      note: "Valued at a budget caster-wand floor (cast speed + spell damage + crit present). Typical sale ~80-100 div; one lucky triple hit sold a 30 div craft for 400. The T1 'gain' tail isn't in this number.",
    },
    materials: [
      { material: MATS.greaterEssenceSeeking, qtyPerAttempt: 1, note: "Guaranteed T3 crit chance suffix." },
      { material: MATS.astridsCreativity, qtyPerAttempt: 1, note: "The 'additional crafted modifier' orb (~4-5 div) — holds a slot for the final bench craft." },
      { material: MATS.omenSinistralCrystallisation, qtyPerAttempt: 1, note: "Prefix Crystallisation — forces the alloy onto a prefix." },
      { material: MATS.transcendentAlloy, qtyPerAttempt: 1, note: "Converts a prefix into its guaranteed near-min-tier mod (cast speed)." },
      { material: MATS.essenceOfTheAbyss, qtyPerAttempt: 1, note: "Mana-block route: marks a mod for the Jawbone conversion." },
      { material: MATS.preservedJawbone, qtyPerAttempt: 1.5, note: "Converts the mark to a Desecrated slot — the conversion bug needs repeat attempts (~1.5 avg)." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1 },
      { material: MATS.exalted, qtyPerAttempt: 1, note: "Perfect-exalt the last prefix for T1 spell damage / elemental-gain (~1-in-3 to 1-in-4)." },
      { material: MATS.annul, qtyPerAttempt: 0.5, note: "Fail path: recover from a bad hit before re-slamming." },
    ],
    hitRate: 0.3,
    guide: GUIDES_2.wand_alloy_crystallisation!,
  },

  // 4) Grind Spirit via desecration on a MAGIC amulet, convert a suffix to global defence, catalyse res.
  //    hitRate 0.4: the Spirit hunt is a grind-until-hit (so a completed craft almost always carries
  //    Spirit), but T1-vs-T2 Spirit and the finishing slams swing whether it clears the comparable.
  {
    key: "amulet_giga_spirit",
    domain: "jewellery",
    label: "Amulet · giga Spirit",
    source: "XTheFarmerX expert/giga Spirit amulet [S11] (desecration Spirit hunt → Enhancement convert → catalysed res)",
    base: {
      label: "Magic Gold/Solar amulet",
      type: "Solar Amulet",
      rarity: "magic",
      ilvlMin: 75,
      stats: [],
      note: "Gold or Solar amulet kept MAGIC — Spirit only adds while Magic, so sequence it before any Rare upgrade. ilvl 75+.",
    },
    result: {
      label: "Rare amulet · +30 Spirit",
      category: "accessory.amulet",
      rarity: "rare",
      ilvlMin: 75,
      stats: [{ text: "# to Spirit", min: 30 }],
      note: "Valued at the +30 Spirit floor — Spirit gates aura/Arctic-Armour thresholds (40 is the huge breakpoint). ~70 div in → ~180 div sale in the source session. Global-defence + res push real sales higher.",
    },
    materials: [
      { material: MATS.preservedCollarbone, qtyPerAttempt: 30, note: "Spirit hunt: repeated desecration until Spirit lands (T2 ~30 attempts; T1 far more). Dominates the craft cost." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 15, note: "Reroll dead reveal sets during the hunt (~half the attempts)." },
      { material: MATS.omenDextralExaltation, qtyPerAttempt: 1, note: "Force a guaranteed suffix to convert." },
      { material: MATS.omenDextralCrystallisation, qtyPerAttempt: 1, note: "Pairs with Perfect Essence of Enhancement." },
      { material: MATS.perfectEssenceEnhancement, qtyPerAttempt: 1, note: "Converts the suffix into a global Armour/Evasion/ES prefix (Spirit blocks Magic-only adds once Rare)." },
      { material: MATS.xophsCatalyst, qtyPerAttempt: 20, note: "Fire catalyst (never Cold) — biases the Fire/Elemental Res slam. Esh's (lightning) is the alternative." },
      { material: MATS.omenCatalysingExaltation, qtyPerAttempt: 1 },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1 },
      { material: MATS.perfectExalted, qtyPerAttempt: 1, note: "Fire/Elemental Res slam." },
    ],
    hitRate: 0.4,
    guide: GUIDES_2.amulet_giga_spirit!,
  },

  // (removed) "jewel_desecrated_liquid" — refuted 2026-07-15: non-Ancient Potent Liquid Contempt
  // grants a FIXED damage prefix (Sapphire→chaos, Ruby→phys, Emerald→ele) on rare Basic jewels,
  // NOT a strippable "+1 modifier"; that mod exists only from Ancient tier on Time-Lost jewels.
  // Regular rare jewels also cap at 4 mods (5 = corrupted only), so a "budget 5-mod" can't exist.
  // 6) Quarterstaff desecrate-FIRST crit — no Amanamu pool for staffs, so a blind desecration with a
  //    hard stop-loss. hitRate 0.3: blind reveal from the weaker normal pool for a good crit/phys line,
  //    comparable to the bow craft but without the Liege-forced jackpot.
  {
    key: "quarterstaff_desecrate_crit",
    domain: "weapon",
    label: "Quarterstaff · desecrate-first crit",
    source: "Fubgun quarterstaff craft [S9] (Abrasion → desecrate FIRST, no omen → exalt only if good)",
    base: {
      label: "Rare quarterstaff · top flat-roll",
      category: "weapon.warstaff",
      rarity: "rare",
      ilvlMin: 80,
      stats: [{ text: "#% increased Physical Damage", min: 60 }],
      note: "Rare quarterstaff bought near the TOP of its flat-roll range (~145-150+ of a ~130-150+ span), ~4 div. Base roll RANGE matters as much as the affix — bottom-of-range is poor value even at the same price.",
    },
    result: {
      label: "Rare quarterstaff · ~550 pdps crit",
      category: "weapon.warstaff",
      rarity: "rare",
      ilvlMin: 80,
      pdpsMin: 450,
      stats: [],
      note: "Valued by physical DPS floor (~550 flat phys ≈ 450+ pdps, the guide's sellable line). Crit Damage Bonus + 12% crit push real sales to 6-9+ div off a ~4 div base.",
    },
    materials: [
      { material: MATS.greaterEssenceAbrasion, qtyPerAttempt: 1, note: "Guaranteed flat Physical (Fizz)." },
      { material: MATS.preservedJawbone, qtyPerAttempt: 1, note: "Desecrate FIRST — no mod-lock omen exists for staffs, so it's blind from the weaker normal pool." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1, note: "Reroll the desecration options once." },
      { material: MATS.exalted, qtyPerAttempt: 1.5, note: "1-2 slams ONLY if the desecration hit — the stop-loss is the edge (~1.5 expected)." },
      { material: MATS.artificers, qtyPerAttempt: 1, note: "Socket for a Greater Iron Rune (rune ~1 ex, not tracked)." },
    ],
    hitRate: 0.3,
    guide: GUIDES_2.quarterstaff_desecrate_crit!,
  },

  // 7) Cheap magic amulet → guaranteed T1 rarity + desecrated jackpot. hitRate 0.5: Greater Essence of
  //    Opulence GUARANTEES the T1-rarity result the leg searches, so nearly every attempt is sellable;
  //    the ~1-in-15 Spirit/Rarity jackpot is upside not priced into the floor.
  {
    key: "amulet_desecrated_beginner",
    domain: "jewellery",
    label: "Amulet · beginner desecrated",
    source: "XTheFarmerX beginner amulet [S11] (Perfect Aug → Opulence T1 rarity → Sinistral desecration jackpot)",
    base: {
      label: "Cheap magic amulet (open prefix)",
      category: "accessory.amulet",
      rarity: "magic",
      ilvlMin: 75,
      stats: [],
      note: "Any cheap MAGIC amulet base (~2 div), open prefix preferred. ~4 div all-in.",
    },
    result: {
      label: "Rare amulet · T1 Rarity",
      category: "accessory.amulet",
      rarity: "rare",
      ilvlMin: 75,
      stats: [{ text: "#% increased Rarity of Items found", min: 25 }],
      note: "Valued at the guaranteed T1-Rarity floor — profitable even without the ~1-in-15 Spirit/Rarity desecration jackpot. Rarity is low-value very early league; check current asks before batching.",
    },
    materials: [
      { material: MATS.perfectAug, qtyPerAttempt: 1, note: "On the open prefix (accept life/ES/evasion/Spirit/rarity)." },
      { material: MATS.greaterEssenceOpulence, qtyPerAttempt: 1, note: "Guaranteed T1 Rarity — the sellable floor." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1, note: "Forces the desecrated roll to a prefix (jackpot: Spirit or 2nd Rarity)." },
      { material: MATS.preservedCollarbone, qtyPerAttempt: 1 },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1 },
      { material: MATS.exalted, qtyPerAttempt: 1, note: "2 mods in one slam (accept filler)." },
    ],
    hitRate: 0.5,
    guide: GUIDES_2.amulet_desecrated_beginner!,
  },

  // 8) High-end attack ring (fractured T1 flat → whittle to double T1 res). SEASONAL: the source
  //    video calls it a money printer EARLY league (whittles 3-4 div, attack meta) and a trap late
  //    league — the EV number will say which regime we're in. hitRate 0.7: the whittle loop is
  //    grind-until-done (no brick on suffix whittles), variance lives in COST, not in whether a
  //    sellable ring comes out; the searched result (T1 flat + T1 res) lands on most completions.
  {
    key: "ring_fractured_t1res",
    domain: "jewellery",
    label: "Ring · fractured flat + T1 res (high-end)",
    source: "Attack ring craft PERFECTED [S21] (fractured base → chaos 2nd flat → breach-quality shuttle → whittle to double T1 res)",
    base: {
      label: "ilvl82 Gold Ring · fractured T1 flat",
      type: "Gold Ring",
      rarity: "rare",
      ilvlMin: 82,
      stats: [{ text: "Adds # to # Cold Damage to Attacks", min: 20 }],
      note: "Must have a FRACTURED tier-one flat elemental (trade can't filter fractured here — eyeball the fracture icon + tier before buying; 40% quality inflates T2 numbers). Cold preferred; fire/lightning fractures work too.",
    },
    result: {
      label: "Gold Ring · T1 flat + T1 res package",
      type: "Gold Ring",
      rarity: "rare",
      ilvlMin: 82,
      stats: [
        { text: "Adds # to # Cold Damage to Attacks", min: 20 },
        { text: "#% to Lightning Resistance", min: 36 },
      ],
      note: "Comparable = high flat + T2+ res on a Gold Ring (true T1+T1 pieces were 1-listed — too thin to price). The finished ring (TWO T1 res + premium settle) sells well above this floor: creator's 1:1 comp 625 div late league, 800-900 early.",
    },
    materials: [
      { material: MATS.chaos, qtyPerAttempt: 500, note: "The second-T1-flat chaos spam (~400-600 expected; phys stays in the pool as a whittle out)." },
      { material: MATS.omenDextralExaltation, qtyPerAttempt: 1 },
      { material: MATS.exalted, qtyPerAttempt: 1 },
      { material: MATS.essenceOfTheBreach, qtyPerAttempt: 1, note: "Breach-quality shuttle mod (moved out later by whittles)." },
      { material: MATS.omenDextralCrystallisation, qtyPerAttempt: 1 },
      { material: MATS.xophsCatalyst, qtyPerAttempt: 40, note: "Fire/lightning quality, applied TWICE (before each slam AND re-applied before whittling — skipping the re-quality bricked 3 rings)." },
      { material: MATS.omenCatalysingExaltation, qtyPerAttempt: 2, note: "Two SINGLE perfect slams — two independent T1-res chances." },
      { material: MATS.perfectExalted, qtyPerAttempt: 2 },
      { material: MATS.omenWhittling, qtyPerAttempt: 22, note: "The cost core (~20-26 expected). Early league 3-4 div each = green light; expensive whittles kill the craft." },
      { material: MATS.greaterChaos, qtyPerAttempt: 22, note: "One per whittle." },
      { material: MATS.preservedCollarbone, qtyPerAttempt: 12, note: "Prefix desecrations: the ilvl-75 whittle shield + the final-prefix Light loop." },
      { material: MATS.omenLight, qtyPerAttempt: 10, note: "Desecration rerolls (shield fishing + final prefix)." },
    ],
    hitRate: 0.7,
    guide: GUIDES_2.ring_fractured_t1res!,
  },
];
