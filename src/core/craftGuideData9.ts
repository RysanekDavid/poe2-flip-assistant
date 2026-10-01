import { MATS } from "./craftMaterials";
import type { CraftGuide } from "./craftRecipes";

/**
 * Ninth batch of craft playbooks (2026-10-01 creator-video wave, the alloy crafts): the +4 wand with
 * two alloys and a fracture, and the Dusk Ring with four flat attack prefixes. Both lean on Omen of
 * Crystallisation steering an ALLOY — demonstrated by creators and players, not in the item text —
 * so those steps carry badges. Transcripts: docs/kb/sources/transcripts/25, 27. Provenance:
 * craftProvenanceData3.ts.
 */

/** Forum 3949532 + three creator demos; the omen's own text names only Perfect or Corrupted Essences. */
const ALLOY_CRYSTAL =
  "Creator/player-demonstrated, not documented: Omen of Crystallisation's text names only 'your next Perfect or Corrupted Essence', yet players and creators steer alloys with it (forum thread 3949532; this video 0:51–1:20; the Dusk Ring video 17:12–17:21). GGG may treat it as a bug and change it.";
const OMEN_ORDER =
  "Activate the Crystallisation omen only AFTER the Greater essence: a Crystallisation omen is consumed by any essence, Greater included (forum thread 3851940).";
/** Shared with the other fracture recipes of this wave (craftGuideData10.ts). */
export const UNREVEALED_BLOCKER =
  "The blocker is still UNREVEALED when the creators fracture (four 2026 videos). KB §2 confirms a desecrated mod counts toward the 4, not explicitly an unrevealed one.";
const CRAFTED_FRACTURE = `Creator-only: the fracture landing on a crafted alloy mod (+4 wand video 1:54–2:47, 15:30–15:43); KB §2 does not say whether crafted mods can be fractured. ${UNREVEALED_BLOCKER}`;
const ALLOY_MANA_CLASH =
  "In the creator's own simulation the Celestial Alloy was refused when the exalted prefix was maximum Mana (+4 wand video 24:19–24:30) — presumably the alloy's mana line shares that family. Creator-only.";
const DUSK_BREACH =
  "Creator-only: Omen of Dextral Crystallisation + Essence of the Breach on a Dusk Ring (video 11:33–11:52). Essence of the Breach is a Corrupted Essence, so the omen text covers it; the 40% catalyst cap with the Breach mod on a non-Breach ring is the creator's.";
const DUSK_WHITTLE =
  "That the Breach '+20% maximum quality' mod is the lowest-level mod, and that 40% quality survives losing it, are not in the KB — always read the Whittling preview (KB §4).";
const DUSK_INFUSER = "The creator says a Vaal Catalysing Infuser 'never corrupts' here (video 12:30–12:49); the item text says only 'with a chance of Corrupting it'.";

