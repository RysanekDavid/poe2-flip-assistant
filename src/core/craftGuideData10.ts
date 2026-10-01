import { MATS } from "./craftMaterials";
import type { CraftGuide } from "./craftRecipes";
import { UNREVEALED_BLOCKER } from "./craftGuideData9";

/**
 * Tenth batch of craft playbooks (2026-10-01 creator-video wave, part 3): the Gold Ring rarity ring
 * (craft-to-use), the fractured-armour Tower Shield, the Liquid Fear Emerald and the 35% MS energy
 * shield boots. Transcripts: docs/kb/sources/transcripts/26, 28–30. Provenance: craftProvenanceData3.ts.
 */

const ESSENCE_KEEPS = "The magic mods stay, like a Regal Orb (KB §7).";
const OPULENCE_PREFIX =
  "Creator-only (Gold Ring video 6:20–6:35): with the rarity on a SUFFIX the essence 'will not work'. What an essence does when its mod shares a family with an existing one is open in KB §7.";
const CATALYSING_GREATER = "Disputed (KB §4): with Greater Exaltation the Catalysing bias may apply to the FIRST added mod only — budget it that way.";
const SHIELD_INFUSER_ODDS = "Creator's estimate: 30% is about 1 in 8–9, so he stops at 24–26% when crafting for profit (shield video 0:59–1:33).";
const CHAOS_ON_FRACTURED = "Creator-only: Chaos Orbs on a rare whose only mod is fractured (shield video 5:44–6:00); KB §1 doesn't describe that case.";
const FEAR_REMOVAL =
  "Unverified: that the liquid removes one of the two SUFFIXES 50/50 is the creator's footage (Emerald video 3:08–3:25) and the likeliest model in KB §6 (a); GGG's notes say only that it replaces 'a random existing mod'.";
const FULL_PREFIX_SAFE =
  "Creator-only: he skips the Crystallisation omen because full prefixes can't be removed (boots video 9:47–9:58). The safe play is Omen of Dextral Crystallisation, whose text covers a Corrupted Essence; for the alloy that pairing is itself only creator-demonstrated.";
const RUNES_OVER_ASTRID = "Unverified: Perfect Iron Runes replace Astrid's Creativity in its socket; whether the second crafted mod survives that is not documented.";

