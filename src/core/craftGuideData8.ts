import { MATS } from "./craftMaterials";
import type { CraftGuide } from "./craftRecipes";

/**
 * Eighth batch of craft playbooks (2026-10-01 creator-video wave, weapons part 1): the bleed spear,
 * the cold-spell wand (both craft-to-use) and the ilvl-80 Perfect-orb wand lottery. Every step was
 * read off the creator's timestamped transcript (docs/kb/sources/transcripts/22–24) and checked
 * against the committed RePoE snapshot and entity catalog (game data 0.5.5b); an independent
 * fact-check (2026-10-01) corrected the extraction. Provenance: craftProvenanceData3.ts.
 */

// KB §7 (verified-secondary): a Greater essence keeps the magic item's mods, like a Regal Orb.
const ESSENCE_KEEPS = "The magic mods stay, like a Regal Orb (KB §7).";
const ECHOES = "Omen of Abyssal Echoes lets you reroll the three OFFERED options once (item text, KB §4) — a second set of options, not a better value.";

const SPEAR_HYBRID =
  "Creator footage only (bleed-spear video 2:20–2:46, 'three out of four crafts'). The hybrid is an ordinary spear prefix in RePoE (LocalIncreasedPhysicalDamagePercentAndAccuracyRating); how often a Sinistral reveal offers it is not documented.";
const SPEAR_INFUSER =
  "That this corruption changes nothing else is the creator's word ('a do-nothing corrupt', 4:14–5:10). The item text only says it exceeds maximum quality by up to 10% 'with a chance of Corrupting it'.";
const WAND_ONLY_PREFIX =
  "The creator calls increased Elemental Damage the Amanamu wand prefix to take (cold-wand video 18:05–19:20). RePoE lists THREE Amanamu wand prefixes (increased Elemental Damage, Spell Damage with Spells that cost Life, a Minion + Spell Damage hybrid), so the reveal may not always offer it.";
const ILVL80_GATES =
  "Tiers from the committed RePoE snapshot (Dueling Wand): +4 to Level of all Spell Skills is modifier level 78, T1 (105–119)% Spell Damage and T1 gain-as-extra are 80, every +5 element-spell suffix is 81. That the creator's ilvl-80 choice keeps later Whittles safe is his reasoning (lottery video 3:50–5:56).";
const INFUSER_ODDS =
  "Creator's estimate only: each 1% over maximum quality is a 5% chance to corrupt, about 1 base in 11–15 reaches 30% (lottery video 9:47–15:05). The item text says only 'with a chance of Corrupting it'.";

