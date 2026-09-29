import { MATS } from "./craftMaterials";
import { GUIDES_2 } from "./craftGuideData2";
import { PUTREFACTION_MATS } from "./craftRecipeData";
import { CHEAP_BASE_FLOOR_EX } from "./craftValuation";
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
    base: {
      label: "Cheap rare body armour (not desecrated)",
      minAskEx: CHEAP_BASE_FLOOR_EX, // honest price ~1 ex — the default 0.05 floor would reject every real ask
      category: "armour.chest",
      rarity: "rare",
      ilvlMin: 80,
      stats: [],
      note: "Cheapest rare ilvl80+ body armour on an ES/ES-hybrid base — desecrated prefixes follow the base's defence type, and this recipe leans ES (caster buyers). 3-mod rares fine (all wiped). Non-corrupted (trade filters it), non-desecrated (eyeball).",
    },
    result: {
      label: "Corrupted rare body armour · 200 ES + res",
      category: "armour.chest",
      rarity: "rare",
      ilvlMin: 80,
      esMin: 200,
      corrupted: true, // the putrefaction omen corrupts — uncorrupted listings are a different product
      stats: [{ text: "+#% total Elemental Resistance", min: 60, group: "pseudo", tier: 2 }],
      note: "Valued from instant-buyout CORRUPTED comparables: 200+ ES body armour with 60%+ total elemental res when enough are listed (else 200+ ES alone). Recorded batch sold 1/2/6/6/10/13 div — most hits sit well under the top roll.",
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
    base: {
      label: "Rare glove base (high ilvl)",
      minAskEx: CHEAP_BASE_FLOOR_EX, // honest price ~1 ex — the default 0.05 floor would reject every real ask
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
      stats: [
        { text: "# to Level of all Projectile Skills", min: 2, group: "fractured", tier: 1 },
        // no pseudo for flat elemental attack damage exists; cold = the Ice Shot buyers the note names
        { text: "Adds # to # Cold Damage to Attacks", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables with a FRACTURED +2 Projectile Skills (the recipe's lock), plus a flat cold finish (Ice Shot buyers) when enough are listed (else the fractured +2 alone). A lower T3 flat-damage pair sold 250 div, full BiS ~500.",
    },
    materials: [
      { material: MATS.chaos, qtyPerAttempt: 15, note: "Method 1: chaos-spam the rare toward +2 Projectile Skills." },
      { material: MATS.annul, qtyPerAttempt: 5, note: "Clear wrong mods between chaos passes — 50/50 gamble each with 2+ mods." },
      // KB §2 (poe2-crafting-knowledge.md): fracture needs ≥4 mods; desecrated counts, can't be fractured
      { material: MATS.fracturing, qtyPerAttempt: 1, note: "UNVERIFIED ordering (fracture with an unrevealed desecrated blocker). 1-in-3 to lock the +2 at exactly 4 mods (+2 + 2 junk + unrevealed desecrated blocker; ≥4 required). Miss = restart on a fresh base — the loss lives in hitRate." },
      { material: MATS.essenceOfHysteria, qtyPerAttempt: 1, note: "Guaranteed suffix, straight 50/50 (Crit Spell Damage Bonus vs Cold Res)." },
      { material: MATS.exalted, qtyPerAttempt: 2, note: "Fill the remaining prefix/suffix after the lock." },
      // KB §5: Ancient bone = modifier level 40+ floor; Preserved already works on any item level
      { material: MATS.ancientRib, qtyPerAttempt: 1, note: "UNVERIFIED ordering: the fracture blocker, revealed afterwards as the finish (T1 flat Cold/Lightning/Physical, or Suppress). Ancient for its mod-level-40 reveal floor — not an ilvl need (Preserved works on any ilvl)." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1, note: "Reroll the desecration reveal options once." },
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
        { text: "#% increased Spell Damage", min: 40, tier: 1 },
        { text: "#% increased Cast Speed", min: 15, tier: 1 },
        { text: "#% increased Critical Hit Chance for Spells", tier: 1 },
        { text: "# to maximum Mana", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: spell damage 40%+, cast speed 15%+ and crit for spells, plus a mana line when enough are listed. Typical sale ~80-100 div; the T1 'gain' tail sits above the band.",
    },
    materials: [
      { material: MATS.greaterEssenceSeeking, qtyPerAttempt: 1, note: "Guaranteed T3 crit chance suffix." },
      // RePoE catalog lists Astrid's Creativity as a SoulCore (Augment socket), and 0.5 has no crafting bench
      { material: MATS.astridsCreativity, qtyPerAttempt: 1, note: "UNVERIFIED: guide calls it the 'additional crafted modifier' orb (~4-5 div) for a final bench craft — RePoE says it's a Soul Core for an Augment socket, and 0.5 has no bench." },
      { material: MATS.omenSinistralCrystallisation, qtyPerAttempt: 1, note: "Prefix Crystallisation — forces the alloy onto a prefix." },
      { material: MATS.transcendentAlloy, qtyPerAttempt: 1, note: "Converts a prefix into its guaranteed near-min-tier mod (cast speed)." },
      { material: MATS.essenceOfTheAbyss, qtyPerAttempt: 1, note: "Mana-block route: marks a mod for the Jawbone conversion." },
      { material: MATS.preservedJawbone, qtyPerAttempt: 1.5, note: "Converts the mark to a Desecrated slot — the conversion bug needs repeat attempts (~1.5 avg)." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1 },
      // KB §1: Perfect Exalted Orb floor = modifier level 50 — the odds below assume it, so price the Perfect orb
      { material: MATS.perfectExalted, qtyPerAttempt: 1, note: "Perfect-exalt the last prefix for T1 spell damage / elemental-gain (~1-in-3 to 1-in-4; mod-level-50 floor)." },
      { material: MATS.annul, qtyPerAttempt: 0.5, note: "Fail path: recover from a bad hit before re-slamming." },
    ],
    hitRate: 0.3,
    guide: GUIDES_2.wand_alloy_crystallisation!,
  },

  // 4) Chaos-spam Spirit on a RARE amulet, convert a suffix to global defence, catalyse res.
  //    hitRate 0.4: the Spirit hunt is a grind-until-hit (so a completed craft almost always carries
  //    Spirit), but T1-vs-T2 Spirit and the finishing slams swing whether it clears the comparable.
  //    Corrected 2026-09-30: the S11 transcript chaos-spams the Spirit (Chaos Orbs work on rares only),
  //    and RePoE lists IncreasedSpirit1-5 as ordinary amulet prefixes — the old "Magic only, repeated
  //    desecration" reading was wrong (docs/kb/creator-videos.md adversarial log).
  {
    key: "amulet_giga_spirit",
    domain: "jewellery",
    label: "Amulet · giga Spirit",
    base: {
      label: "Rare Gold/Solar amulet",
      minAskEx: CHEAP_BASE_FLOOR_EX, // honest price ~1 ex — the default 0.05 floor would reject every real ask
      type: "Solar Amulet",
      rarity: "rare",
      ilvlMin: 75,
      stats: [],
      note: "RARE Gold or Solar amulet, ilvl 75+ — Chaos Orbs roll the Spirit on the rare (S11). In the video it is the fractured +3 from the intermediate craft.",
    },
    result: {
      label: "Rare amulet · +30 Spirit",
      category: "accessory.amulet",
      rarity: "rare",
      ilvlMin: 75,
      stats: [
        { text: "# to Spirit", min: 30, tier: 1 },
        { text: "#% increased Global Armour, Evasion and Energy Shield", tier: 2 },
        { text: "#% to Fire Resistance", min: 30, tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: +30 Spirit with the Enhancement global-defence convert and 30%+ fire res when enough are listed (else Spirit alone). ~70 div in → ~180 div sale in the source session.",
    },
    materials: [
      { material: MATS.chaos, qtyPerAttempt: 150, note: "Spirit hunt: S11 puts T1 at ~200–300 chaos and landed T2 in ~30; ~150 is our blended estimate. Dominates the craft cost." },
      { material: MATS.omenDextralExaltation, qtyPerAttempt: 1, note: "Force a guaranteed suffix to convert." },
      { material: MATS.omenDextralCrystallisation, qtyPerAttempt: 1, note: "Pairs with Perfect Essence of Enhancement." },
      { material: MATS.perfectEssenceEnhancement, qtyPerAttempt: 1, note: "Converts the suffix into a global Armour/Evasion/ES prefix." },
      { material: MATS.xophsCatalyst, qtyPerAttempt: 20, note: "Fire catalyst (never Cold) — biases the Fire/Elemental Res slam. Esh's (lightning) is the alternative." },
      { material: MATS.omenCatalysingExaltation, qtyPerAttempt: 1 },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1 },
      { material: MATS.perfectExalted, qtyPerAttempt: 1, note: "Fire/Elemental Res slam." },
      { material: MATS.preservedCollarbone, qtyPerAttempt: 1, note: "Fills the last slot (high Life/ES/Evasion/Rarity)." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 1, note: "S11: '100% worth it here' on the final reveal." },
    ],
    hitRate: 0.4,
    guide: GUIDES_2.amulet_giga_spirit!,
  },

  // (5) the budget liquid-emotion jewel lives in craftRecipeData3.ts as `jewel_liquid_5mod_budget`.
  // 6) Quarterstaff desecrate-FIRST crit — no Amanamu pool for staffs, so a blind desecration with a
  //    hard stop-loss. hitRate 0.3: blind reveal from the weaker normal pool for a good crit/phys line,
  //    comparable to the bow craft but without the Liege-forced jackpot.
  {
    key: "quarterstaff_desecrate_crit",
    domain: "weapon",
    label: "Quarterstaff · desecrate-first crit",
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
      // weapon crit damage is the local "+#% to" stat; "#% increased Critical Damage Bonus" is the global one
      stats: [{ text: "#% to Critical Damage Bonus", tier: 2 }],
      note: "Valued from instant-buyout comparables: 450+ pdps rare quarterstaff with a Crit Damage Bonus line when enough are listed (else pdps alone). Crit + 12% crit push real sales to 6-9+ div off a ~4 div base.",
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
      // No tier-2 Spirit / 2nd-Rarity stat: hitRate 0.5 is the GUARANTEED T1-rarity outcome, and
      // pricing the ~1-in-15 jackpot archetype at that rate would overstate EV several-fold.
      stats: [{ text: "#% increased Rarity of Items found", min: 25, tier: 1 }],
      note: "Valued from instant-buyout comparables with the guaranteed T1 Rarity — the ~1-in-15 Spirit/Rarity desecration jackpot is upside NOT priced in. Rarity is low-value very early league.",
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
    base: {
      label: "ilvl82 Gold Ring · fractured T1 flat",
      type: "Gold Ring",
      rarity: "rare",
      ilvlMin: 82,
      stats: [{ text: "Adds # to # Cold Damage to Attacks", min: 20, group: "fractured" }],
      note: "Must have a FRACTURED tier-one flat elemental — searched as the fractured stat itself (40% quality inflates T2 numbers, check the tier). Cold priced here; fire/lightning fractures work too.",
    },
    result: {
      label: "Gold Ring · T1 flat + T1 res package",
      type: "Gold Ring",
      rarity: "rare",
      ilvlMin: 82,
      stats: [
        { text: "Adds # to # Cold Damage to Attacks", min: 20, group: "fractured", tier: 1 },
        { text: "#% to Lightning Resistance", min: 36, tier: 1 },
        { text: "#% to Fire Resistance", min: 36, tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: FRACTURED flat cold 20+ with T1 lightning res, plus a second T1 (fire) res when enough are listed (else one T1 res). Creator's 1:1 comp 625 div late league, 800-900 early.",
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
      // RePoE catalog: Omen of Light makes the next Annulment remove only Desecrated mods (a strip, not a
      // reroll); reveal rerolls are Omen of Abyssal Echoes (KB §4). ~12 desecrations → ~12 reveals (one
      // Echoes each) and ~10 misses, each stripped by Light + Annulment before re-desecrating.
      { material: MATS.preservedCollarbone, qtyPerAttempt: 12, note: "Prefix desecrations: the ilvl-75 whittle shield + the final-prefix loop (~12 total)." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 12, note: "One options reroll per reveal (~12 reveals)." },
      { material: MATS.omenLight, qtyPerAttempt: 10, note: "Strip each missed desecration (~10): Light + Annulment removes only the desecrated mod." },
      { material: MATS.annul, qtyPerAttempt: 10, note: "Paired with each Omen of Light strip." },
    ],
    hitRate: 0.7,
    guide: GUIDES_2.ring_fractured_t1res!,
  },
];