export const GUIDES_9: Record<string, CraftGuide> = {
  wand_plus4_alloy_fracture: {
    goal: "Rare ilvl-80 wand: +4 to Level of all Spell Skills, two crafted alloy mods (cast speed + gain-as-cold suffix, +1 spell levels + mana prefix) and a desecrated blocker — fractured. Sell right after the fracture, or finish it for yourself.",
    shopping:
      "MAGIC 2-socket wand at item level 80 with ONLY +4 to Level of all Spell Skills (suffix) and an open prefix (video 0:31–0:40). The ilvl-80 wand lottery recipe makes these bases.",
    marketCheck: "The EV on this card prices the best outcome — a FRACTURED +4 — at a 1-in-3 hit. The other two fractures (either alloy mod) still sell; the card does not count them.",
    phases: [
      {
        title: "Essence and Astrid",
        steps: [
          {
            do: "Greater Essence of Sorcery, then Astrid's Creativity in an augment socket.",
            why: "Sorcery adds a Spell Damage PREFIX, so a fracture miss is never stuck on a suffix (video 22:41–23:21). Astrid's Creativity: 'Can have 1 additional Crafted Modifiers' (poe2db) — the item may now hold the essence/alloy crafted mods side by side, past the one-crafted-mod rule (KB §7).",
            mats: [MATS.greaterEssenceSorcery, MATS.astridsCreativity],
            check: "Rare: Spell Damage prefix + the +4 suffix, Astrid's Creativity socketed.",
          },
        ],
      },
      {
        title: "Two alloys",
        steps: [
          {
            do: "Omen of Sinistral Crystallisation active, then a Transcendent Alloy.",
            why: "The omen removes only a prefix — the essence's Spell Damage — and the Transcendent Alloy adds '(26—31)% increased Cast Speed' + '(7—11)% Elemental Damage as Extra Cold', a crafted SUFFIX on wands (fact-check against poe2db, 2026-10-01).",
            mats: [MATS.omenSinistralCrystallisation, MATS.transcendentAlloy],
            warning: OMEN_ORDER,
            unverified: ALLOY_CRYSTAL,
            check: "Suffixes: +4 and the crafted cast speed. No prefix.",
          },
          {
            do: "Omen of Sinistral Exaltation + an Exalted Orb for a throwaway prefix, then Omen of Sinistral Crystallisation + a Celestial Alloy.",
            why: "The video only says 'add a prefix' (1:05); Sinistral Exaltation forces that side (KB §4). The Celestial Alloy then replaces it with '+(142—188) to maximum Mana and +1 to Level of all Spell Skills', a crafted PREFIX on wands.",
            mats: [MATS.omenSinistralExaltation, MATS.exalted, MATS.omenSinistralCrystallisation, MATS.celestialAlloy],
            warning: ALLOY_MANA_CLASH,
            unverified: ALLOY_CRYSTAL,
            check: "Prefix: crafted +1 spells / mana. Suffixes: +4 and crafted cast speed.",
          },
        ],
      },
      {
        title: "Blocker and fracture",
        steps: [
          {
            do: "Omen of Sinistral Necromancy + Omen of the Liege active, then a Preserved Jawbone — leave it unrevealed for now.",
            why: "A desecrated mod can't be fractured but counts toward the minimum (KB §2), so the fracture picks 1 of the 3 others. The Liege makes the later reveal an Amanamu mod (item text); never a Gnawed Jawbone above ilvl 64 (KB §5).",
            mats: [MATS.omenSinistralNecromancy, MATS.omenTheLiege, MATS.preservedJawbone],
            check: "Exactly 4 mods: +4, crafted cast speed, crafted +1/mana, the unrevealed desecrated prefix.",
          },
          {
            do: "Optional Divine, then a Fracturing Orb (the item needs at least 4 mods — it has exactly 4).",
            why: "1 in 3 for each of +4, the +1/mana alloy mod and the cast-speed alloy mod. Fractured values are Divine-proof (KB §2), so divine first if you will.",
            mats: [MATS.fracturing],
            unverified: CRAFTED_FRACTURE,
            onFail: "Any fracture sells — this is the profitable stop. To finish it instead, read on.",
          },
        ],
      },
      {
        title: "Finish (for your own use)",
        steps: [
          {
            do: "Omen of Abyssal Echoes active, reveal at the Well of Souls.",
            why: "Amanamu's (74–89)% increased Elemental Damage blocks the fire/lightning/chaos % prefixes from the last slam (video 2:50–3:06).",
            mats: [MATS.omenAbyssalEchoes],
            pick: ["(74–89)% increased Elemental Damage"],
          },
          {
            do: "A Perfect Exalted Orb for the last prefix.",
            why: "At ilvl 80 the eligible prefixes are T1–T3 Spell Damage, the T1 Spell Damage + Mana hybrid and T1/T2 gain-as-extra (video 3:16–4:16).",
            mats: [MATS.perfectExalted],
            warning: "A Whittle later removes the lowest-level mod — read the preview; the creator's Whittle math is the in-game level of each mod (6:27–7:43).",
          },
        ],
      },
    ],
    brick: "Nothing bricks: every fracture outcome sells. The Light/Jawbone loops in the finish are optional spending.",
  },

  ring_dusk_four_flat: {
    goal: "Dusk Ring with four flat attack damage prefixes (one fractured T1), Breach-quality and catalyst-biased slams, plus attack speed — for Twister, Flicker and Ice Shot builds.",
    shopping:
      "RARE Dusk Ring, ilvl 79+ (every T1 flat-to-Attacks prefix is modifier level 75, RePoE; 75–78 slims the pool). Dusk Ring: '+1 Prefix Modifier allowed / -1 Suffix Modifier allowed' (item text). NOT a Gloam Ring (the video's 'gloom ring', 6:13–6:26) — that is −1 prefix / +1 suffix (RePoE).",
    marketCheck: "The EV prices a finished four-prefix Dusk Ring. Most cost sits in the fracture (1 in 3 per base) and the desecration loop — budget for misses.",
    phases: [
      {
        title: "T1 flat to fracture",
        steps: [
          {
            do: "Orbs of Annulment down to one mod, then Chaos Orbs until any T1 flat Fire, Cold or Lightning to Attacks (flat Physical is the fallback).",
            why: "A Chaos Orb swaps one mod (KB §1). Lock the rarest flat: the creator reads Fire/Cold/Lightning as half the weight of Physical (video 3:28–4:23).",
            mats: [MATS.annul, MATS.chaos],
            check: "One T1 flat-to-Attacks prefix.",
          },
          {
            do: "Omen of Sinistral Exaltation + Omen of Greater Exaltation + an Exalted Orb, then a Preserved Collarbone.",
            why: "Two more prefixes (KB §4), then an unrevealed desecrated mod as the 4th — the fracture's blocker (KB §2). A Gnawed bone fails above ilvl 64 (KB §5).",
            mats: [MATS.omenSinistralExaltation, MATS.omenGreaterExaltation, MATS.exalted, MATS.preservedCollarbone],
            check: "Exactly 4 mods: three prefixes + the desecrated one.",
          },
          {
            do: "Fracturing Orb (needs at least 4 mods — the ring has exactly 4).",
            why: "1 in 3 to lock the T1 flat (KB §2). The creator missed 6 in a row before 2 of 8 hit (video 7:36–8:45).",
            mats: [MATS.fracturing],
            unverified: UNREVEALED_BLOCKER,
            onFail: "Wrong mod fractured → the next ring, back to the first step of this phase.",
            retryFrom: { phase: "T1 flat to fracture", step: 1 },
          },
        ],
      },
      {
        title: "Second flat and Breach quality",
        steps: [
          {
            do: "Orbs of Annulment down to the fractured mod, then Chaos Orbs for a second T1 flat (Cold or Lightning).",
            why: "The fractured flat can't be removed, so each Chaos works on the open slots (creator, video 9:05–11:16).",
            mats: [MATS.annul, MATS.chaos],
            unverified: "Creator-only: Chaos on a rare whose only mod is fractured (KB §1 doesn't describe that case).",
          },
          {
            do: "Omen of Dextral Exaltation + an Exalted Orb (a throwaway suffix), then Omen of Dextral Crystallisation + Essence of the Breach.",
            why: "The video says 'add a random suffix' (11:28); Dextral Exaltation forces it (KB §4). The omen makes the essence remove only a suffix, and the Breach essence adds '+20% maximum quality'.",
            mats: [MATS.omenDextralExaltation, MATS.exalted, MATS.omenDextralCrystallisation, MATS.essenceOfTheBreach],
            unverified: DUSK_BREACH,
          },
        ],
      },
      {
        title: "Catalysed third flat",
        steps: [
          {
            do: "Reaver Catalysts to 40%, then Omen of Sinistral Exaltation + Omen of Catalysing Exaltation + a Perfect Exalted Orb.",
            why: "Reaver 'enhances Attack modifiers' (item text); Catalysing turns all the quality into a tag-weight bias, 7.5× at 40% (KB §4, §8) — a bias toward attack prefixes, not a guarantee.",
            mats: [MATS.reaverCatalyst, MATS.omenSinistralExaltation, MATS.omenCatalysingExaltation, MATS.perfectExalted],
          },
          {
            do: "Reaver Catalysts back to 40%; optionally one Vaal Catalysing Infuser after that.",
            why: "Quality scales matching-tag mod magnitude (KB §8). The infuser 'can only be used on items at or above maximum quality' (item text).",
            mats: [MATS.reaverCatalyst, MATS.vaalCatalysingInfuser],
            unverified: DUSK_INFUSER,
          },
        ],
      },
      {
        title: "Whittle the Breach mod",
        steps: [
          {
            do: "Omen of Whittling + a Chaos Orb — only if the hover preview targets the Breach quality mod.",
            why: "Whittling removes the lowest-LEVEL mod and the Chaos adds one (KB §4); the creator got a mana-regen suffix (video 12:49–13:07).",
            mats: [MATS.omenWhittling, MATS.chaos],
            unverified: DUSK_WHITTLE,
            onFail: "The Chaos added a PREFIX: the four prefix slots are now full, so the desecrated 4th flat below has no room. No source shows a fix — sell it as a three-flat ring or stop here.",
          },
        ],
      },
      {
        title: "Desecrated 4th flat",
        steps: [
          {
            do: "Omen of Sinistral Necromancy + Omen of Abyssal Echoes active, then an Ancient Collarbone; reveal.",
            why: "Sinistral forces the last prefix slot (KB §4); an Ancient bone floors the tier at modifier level 40 (KB §5). The creator settled for a T2 (video 13:10–16:41).",
            mats: [MATS.omenSinistralNecromancy, MATS.omenAbyssalEchoes, MATS.ancientCollarbone],
            pick: ["Adds (x–y) to (x–y) Cold Damage to Attacks", "Adds (x–y) to (x–y) Fire Damage to Attacks", "Adds (x–y) to (x–y) Lightning Damage to Attacks", "Adds (x–y) to (x–y) Physical Damage to Attacks"],
            onFail: "No usable flat → Omen of Light + an Orb of Annulment removes only the desecrated mod; repeat this step (the creator needed ~10 tries).",
            retryFrom: { phase: "Desecrated 4th flat", step: 1 },
          },
        ],
      },
      {
        title: "Attack speed",
        steps: [
          {
            do: "Omen of Dextral Crystallisation + a Swift Alloy, then a Perfect Exalted Orb for the last suffix.",
            why: "The Swift Alloy replaces the removed suffix with '(7—9)% increased Attack Speed' on rings (fact-check, poe2db).",
            mats: [MATS.omenDextralCrystallisation, MATS.swiftAlloy, MATS.perfectExalted],
            unverified: ALLOY_CRYSTAL,
          },
        ],
      },
    ],
    brick: "Missed fractures are the cost: each miss leaves a cheap three-prefix ring. After the fracture every step either lands or loops on Omens of Light.",
  },
};
