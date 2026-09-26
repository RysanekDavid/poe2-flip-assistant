import { MATS } from "./craftMaterials";
import type { CraftGuide } from "./craftRecipes";

/**
 * Phase-by-phase craft playbooks, transcribed from the user's guide collection (crafting chat +
 * Fubgun / XTheFarmerX videos). This is DOMAIN CONTENT, not logic. Prose is deliberately TIGHT —
 * the UI renders it inside an interactive session, walls of text kill it. Each risky step carries
 * a `warning`, each gamble an `onFail`, and key steps a `check` (what the item must look like now,
 * so the player can verify before continuing).
 */
export const GUIDES: Record<string, CraftGuide> = {
  jewel_suffix_push: {
    goal: "5-mod caster jewel: Crit Chance for Spells + Crit Damage Bonus suffixes, Spell Damage prefixes, high rolls.",
    shopping:
      "RARE Time-Lost jewel (Ancient liquids only work on rare — regal a magic one) with 2 caster suffixes + max ONE junk prefix, decent item level (Alt tooltip). Buy several — bases die on bad liquid rolls. Emerald = attack variant, same structure.",
    marketCheck:
      "Price FINISHED 5-mod caster jewels first (cheapest asks). 100+ div → craft. 20–30 div → saturated market, don't craft.",
    phases: [
      {
        title: "Push +1 suffix",
        steps: [
          {
            do: "Slam Ancient Potent Liquid Contempt.",
            why: "Removes a random mod and grants “+1 Suffix Modifier allowed” OR the prefix version — 50/50 which side you get.",
            mats: [MATS.ancientPotentLiquidContempt],
            onFail: "Prefix version (or it ate a good suffix) → this base is done, take the next one. That's why you bought several.",
            check: "Item shows “+1 Suffix Modifier allowed”, caster suffixes intact.",
          },
        ],
      },
      {
        title: "Desecrated suffix",
        steps: [
          {
            do: "Activate Omen of Dextral Necromancy, slam a Preserved Cranium.",
            why: "Forces the hidden desecrated mod onto a suffix.",
            mats: [MATS.omenDextralNecromancy, MATS.preservedCranium],
          },
          {
            do: "Well of Souls: have Omen of Abyssal Echoes in the inventory, then reveal and pick.",
            why: "Echoes = ONE reroll of the three offered options — insurance for a bad set, not a guarantee.",
            mats: [MATS.omenAbyssalEchoes],
            pick: [
              "% increased Critical Hit Chance for Spells",
              "% increased Critical Spell Damage Bonus",
              "% increased Cast Speed",
            ],
            onFail:
              "Both option sets bad → Omen of Light + Orb of Annulment strips JUST the revealed desecrated mod (rest of the item untouched), then desecrate again with a fresh cranium.",
            check: "3 caster suffixes + the +1-suffix mod.",
          },
        ],
      },
      {
        title: "Effect of Suffixes",
        steps: [
          {
            do: "Slam Ancient Potent Liquid Ferocity.",
            why: "Removes a random mod and grants (40–60)% increased Effect of Suffixes — with one junk prefix left, that's the mod you want eaten.",
            mats: [MATS.ancientPotentLiquidFerocity],
            onFail: "It removed a caster suffix instead → decide: continue as a weaker piece or sell as-is.",
            check: "Suffixes intact + “increased Effect of Suffixes”.",
          },
        ],
      },
      {
        title: "Fill prefixes",
        steps: [
          {
            do: "Omen of Sinistral Annulment + Orb of Annulment — pull the “+1 Suffix Modifier allowed” mod out.",
            why: "It sits on the PREFIX side; Sinistral restricts the annul to prefixes, so it can't touch your suffixes. The 4 suffixes stay (over-cap is kept) and the prefix slots open up for exalts.",
            mats: [MATS.omenSinistralAnnulment, MATS.annul],
            check: "All 4 suffixes intact, “+1 Suffix Modifier allowed” gone, prefixes open.",
          },
          {
            do: "Fill the open prefixes with Exalted Orbs, fishing Spell Damage / Elemental Damage.",
            why: "Exalts only ADD mods. PoE2 Chaos removes a random EXISTING mod first — it can eat a suffix; reroll a bad prefix only under Omen of Sinistral Erasure.",
            mats: [MATS.exalted],
          },
          {
            do: "Divine at the very end — and only if EVERY mod is worth rerolling.",
            why: "Divine rerolls ALL numeric values, suffixes included — it can't target just the prefixes. Stop on a good roll.",
            mats: [MATS.divine],
          },
        ],
      },
    ],
    brick: "Bad liquid roll → sell as 3–4 mod, next base. One desecrated mod per item — annul it before re-desecrating.",
  },

  bow_amanamu: {
    goal: "400+ pdps crit bow: %phys + flat phys + guaranteed T3+ Attack Speed + essence crit.",
    shopping:
      "Obliterator (best) or Warmonger %phys base, ilvl 75+ (82 for T1 %phys). Magic one-mod base: AUG first. Recycle junk 3-to-1 at the bench.",
    marketCheck: "Price finished 400+ dps crit bows first. If they sell under base + ~1 div mats, buy instead of crafting.",
    phases: [
      {
        title: "Guarantee crit",
        steps: [
          {
            do: "Greater Essence of Seeking on the %phys base.",
            why: "Guaranteed crit — the crit-swap enabler. (Non-crit: Abrasion for flat phys.)",
            mats: [MATS.greaterEssenceSeeking],
            check: "Base has %phys + crit chance.",
          },
        ],
      },
      {
        title: "Amanamu attack speed",
        steps: [
          {
            do: "Activate Omen of Dextral Necromancy + Omen of the Liege, slam a Preserved Jawbone.",
            why: "Liege forces an Amanamu mod (and blocks Ulaman/Kurgal) — Attack Speed 12–18% is the jackpot of the pool.",
            mats: [MATS.omenDextralNecromancy, MATS.omenTheLiege, MATS.preservedJawbone],
            onFail: "Pierce instead of attack speed → finish cheap without omens, or sell as-is.",
          },
          {
            do: "Well of Souls: Omen of Abyssal Echoes in the inventory, then unveil and pick.",
            why: "Echoes = one reroll of the three options if the first set is bad.",
            mats: [MATS.omenAbyssalEchoes],
            // KB §5 + poe2-bow-crafting-0.5.md §2: Dextral forces a SUFFIX; the Amanamu bow suffix pool
            // is Attack Speed (12–18%) and Pierce (40–60%) — flat damage is a prefix and can't appear here.
            pick: ["Attack Speed 12–18% (Amanamu jackpot)", "Pierce 40–60% (fallback)"],
          },
        ],
      },
      {
        title: "Fill + finish",
        steps: [
          {
            do: "Omen of Greater Exaltation + one Greater Exalted Orb (applies twice) — fishing the open prefixes for flat Physical (best) or high flat Fire/Cold/Lightning.",
            // flat-damage advice lives here: it's a PREFIX target (poe2-bow-crafting-0.5.md §2), not a reveal pick
            why: "Perfect exalts trim one tier for ~3 div more — not worth it under mirror tier.",
            mats: [MATS.omenGreaterExaltation, MATS.greaterExalted],
          },
          {
            do: "Artificer sockets + Greater Iron Runes.",
            why: "Flat phys from runes scales your %phys. Runes ~1 ex each.",
            mats: [MATS.artificers],
            check: "400+ pdps tooltip → list it.",
          },
        ],
      },
    ],
    brick: "Missed AS or junk exalts → still a sellable mid bow, list cheap. Spear = same craft; quarterstaff has NO Amanamu — prefix desecration instead.",
  },

  ring_catalysing_exalt: {
    goal: "Double-flat ele + rarity/res ring. Comparables sold 10–80 div by roll.",
    shopping:
      "MAGIC rings, ITEM LEVEL 75+ (Alt tooltip / trade ilvl filter — non-negotiable), T1 flat FIRE or LIGHTNING (never cold — you slam for cold; not phys — dilutes pool). Open suffix ~1 div. Buy 3–5, it's a numbers game.",
    marketCheck: "Weighted-sum filter on finished rings (flat total + rarity), cheapest ask = your sale price minus a div or two.",
    phases: [
      {
        title: "Prep",
        steps: [
          {
            do: "Open suffix? Perfect Orb of Augmentation first.",
            why: "Perfect Aug rolls mods of level 70+ (floors are per-currency: Perfect Exalt is 50, Greater Aug 44). The floor is soft — a family whose top tier sits below it stays eligible.",
            mats: [MATS.perfectAug],
            warning: "Augmentation only works on a MAGIC item with an open affix — a rare or 2-mod ring refuses it. And a low-ilvl base guts the level-70+ pool; buy ilvl 75+.",
          },
          {
            do: "Res roll → Essence of Opulence (T1 rarity). Rarity roll → Essence of Insulation (fire res).",
            mats: [MATS.greaterEssenceOpulence, MATS.greaterEssenceInsulation],
            check: "2–3 good mods, prefixes open.",
          },
        ],
      },
      {
        title: "Catalysed slam",
        steps: [
          {
            do: "Tul's Catalysts to 20% quality.",
            why: "Via Omen of Catalysing Exaltation, 20% quality = 5× weight for cold-tag mods on the slam (40% = 7.5×). Cold pool has no brick mods; Tul's are ~6× cheaper than Reaver.",
            mats: [MATS.tulsCatalyst],
          },
          {
            do: "Omen of Catalysing Exaltation + Omen of Greater Exaltation → one Greater Exalted Orb.",
            why: "Catalyst bias (5× at 20% quality) applies to the FIRST of the two added mods only — the second is unbiased (player-confirmed; the wiki's 'both' claim is disputed). Budget accordingly.",
            mats: [MATS.omenCatalysingExaltation, MATS.omenGreaterExaltation, MATS.greaterExalted],
            onFail: "T1/T2 mana instead of cold (happens a lot) → skip the desecration, sell the ring, next base.",
          },
        ],
      },
      {
        title: "Prefix desecration (hits only)",
        steps: [
          {
            do: "Omen of Sinistral Necromancy + Preserved Collarbone.",
            why: "Only on rings that hit — don't double a dead ring's cost.",
            mats: [MATS.omenSinistralNecromancy, MATS.preservedCollarbone],
          },
          {
            do: "Reveal with Omen of Abyssal Echoes active.",
            mats: [MATS.omenAbyssalEchoes],
            pick: ["flat Cold/Fire/Lightning to Attacks", "% Rarity of Items found", "high flat Life"],
            // RePoE catalog: Omen of Light = "next Orb of Annulment removes only Desecrated modifiers" — a
            // strip, not a reroll; the reveal reroll is Abyssal Echoes (KB §4).
            onFail:
              "Junk reveal → Omen of Light + Orb of Annulment strips only the desecrated mod, re-desecrate with a fresh Collarbone (+Echoes) — only worth it with filled suffixes.",
          },
          {
            do: "Re-catalyse to 20% before listing.",
            why: "Quality inflates displayed numbers → shows up higher in buyers' filters.",
            mats: [MATS.tulsCatalyst],
          },
        ],
      },
    ],
    brick: "~2 in 3 miss is priced in. Mana-slammed rings still sell 2–4 div — list them, don't vendor.",
  },

  amulet_fracture_plus3: {
    goal: "FRACTURED +3 skills amulet = permanent craft base, ~40–60 div on hit.",
    shopping:
      "Rare amulet ITEM LEVEL 75+ that already rolled the +levels mod. Stellar/gold base sells best; open prefix worth ~1 div extra. Low ilvl guts the pool for Perfect currency (Perfect Aug floor = mod level 70, Perfect Exalt = 50).",
    marketCheck: "Check fractured +3 asks NOW. Under ~30 div → fracture EV collapses (1-in-3 hit must cover orb + base ×3).",
    phases: [
      {
        title: "Prep",
        steps: [
          {
            do: "Open prefix? Perfect Orb of Augmentation.",
            mats: [MATS.perfectAug],
            // KB §1: the Augmentation family works on MAGIC items with an open affix only — open issue,
            // the source procedure applies it to a rare base; not rewritten without a verified route.
            warning: "Augmentation only works on a MAGIC item with an open affix (KB §1) — a rare +3 amulet refuses it. Unverified step: skip it on a rare base.",
          },
          {
            do: "Essence of Opulence → T1 rarity.",
            mats: [MATS.greaterEssenceOpulence],
          },
          {
            do: "Omen of Sinistral Necromancy + Preserved Collarbone → prefix desecration.",
            why: "The desecrated mod can't be fractured but counts toward the 4-mod minimum — it's the blocker.",
            mats: [MATS.omenSinistralNecromancy, MATS.preservedCollarbone],
          },
          {
            // KB §2 (poe2-crafting-knowledge.md): fracture needs a rare with ≥4 mods; desecrated counts, can't be fractured
            do: "Count the mods before fracturing.",
            why: "Non-desecrated mods = N → fracture odds 1/N. The item needs ≥4 mods total (the desecrated one counts).",
            check: "Exactly 4 mods: +3 keeper + desecrated blocker + 2 others → 1-in-3. More mods = worse odds.",
          },
        ],
      },
      {
        title: "The fracture",
        steps: [
          {
            do: "Fracturing Orb.",
            why: "1-in-3 at exactly 4 mods (≥4 required) to lock the +3 forever → unbrickable craft base worth 40+ div bare.",
            mats: [MATS.fracturing],
            warning: "Needs at least 4 mods. One fracture per item, ever. No re-rolls.",
            onFail: "Wrong mod fractured → sell as a normal +3, only the orb is lost.",
          },
        ],
      },
      {
        title: "Finish (paid from profit)",
        steps: [
          {
            do: "Fire/Lightning catalysts + Catalysing & Greater Exaltation omens + Perfect Exalted Orb.",
            why: "Perfect Exalted Orb has a modifier-level floor of 50 (Greater Exalt = 35; floors are soft — a family's top tier below the floor stays eligible). The guide runs fire/lightning catalysts; the claimed cold-res tier leak is unverified — check poe2db before deviating.",
            mats: [MATS.omenCatalysingExaltation, MATS.omenGreaterExaltation, MATS.perfectExalted],
          },
          {
            do: "Catalyse before listing (amulets don't display quality otherwise).",
          },
        ],
      },
    ],
    brick: "Miss = sell the +3 unfractured, most of the base comes back.",
  },

  focus_rathpith_gamble: {
    goal: "God-roll Rathpith Globe: both per-100-Mana damage/crit cultivated lines (mana-stacker caster shield) — reddit-reported ~600 div for a clean double; the video called mirror-tier for perfect ones.",
    shopping:
      "Cheapest CORRUPTED Rathpith Globes (it's a Vaal unique — cultivation only works on corrupted Vaal uniques; an UNCORRUPTED copy would be a wasted 3-div orb, tooltip-confirmed trap). A copy that already rolled one mana line is worth a premium.",
    marketCheck:
      "Vaal Cultivation Orb ~3 div — the orb IS the bet, and reddit reports 300+ div dry streaks. Price double-line Rathpiths first (trade link on the result leg); the ~600 div tail is what pays, mids only soften variance.",
    phases: [
      {
        title: "The gamble",
        steps: [
          {
            do: "Slam a Vaal Cultivation Orb on the CORRUPTED Rathpith.",
            why: "Randomly replaces 1–2 existing mods with cultivated-pool mods: Life Cost Efficiency (8–15%, nerfed in 0.5.0), Ailment Magnitude per 100 Life, or the chase — Damage per 100 Mana / Crit per 100 Mana (these replace the base per-100-Life lines). Repeat slams chase both mana lines.",
            mats: [MATS.vaalCultivation],
            warning: "On a NON-corrupted unique the orb instead transforms it into a random different corrupted unique of the class — documented 2-div+ losses. Corrupted Vaal unique ONLY.",
            onFail: "Bad cultivated roll → slam again or sell the husk; the orb cost dominates, so decide per copy how deep you gamble.",
            check: "Both “per 100 maximum Mana” lines present, NO “costs an additional % of maximum Life” line.",
          },
        ],
      },
      {
        title: "Polish + sell",
        steps: [
          {
            do: "Divine only a hit — it rerolls ALL variable values at once.",
            mats: [MATS.divine],
          },
          {
            do: "List against the double-line comparables; undercut the 2-div mids, hold true god rolls for offers.",
          },
        ],
      },
    ],
    brick: "Most slams brick — that's the shape of the trade. The tail (clean double-mana god roll) carried mirror-tier prices in the source video; the EV shown here prices only the visible floor, not the tail.",
  },

  boots_putrefaction: {
    goal: "35% Movement Speed + ES/res boots. 30% MS is the floor, 35% the chase.",
    shopping:
      "Cheap RARE boots ilvl 82+ (the 35% MS roll needs it) on an ES or ES-hybrid base — desecrated prefixes follow the base's defence type, and the money picks are flat/% ES. Not corrupted (trade filters that), not desecrated (eyeball). Existing mods are irrelevant — they all get wiped.",
    marketCheck: "~0.6 div all-in per try. One 35% MS sale pays the batch — confirm this week's asks first.",
    phases: [
      {
        title: "Prep (BEFORE the omen!)",
        steps: [
          {
            do: "Armourer's Scraps to 20% + Artificer sockets — on EVERY base first.",
            why: "Putrefaction corrupts. Quality and sockets can't be added after.",
            mats: [MATS.scrap, MATS.artificers],
            warning: "Quality + sockets FIRST. The omen corrupts. No exceptions.",
          },
        ],
      },
      {
        title: "Putrefy",
        steps: [
          {
            do: "Omen of Putrefaction active, slam a Preserved Rib.",
            why: "All mods become hidden desecrated reveals — six slots. Preserved tier is mandatory: Gnawed caps at ilvl 64 and fails on an 82+ base with “Item Level is too high”.",
            mats: [MATS.omenPutrefaction, MATS.preservedRib],
            check: "Item corrupted, all mods show as unrevealed.",
          },
        ],
      },
      {
        title: "Reveal discipline",
        steps: [
          {
            do: "Well of Souls, reveal one slot at a time — pick as you go.",
            why: "A sellable result = 35% MS + life or a solid defence flat + two 30%+ resistances.",
            pick: [
              "prefix: 35% Movement Speed (30% = sellable floor)",
              "prefix: flat Life (+100+)",
              "prefix: flat ES / Evasion (match the base)",
              "prefix: % ES / Evasion — multiplies the flat",
              "suffix: fire/cold/lightning res 30%+",
              "suffix: chaos res 15%+",
              "suffix: rarity > attributes (the rest is vendor filler)",
            ],
          },
          {
            do: "Do NOT settle for low MS early — hold out; take 30% only late in the reveals.",
            warning: "Settling early on 25% MS is the classic value leak. (Whether a taken mod blocks its family from later reveals is unconfirmed — test on a cheap base.)",
            onFail: "No MS ≥30 in the reveals → junk, sell for scraps, next base.",
          },
          {
            do: "Keep 1–2 Omens of Abyssal Echoes in reserve — activate ONE only when a good item hits a junk option set.",
            why: "Echoes rerolls the three offered options once (~0.25 div). Worth it late, when the item already carries 35% MS + good mods; a waste on a fresh 1-ex base. Never blanket every reveal — that triples the attempt cost.",
            mats: [MATS.omenAbyssalEchoes],
          },
          {
            do: "Good flat ES → Iron Rune; junk ES → res runes. List immediately, undercut over hours.",
          },
        ],
      },
    ],
    brick: "~1 in 3 hits 35% MS. Misses with 30% + res still sell 1–2 div. Same slot machine works on gloves/helmets/bodies.",
  },

  // Attack-build variant of the boots slot machine — same process, EV base + EV prefix targets.
  boots_putrefaction_ev: {
    goal: "35% Movement Speed + evasion/res boots for attack builds (Deadeye/Amazon meta). 30% MS is the floor.",
    shopping:
      "Cheap RARE boots ilvl 82+ on an EVASION or EV-hybrid base — desecrated prefixes follow the base's defence type. Not corrupted (trade filters that), not desecrated (eyeball). Existing mods are irrelevant — they all get wiped.",
    marketCheck: "~0.6 div all-in per try. Attack meta is the bigger ladder share — confirm this week's asks for 35% MS evasion boots first.",
    phases: [
      {
        title: "Prep (BEFORE the omen!)",
        steps: [
          {
            do: "Armourer's Scraps to 20% + Artificer sockets — on EVERY base first.",
            why: "Putrefaction corrupts. Quality and sockets can't be added after.",
            mats: [MATS.scrap, MATS.artificers],
            warning: "Quality + sockets FIRST. The omen corrupts. No exceptions.",
          },
        ],
      },
      {
        title: "Putrefy",
        steps: [
          {
            do: "Omen of Putrefaction active, slam a Preserved Rib.",
            why: "All mods become hidden desecrated reveals — six slots. Preserved tier is mandatory: Gnawed caps at ilvl 64 and fails on an 82+ base with “Item Level is too high”.",
            mats: [MATS.omenPutrefaction, MATS.preservedRib],
            check: "Item corrupted, all mods show as unrevealed.",
          },
        ],
      },
      {
        title: "Reveal discipline",
        steps: [
          {
            do: "Well of Souls, reveal one slot at a time — pick as you go.",
            why: "A sellable result = 35% MS + high evasion or life + two 30%+ resistances.",
            pick: [
              "prefix: 35% Movement Speed (30% = sellable floor)",
              "prefix: flat Evasion Rating (high roll)",
              "prefix: % Evasion — multiplies the flat",
              "prefix: flat Life (+100+)",
              "suffix: fire/cold/lightning res 30%+",
              "suffix: chaos res 15%+",
              "suffix: rarity > attributes (the rest is vendor filler)",
            ],
          },
          {
            do: "Do NOT settle for low MS early — hold out; take 30% only late in the reveals.",
            warning: "Settling early on 25% MS is the classic value leak. (Whether a taken mod blocks its family from later reveals is unconfirmed — test on a cheap base.)",
            onFail: "No MS ≥30 in the reveals → junk, sell for scraps, next base.",
          },
          {
            do: "Keep 1–2 Omens of Abyssal Echoes in reserve — activate ONE only when a good item hits a junk option set.",
            why: "Echoes rerolls the three offered options once (~0.25 div). Worth it late on an already-good item; a waste on a fresh 1-ex base.",
            mats: [MATS.omenAbyssalEchoes],
          },
          {
            do: "Socket res runes (evasion has no flat-scaling rune play like ES). List immediately, undercut over hours.",
          },
        ],
      },
    ],
    brick: "~1 in 3 hits 35% MS. Misses with 30% + res still sell 1–2 div to leveling attack builds.",
  },
};