export const GUIDES_10: Record<string, CraftGuide> = {
  ring_gold_rarity_opulence: {
    goal: "Gold Ring for your own character: implicit rarity + a rarity prefix + the essence's rarity suffix, a desecrated resistance suffix and two open prefixes.",
    shopping:
      "MAGIC Gold Ring (implicit (6–15)% increased Rarity of Items found, RePoE) with item rarity on the PREFIX (10%+) and a resistance you need (video 0:42–1:20).",
    marketCheck: "Craft to use: no margin is computed. Compare with a finished rarity ring on trade first.",
    phases: [
      {
        title: "Rarity suffix (essence)",
        steps: [
          {
            do: "Greater Essence of Opulence on the magic ring.",
            why: `Makes it rare with a guaranteed item rarity mod (item text; a suffix on rings, video 1:25–1:42). ${ESSENCE_KEEPS}`,
            mats: [MATS.greaterEssenceOpulence],
            warning: "The base's rarity must be the PREFIX.",
            unverified: OPULENCE_PREFIX,
            check: "Rare: rarity prefix, rarity suffix, the resistance suffix.",
          },
        ],
      },
      {
        title: "Resistance suffix (desecration)",
        steps: [
          {
            do: "Omen of Dextral Necromancy active, a Preserved Collarbone, then reveal with Omen of Abyssal Echoes active.",
            why: "Dextral forces the suffix side (KB §4); a Collarbone 'Desecrates a Rare Amulet, Ring or Belt' (item text). Echoes rerolls the offered options once (KB §4).",
            mats: [MATS.omenDextralNecromancy, MATS.preservedCollarbone, MATS.omenAbyssalEchoes],
            pick: ["+(x–y)% to all Elemental Resistances", "+(x–y)% to the resistance you lack"],
            onFail: "No good resistance → keep the best offered; the creator kept a T4 rather than spend more (video 3:58–4:02).",
          },
        ],
      },
      {
        title: "Prefixes (optional)",
        steps: [
          {
            do: "Tul's Catalysts to 20% quality, then Omen of Catalysing Exaltation + Omen of Greater Exaltation + a Greater Exalted Orb.",
            why: "Catalysing turns the Cold-tag quality into a 5× weight at 20% (KB §4, §8); Greater Exaltation adds two mods, both prefixes because the suffixes are full. The creator aimed at flat or % Cold damage (video 4:10–5:32).",
            mats: [MATS.tulsCatalyst, MATS.omenCatalysingExaltation, MATS.omenGreaterExaltation, MATS.greaterExalted],
            unverified: CATALYSING_GREATER,
          },
          {
            do: "Optional: a Chilling Flux when a Fire or Lightning resistance should be Cold.",
            why: "'Transforms all Fire and Lightning Resistance modifiers on an item to equivalent Cold Resistance modifiers' (item text; the creator's second ring, video 8:13–8:40).",
            mats: [MATS.chillingFlux],
          },
        ],
      },
    ],
    brick: "Nothing bricks: the essence and the desecration always land.",
  },

  shield_armour_fracture: {
    goal: "Tawhoan Tower Shield near 2,000 Armour: fractured T1 flat Armour, T1 % Armour and a desecrated % Armour hybrid, quality above 20% — for Shield Wall builds.",
    shopping:
      "NORMAL exceptional Tawhoan Tower Shield (the highest-armour shield base) with 2 augment sockets, ilvl 81 recommended (video 0:20–0:28, 1:57–2:08). T1 flat and T1 % Armour are modifier level 75 (RePoE).",
    marketCheck: "The EV prices a rare Tawhoan Tower Shield at 1,900+ Armour. The creator calls his own run unrepeatably lucky (video 0:29–0:55) — budget for misses.",
    phases: [
      {
        title: "Quality",
        steps: [
          {
            do: "Armourer's Scraps to 20%, then Vaal Armourer's Infusers — stop at 24–26%.",
            why: "The infuser 'can only be used on items at or above maximum quality' and goes 'up to 10%' over it 'with a chance of Corrupting it' (item text). Quality first: it scales the Armour.",
            mats: [MATS.scrap, MATS.vaalArmourersInfuser],
            warning: "A corrupted shield can't be crafted any further — that base is lost.",
            unverified: SHIELD_INFUSER_ODDS,
          },
        ],
      },
      {
        title: "T1 flat Armour",
        steps: [
          {
            do: "Perfect Orb of Transmutation.",
            why: "Modifier-level-70 floor (KB §1): on an ilvl-81 shield the flat Armour roll is T1 (+249–277) or T2.",
            mats: [MATS.perfectTransmute],
            pick: ["+(249–277) to Armour"],
            onFail: "No T1 flat → Orb of Annulment + Perfect Orb of Augmentation until it lands (the creator estimates ~8 Augs and ~7 Annuls at ilvl 81, video 2:30–3:44).",
          },
          {
            do: "A Perfect Orb of Augmentation fills the other affix.",
            mats: [MATS.perfectAug],
          },
        ],
      },
      {
        title: "Essence, blocker and fracture",
        steps: [
          {
            do: "Greater Essence of Enhancement.",
            why: `Adds '(68—79)% increased Armour, Evasion and Energy Shield' (poe2db) — insurance, so a fracture miss still leaves a decent shield. ${ESSENCE_KEEPS}`,
            mats: [MATS.greaterEssenceEnhancement],
          },
          {
            do: "A Preserved Rib, no omen.",
            why: "'Desecrates a Rare Armour' (item text): the 4th mod, a blocker the fracture can't pick (KB §2).",
            mats: [MATS.preservedRib],
            warning: "Ignore 'omen of sanctification' at 4:49 of the video: it is a misspeak. That omen makes the next Divine Orb sanctify the item (item text), and a Divine follows right here.",
            check: "Exactly 4 mods: flat Armour, essence %, one suffix, the desecrated mod.",
          },
          {
            do: "Divine Orbs until the flat Armour rolls high, then a Fracturing Orb (it needs at least 4 mods — the shield has exactly 4).",
            why: "Fractured values are Divine-proof (KB §2), so roll the value first. 1 in 3 to lock the flat Armour.",
            mats: [MATS.divine, MATS.fracturing],
            unverified: UNREVEALED_BLOCKER,
            onFail: "Another mod fractured → sell the shield as is or take a new base.",
          },
        ],
      },
      {
        title: "T1 % Armour",
        steps: [
          {
            do: "Orbs of Annulment down to the fractured flat Armour, then Chaos Orbs until T1 (101–110)% increased Armour.",
            why: "Take the plain T1 % Armour here, not the % Armour + Stun Threshold hybrid — the desecration below is the better route to the hybrid (video 5:51–6:00, 7:11–7:25).",
            mats: [MATS.annul, MATS.chaos],
            unverified: CHAOS_ON_FRACTURED,
          },
        ],
      },
      {
        title: "Desecrated hybrid",
        steps: [
          {
            do: "Omen of Sinistral Necromancy + Omen of Abyssal Echoes active, then an Ancient Rib; reveal.",
            why: "Sinistral = prefix (KB §4); Ancient bones floor the tier at modifier level 40 (KB §5).",
            mats: [MATS.omenSinistralNecromancy, MATS.omenAbyssalEchoes, MATS.ancientRib],
            pick: ["(39–42)% increased Armour + Stun Threshold (T1 hybrid)"],
            onFail: "No hybrid → Omen of Light + an Orb of Annulment removes only the desecrated mod; repeat this step.",
            retryFrom: { phase: "Desecrated hybrid", step: 1 },
          },
        ],
      },
      {
        title: "Sockets and suffixes",
        steps: [
          {
            do: "Two Iron Runes, upgraded with Masterwork Runes, then Divine Orbs for the final Armour.",
            why: "A Masterwork Rune 'upgrades' a tiered Rune in its socket (item text). The fractured flat Armour stays put while the rest is divined (KB §2).",
            mats: [MATS.ironRune, MATS.masterworkRune, MATS.divine],
          },
          {
            do: "Omen of Greater Exaltation + a Perfect Exalted Orb, then one more Perfect Exalted Orb.",
            why: "Prefixes are full, so the slams fill the suffixes; Perfect floor 50 (KB §1).",
            mats: [MATS.omenGreaterExaltation, MATS.perfectExalted],
          },
          {
            do: "Optional gamble: Omen of Sanctification + a Divine Orb.",
            why: "'Your next Divine Orb used on a Rare item will Sanctify it' (item text).",
            mats: [MATS.omenSanctification, MATS.divine],
            warning: "The creator's earlier sanctify attempt bricked that shield (video 5:32–5:39).",
          },
        ],
      },
    ],
    brick: "A corrupting infuser or a missed fracture are the losses; after the fracture the Light loop only costs currency.",
  },

  jewel_liquid_fear_4mod_budget: {
    goal: "Rare Emerald with three build mods plus the crafted attack Critical Damage Bonus suffix from Concentrated Liquid Fear.",
    shopping:
      "RARE Emerald (no other colour) with 4 mods: 3 you want — 2 prefixes and 1 suffix — and 1 junk suffix; no crafted mod, not corrupted (video 4:51–5:08, 7:25–7:39).",
    marketCheck: "The EV prices the finished jewel against the base and one liquid at a 50% hit. Meta-build mods cost more and sell for more.",
    phases: [
      {
        title: "Liquid Fear",
        steps: [
          {
            do: "Concentrated Liquid Fear on the Emerald.",
            why: "'Removes a random modifer and Augments a Rare Basic Jewel with a new guaranteed Crafted modifier' (item text). On an Emerald the crafted mod is a Critical Damage Bonus for Attack Damage SUFFIX (poe2db; a Sapphire gets spell crit damage, a Ruby warcry speed).",
            mats: [MATS.concentratedLiquidFear],
            warning: "Emerald only, and never a Time-Lost jewel: they take only the Ancient liquids (KB §6) — the creator's 'Time-Lost works as well' (4:04) contradicts the item text.",
            unverified: FEAR_REMOVAL,
            onFail: "The liquid removed your good suffix → the jewel still has 3 good mods; resell it and buy the next base.",
          },
        ],
      },
      {
        title: "Finish",
        steps: [
          {
            do: "Optional: Divine Orbs before you list it.",
            why: "Rerolls every value within its tier (KB §1).",
            mats: [MATS.divine],
          },
        ],
      },
    ],
    brick: "A lost 50/50 leaves a 3-good-mod jewel worth about what you paid for the base.",
  },

  boots_es_ms_spirit_fracture: {
    goal: "Energy shield boots for mana stackers: 35% Movement Speed, T1 mana and ES prefixes, a fractured T1 resistance/rarity/Intelligence suffix and two crafted suffixes (Spirit, socketed-augment effect).",
    shopping:
      "NORMAL exceptional ES boots at ilvl 82 — T1 35% Movement Speed needs 82 (KB §3). The creator buys Luxurious Slippers rather than the pricier Sekhema Sandals (video 0:03–1:53).",
    marketCheck: "The EV prices 35% MS Luxurious Slippers with mana against the base and the materials. The sanctify gamble at the end is not counted.",
    phases: [
      {
        title: "Keepers",
        steps: [
          {
            do: "Perfect Orb of Transmutation on the normal boots.",
            why: "Modifier-level-70 floor (KB §1).",
            mats: [MATS.perfectTransmute],
          },
          {
            do: "Perfect Orb of Augmentation; Orb of Annulment and Augment again until both mods are keepers (T1 resistance, Intelligence, 35% MS, T1 mana).",
            why: "Modifier-level-70 floor (KB §1); the creator loops until two keepers (video 2:25–4:31).",
            mats: [MATS.perfectAug, MATS.annul],
          },
          {
            do: "Divine the keepers before the fracture.",
            why: "Fractured values are Divine-proof (KB §2).",
            mats: [MATS.divine],
          },
        ],
      },
      {
        title: "Rare and fracture",
        steps: [
          {
            do: "A Perfect Regal Orb (no essence).",
            why: "Adds one mod at modifier level 50+ (Perfect Regal floor, KB §1).",
            mats: [MATS.perfectRegal],
          },
          {
            do: "Omen of Sinistral Necromancy + a Preserved Rib, then a Fracturing Orb (it needs at least 4 mods — the boots have exactly 4).",
            why: "The desecrated prefix is the blocker (KB §2); the creator accepts any useful fracture (video 5:27–6:12).",
            mats: [MATS.omenSinistralNecromancy, MATS.preservedRib, MATS.fracturing],
            unverified: UNREVEALED_BLOCKER,
            onFail: "A useless mod fractured → the next base.",
          },
        ],
      },
      {
        title: "Prefixes",
        steps: [
          {
            do: "Omen of Abyssal Echoes active, reveal the desecrated prefix: T1 mana, T1 ES or 35% MS.",
            why: "Any of the three is a keeper (video 6:42–6:54).",
            mats: [MATS.omenAbyssalEchoes],
            pick: ["35% increased Movement Speed", "T1 maximum Mana", "T1 Energy Shield"],
            onFail: "No keeper → Omen of Light + an Orb of Annulment removes only the desecrated mod; then go on to the next step with the desecration slot free.",
          },
          {
            do: "Orbs of Annulment on the unwanted NON-desecrated prefixes, then Omen of Sinistral Exaltation + Omen of Greater Exaltation + a Perfect Exalted Orb until the prefixes you want are in.",
            why: "The creator prefers Perfect slams to Chaos here (video 7:22–8:23, 11:33–12:58).",
            mats: [MATS.annul, MATS.omenSinistralExaltation, MATS.omenGreaterExaltation, MATS.perfectExalted],
            warning: "An Orb of Annulment picks a random mod: with a kept desecrated keeper on the item, each Annulment can take it too.",
          },
          {
            do: "Only when the first desecration was stripped: Omen of Sinistral Necromancy + Omen of Abyssal Echoes active, then an Ancient Rib for the missing prefix; reveal. With a kept desecrated keeper, Perfect-slam the third prefix instead (Omen of Sinistral Exaltation + a Perfect Exalted Orb).",
            why: "An Ancient bone floors the tier at modifier level 40 (KB §5); the creator's Ancient Rib round comes after the first desecration was annulled away (video 8:26–8:46, 14:28–17:24).",
            mats: [MATS.omenSinistralNecromancy, MATS.omenAbyssalEchoes, MATS.ancientRib, MATS.omenSinistralExaltation, MATS.perfectExalted],
            warning: "An item with a Desecrated modifier can't be desecrated again (one per item, KB §5).",
            pick: ["35% increased Movement Speed", "T1 maximum Mana", "T1 Energy Shield"],
            onFail: "Wrong prefix → Omen of Light + an Orb of Annulment removes only the desecrated mod; repeat this step.",
            retryFrom: { phase: "Prefixes", step: 3 },
          },
        ],
      },
      {
        title: "Crafted suffixes",
        steps: [
          {
            do: "Astrid's Creativity in a socket, then Omen of Greater Exaltation + an Exalted Orb to fill the suffixes.",
            why: "Astrid's Creativity: 'Can have 1 additional Crafted Modifiers' (poe2db) — room for both crafted suffixes below (KB §7).",
            mats: [MATS.astridsCreativity, MATS.omenGreaterExaltation, MATS.exalted],
          },
          {
            do: "Omen of Dextral Crystallisation + Essence of Horror, then a Mystic Alloy.",
            why: "Essence of Horror adds '60% increased effect of Socketed Augment Items' and the Mystic Alloy '+(10—15) to Spirit' on boots, each replacing a mod (poe2db; video 9:09–10:00).",
            mats: [MATS.omenDextralCrystallisation, MATS.essenceOfHorror, MATS.mysticAlloy],
            warning: "Either can remove a good unfractured suffix; the creator repaired that with Dextral Erasure or Whittling + Chaos and a Perfect Exalt (video 18:00–20:08).",
            unverified: FULL_PREFIX_SAFE,
          },
          {
            do: "Two Perfect Iron Runes and Armourer's Scraps to 20% quality.",
            mats: [MATS.perfectIronRune, MATS.scrap],
            unverified: RUNES_OVER_ASTRID,
          },
        ],
      },
      {
        title: "Sanctify (optional gamble)",
        steps: [
          {
            do: "Omen of Sanctification + a Divine Orb.",
            why: "'Your next Divine Orb used on a Rare item will Sanctify it' (item text). The creator's five pairs rolled Movement Speed 38/32/36/37/35 (video 22:29–23:10) — it can go down.",
            mats: [MATS.omenSanctification, MATS.divine],
          },
        ],
      },
    ],
    brick: "A useless fracture or a crafted suffix eating a good one are the losses; the prefixes always finish with enough slams and Lights.",
  },
};