export const GUIDES_8: Record<string, CraftGuide> = {
  spear_bleed_abrasion_necro: {
    goal: "Bleed spear for your own character: +3/+4 melee levels, high % Physical, essence flat Physical and a desecrated % Physical + Accuracy hybrid prefix, then two exalted suffixes.",
    shopping:
      "MAGIC spear with +3 or more to Level of all Melee Skills (suffix) and 150%+ increased Physical Damage (prefix). The (135–154)% tier is modifier level 60 (RePoE); the creator buys 150+ so the item never needs a Divine (video 0:30–1:03).",
    marketCheck: "Craft to use: no margin is computed. Before spending, compare with buying a finished spear of the same damage on trade.",
    phases: [
      {
        title: "Flat physical (essence)",
        steps: [
          {
            do: "Greater Essence of Abrasion on the magic spear.",
            why: `'Upgrades a Magic item to a Rare item, adding a guaranteed modifier' (item text) — on a spear, flat Physical Damage (video 1:07–1:17). ${ESSENCE_KEEPS}`,
            mats: [MATS.greaterEssenceAbrasion],
            check: "Rare: % Physical + flat Physical prefixes, the +melee suffix.",
          },
        ],
      },
      {
        title: "Desecrated prefix",
        steps: [
          {
            do: "Omen of Sinistral Necromancy active, then a Preserved Jawbone (an Ancient Jawbone is the pricier option for a higher tier).",
            why: "Sinistral forces the desecration onto the prefix side (KB §4); a Jawbone 'Desecrates a Rare Weapon or Quiver' (item text). An Ancient bone sets a modifier-level-40 floor (KB §5).",
            mats: [MATS.omenSinistralNecromancy, MATS.preservedJawbone],
            check: "Three prefixes, one of them an unrevealed desecrated mod.",
          },
          {
            do: "Omen of Abyssal Echoes active, reveal at the Well of Souls.",
            why: `${ECHOES} Revealing before the suffix slams (the video slams first) lets you drop a base before paying for them.`,
            mats: [MATS.omenAbyssalEchoes],
            pick: ["(x–y)% increased Physical Damage + Accuracy Rating hybrid"],
            unverified: SPEAR_HYBRID,
            onFail: "No hybrid → Omen of Light + an Orb of Annulment removes only the desecrated mod (item text), then go back to the Sinistral desecration and repeat. When Lights cost more than a fresh base, buy a new base (video 2:49–2:58, 6:06–6:12).",
            retryFrom: { phase: "Desecrated prefix", step: 1 },
          },
        ],
      },
      {
        title: "Two suffixes",
        steps: [
          {
            do: "Omen of Greater Exaltation active, then a Greater Exalted Orb.",
            why: "Greater Exaltation: 'your next Exalted Orb will add two random modifiers' (item text). The three prefixes are full, so both land on suffixes. Floors: Greater 35; the creator's alternative, the Perfect orb, 50 (KB §1). The creator: these are the only two random rolls of the craft (video 1:52–2:09).",
            mats: [MATS.omenGreaterExaltation, MATS.greaterExalted],
            onFail: "Suffixes you can't use → the creator starts a new base rather than fixing them (video 2:09–2:17).",
          },
        ],
      },
      {
        title: "Finish (optional)",
        steps: [
          {
            do: "Blacksmith's Whetstones to 20% quality, then fill the sockets (the creator names Farrul's Rune of the Hunt or a bleed soul core, not a Greater Iron Rune).",
            why: "Quality raises the weapon's physical damage; a Whetstone improves 'a martial weapon' (item text).",
            mats: [MATS.whetstone],
          },
          {
            do: "Only on a finished spear: Vaal Blacksmith's Infusers above 20% quality.",
            why: "'Improves the quality of a Martial Weapon, exceeding maximum quality by up to 10% with a chance of Corrupting it … Can only be used on items at or above maximum quality' (item text).",
            mats: [MATS.vaalBlacksmithsInfuser],
            warning: "Corruption locks the spear: no more desecration or currency changes afterwards.",
            unverified: SPEAR_INFUSER,
          },
        ],
      },
    ],
    brick: "The essence and the desecration always land. The risk is the reveal loop (each retry costs an Omen of Light) and two unlucky suffixes.",
  },

  wand_cold_skills_sorcery_desecrate: {
    goal: "Cold-spell wand for your own character: + levels of Cold Spell Skills, gain-as-cold, essence Spell Damage and Amanamu's (74–89)% increased Elemental Damage prefix, then two exalted suffixes.",
    shopping:
      "MAGIC wand, ilvl 65+ (Amanamu's elemental prefix is modifier level 65, RePoE), with + to Level of all Cold Spell Skills (suffix) and a 'Gain …% of Damage as Extra Cold Damage' prefix — a mid tier is fine (video 16:39–17:11).",
    marketCheck: "Craft to use: no margin is computed. Compare with buying a finished wand first.",
    phases: [
      {
        title: "Spell damage (essence)",
        steps: [
          {
            do: "Greater Essence of Sorcery on the magic wand.",
            why: `Adds increased Spell Damage (prefix) and makes it rare (item text; the creator rolled a T3, video 17:39–17:56). ${ESSENCE_KEEPS} Cast speed, spell crit or +spell-level essences are the alternatives he names.`,
            mats: [MATS.greaterEssenceSorcery],
            check: "Rare: gain-as-cold + Spell Damage prefixes, the +cold levels suffix.",
          },
        ],
      },
      {
        title: "Amanamu elemental damage",
        steps: [
          {
            do: "Omen of the Liege + Omen of Sinistral Necromancy + Omen of Abyssal Echoes active, then a Preserved Jawbone; reveal at the Well of Souls.",
            why: `The Liege 'will guarantee a random Amanamu modifier' on a Weapon or Jewellery desecration (item text); Sinistral forces the prefix side (KB §4). ${ECHOES}`,
            mats: [MATS.omenTheLiege, MATS.omenSinistralNecromancy, MATS.omenAbyssalEchoes, MATS.preservedJawbone],
            pick: ["(74–89)% increased Elemental Damage"],
            unverified: WAND_ONLY_PREFIX,
            onFail: "Another Amanamu prefix → Omen of Light + an Orb of Annulment removes only the desecrated mod; go back to this step and repeat.",
            retryFrom: { phase: "Amanamu elemental damage", step: 1 },
          },
        ],
      },
      {
        title: "Suffixes",
        steps: [
          {
            do: "Two Exalted Orbs.",
            why: "The three prefixes are full, so both land on suffixes (the creator got spell crit and mana on kill, video 19:38–19:46).",
            mats: [MATS.exalted],
          },
        ],
      },
    ],
    brick: "Nothing bricks: the essence and the desecration always land, and the Light loop is optional.",
  },

  wand_ilvl80_perfect_orb_lottery: {
    goal: "A MAGIC ilvl-80 2-socket Dueling Wand carrying T1 (105–119)% increased Spell Damage — a fracture base for crafters. Spell crit, +4 spell levels and cast speed are the other hits.",
    shopping:
      "NORMAL exceptional 2-socket Dueling Wand at item level EXACTLY 80 (video 0:06–1:08). Fresh bases beat Annul + Augment on one base (video 1:10–2:01).",
    marketCheck: "The EV on this card is the live T1-spell-damage wand price against the base and the two Perfect orbs; the other hit kinds are upside it does not count.",
    phases: [
      {
        title: "Quality",
        steps: [
          {
            do: "Arcanist's Etchers to 20% quality.",
            why: "'Improves the quality of a wand, staff or sceptre' (item text). Needed before any Vaal infuser (it 'can only be used on items at or above maximum quality').",
            mats: [MATS.etcher],
          },
        ],
      },
      {
        title: "Perfect orbs",
        steps: [
          {
            do: "Perfect Orb of Transmutation, then a Perfect Orb of Augmentation.",
            why: "Both have a modifier-level-70 floor (KB §1), so on an ilvl-80 base each roll is a level 70–80 tier.",
            mats: [MATS.perfectTransmute, MATS.perfectAug],
            pick: ["(105–119)% increased Spell Damage", "(60–73)% increased Critical Hit Chance for Spells", "+4 to Level of all Spell Skills", "(29–35)% increased Cast Speed"],
            unverified: ILVL80_GATES,
            onFail: "No hit → the next base; a miss can go to the infuser branch below.",
          },
        ],
      },
      {
        title: "Misses: 30% quality (optional)",
        steps: [
          {
            do: "Vaal Arcanist's Infusers on a miss until 30% quality or it corrupts.",
            why: "'Exceeding maximum quality by up to 10% with a chance of Corrupting it' (item text). A 30%-quality ilvl-80 base is its own product for crafters.",
            mats: [MATS.vaalArcanistsInfuser],
            warning: "A corrupted wand can't be crafted further — it is a brick for this purpose.",
            unverified: INFUSER_ODDS,
          },
        ],
      },
    ],
    brick: "Most bases miss; they are cheap. A corrupted infuser miss is a total loss.",
  },
};
