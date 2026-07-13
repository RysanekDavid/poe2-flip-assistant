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
      "RARE Time-Lost jewel (Ancient liquids only work on rare — regal a magic one) with 2 caster suffixes + max ONE junk prefix. Buy several — bases die on bad liquid rolls. Emerald = attack variant, same structure.",
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
              "Both option sets bad → annul the desecrated mod away (Omen of Sinistral/Dextral Annulment for its side + Orb of Annulment) and desecrate again with a fresh cranium.",
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
            pick: ["Adds # to # Physical Damage (best)", "high flat Fire/Cold/Lightning"],
          },
        ],
      },
      {
        title: "Fill + finish",
        steps: [
          {
            do: "Omen of Greater Exaltation + one Greater Exalted Orb (applies twice).",
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
      "MAGIC rings, T1 flat FIRE or LIGHTNING (never cold — you slam for cold; not phys — dilutes pool). Open suffix ~1 div. Buy 3–5, it's a numbers game.",
    marketCheck: "Weighted-sum filter on finished rings (flat total + rarity), cheapest ask = your sale price minus a div or two.",
    phases: [
      {
        title: "Prep",
        steps: [
          {
            do: "Open suffix? Perfect Orb of Augmentation first.",
            mats: [MATS.perfectAug],
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
            why: "The catalyst bias applies to BOTH exalts under greater exaltation.",
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
            onFail: "Junk reveal → Omen of Light re-reveal costs ~4–5 div, only worth it with filled suffixes.",
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
    shopping: "Rare amulet that already rolled the +levels mod. Stellar/gold base sells best; open prefix worth ~1 div extra.",
    marketCheck: "Check fractured +3 asks NOW. Under ~30 div → fracture EV collapses (1-in-3 hit must cover orb + base ×3).",
    phases: [
      {
        title: "Prep",
        steps: [
          {
            do: "Open prefix? Perfect Orb of Augmentation.",
            mats: [MATS.perfectAug],
          },
          {
            do: "Essence of Opulence → T1 rarity.",
            mats: [MATS.greaterEssenceOpulence],
          },
          {
            do: "Omen of Sinistral Necromancy + Preserved Collarbone → prefix desecration.",
            why: "The desecrated mod can't be fractured — it blocks one of three slots → clean 1-in-3 on the +3.",
            mats: [MATS.omenSinistralNecromancy, MATS.preservedCollarbone],
            check: "3 prefixes: +3 skills, desecrated mod, one more.",
          },
        ],
      },
      {
        title: "The fracture",
        steps: [
          {
            do: "Fracturing Orb.",
            why: "1-in-3 to lock the +3 forever → unbrickable craft base worth 40+ div bare.",
            mats: [MATS.fracturing],
            warning: "One fracture per item, ever. No re-rolls.",
            onFail: "Wrong mod fractured → sell as a normal +3, only the orb is lost.",
          },
        ],
      },
      {
        title: "Finish (paid from profit)",
        steps: [
          {
            do: "Fire/Lightning catalysts + Catalysing & Greater Exaltation omens + Perfect Exalted Orb.",
            why: "Perfect Exalted Orb has a modifier-level floor of 50 (Greater = 35). The guide runs fire/lightning catalysts here; the claimed cold-res tier leak is unverified — check poe2db before deviating.",
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

  boots_putrefaction: {
    goal: "35% Movement Speed + ES/res boots. 30% MS is the floor, 35% the chase.",
    shopping:
      "Cheap RARE boots ilvl 82+ (the 35% MS roll needs it), NOT corrupted, NOT desecrated (trade can't filter that — eyeball each). Mod count irrelevant.",
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
            do: "Omen of Putrefaction active, slam a Rib.",
            why: "All mods become hidden desecrated reveals — six slots, effectively nine prefix shots.",
            mats: [MATS.omenPutrefaction, MATS.gnawedRib],
            check: "Item corrupted, all mods show as unrevealed.",
          },
        ],
      },
      {
        title: "Reveal discipline",
        steps: [
          {
            do: "Well of Souls, reveal one slot at a time — pick as you go.",
            pick: [
              "prefix: 35% Movement Speed",
              "prefix: flat Energy Shield",
              "prefix: % Energy Shield",
              "suffix: ele res > chaos res > rarity",
            ],
          },
          {
            do: "Do NOT settle for low MS early — hold out; take 30% only late in the reveals.",
            warning: "Settling early on 25% MS is the classic value leak. (Whether a taken mod blocks its family from later reveals is unconfirmed — test on a cheap base.)",
            onFail: "No MS ≥30 in the reveals → junk, sell for scraps, next base.",
          },
          {
            do: "Good flat ES → Iron Rune; junk ES → res runes. List immediately, undercut over hours.",
          },
        ],
      },
    ],
    brick: "~1 in 3 hits 35% MS. Misses with 30% + res still sell 1–2 div. Same slot machine works on gloves/helmets/bodies.",
  },
};
