import { MATS } from "./craftMaterials";
import type { CraftGuide, GuidePhase } from "./craftRecipes";

/**
 * Seventh batch of craft playbooks (2026-09-30 second wave, jewellery): the life/resistance belt and
 * the prismatic attack ring, two compilation entries that share the opening — a resistance essence,
 * then a Dextral + boss-omen Collarbone for an elemental + chaos resistance hybrid. Tiers are the
 * committed RePoE snapshot (game data 0.5.5b); provenance lives in craftProvenanceData2.ts.
 */

// KB §7 (verified-secondary, 2026-09-30): a Greater essence keeps the magic item's mods, like a Regal.
const ESSENCE_KEEPS = "The magic mods stay, like a Regal Orb (KB §7).";

/*
 * Boss suffixes a Collarbone can reveal (RePoE 4.5.5.2, snapshot loader dump 2026-09-30; every desecrated
 * suffix below is required_level 65 and spawns with weight 1 on its tag — the snapshot carries 1/0 spawn
 * flags, not relative weights, so equal weights are an assumption):
 *   Heavy Belt, 4 per boss —
 *     Ulaman:  AbyssModArmourJewelleryUlamanSuffixLightningChaosResistance, …UlamanSuffixStrengthAndDexterity,
 *              AbyssModBootsAndBeltUlamanSuffixReducedPoisonDurationSelf, AbyssModBeltUlamanSuffixReducedSlowPotencySelfIfCharmedRecently
 *     Amanamu: AbyssModArmourJewelleryAmanamuSuffixFireChaosResistance, …AmanamuSuffixStrengthAndIntelligence,
 *              AbyssModBootsAndBeltAmanamuSuffixReducedIgniteDuration, AbyssModBeltAmanamuSuffixThornsBaseCriticalStrikeChance
 *     Kurgal:  AbyssModArmourJewelleryKurgalSuffixColdChaosResistance, …KurgalSuffixDexterityAndIntelligence,
 *              AbyssModBootsAndBeltKurgalSuffixReducedBleedDurationSelf, AbyssModBeltKurgalSuffixManaRegenerationRate
 *   Prismatic Ring, 4 / 5 / 6 —
 *     Ulaman:  the two ArmourJewellery ones + AbyssModRingAmuletUlamanSuffixSkillSpeed, …UlamanSuffixRecoverPercentMaxLifeOnKill
 *     Amanamu: the two ArmourJewellery ones + AbyssModRingAmuletAmanamuSuffixSkillEffectDuration,
 *              …AmanamuSuffixRemnantCollectionRange, AbyssModRingAmanamuSuffixLifeLeechAmount
 *     Kurgal:  the two ArmourJewellery ones + AbyssModRingAmuletKurgalSuffixExposureEffect, …KurgalSuffixCooldownRecoveryRate,
 *              …KurgalSuffixRecoverPercentMaxManaOnKill, AbyssModRingKurgalSuffixManaLeechAmount
 */
const BELT_BOSS =
  "Two open questions. KB conflict K6: the boss omens act on 'your next Weapon or Jewellery Desecration' (item text). A belt probably counts — by internal id (poe2db; RePoE Metadata/Items/Currency/…) the Preserved Collarbone is AbyssalBenchTicketJewellery ('Desecrates a Rare Amulet, Ring or Belt'), so a belt desecration is internally a Jewellery one — but that is still an inference. And the compilation's '3/4 chance' matches RePoE only if all three reveal options come from the chosen boss and assumes equal spawn weights: each boss has exactly four belt suffixes (its elemental + chaos hybrid, an attribute pair, a reduced-ailment-duration line and one more), so three options of four. That all-boss reading is the same unverified one the Sovereign crossbow rests on.";
const RING_BOSS =
  "The compilation copies the belt's '3/4 chance'. RePoE gives rings four Ulaman suffixes but five Amanamu and six Kurgal ones, so even if all three reveal options come from the chosen boss (unverified — the Sovereign crossbow's reading) and assuming equal spawn weights, the odds are 3/4 for Lightning (Sovereign), 3/5 for Fire (Liege) and 1/2 for Cold (Blackblooded).";
const FIRE_SLAM =
  "The compilation's second slam uses a Fire catalyst with no Catalysing omen. KB §8: catalyst quality alone only scales mod magnitude, never roll weights — the bias needs Omen of Catalysing Exaltation (KB §4), and the first slam consumed it with all the quality. As written this is an unbiased exalt onto the last prefix; a second Catalysing omen (not in the compilation's bill) is what KB §8 says would bias it.";

/** The shared opening: resistance essence, then the Dextral + boss-omen Collarbone hybrid. */
function resOpening(slot: "belt" | "ring"): GuidePhase[] {
  return [
    {
      title: "Second resistance",
      steps: [
        {
          do: "A Greater resistance essence of an element the base doesn't have — Thawing (cold) is priced; Insulation is fire, Grounding lightning.",
          why: `The compilation: 'Guarantee a second resistance mod'. Greater Essence of Thawing adds '+(31—35)% to Cold Resistance' on ${slot === "belt" ? "belts" : "rings"} (poe2db), RePoE's cold-res tier at modifier level 60. ${ESSENCE_KEEPS}`,
          mats: [MATS.greaterEssenceThawing],
          warning: "Never the base's own element: what an essence does when its mod shares a family with a mod already on the item is unverified (KB §7).",
          check: "Rare: life + two resistances.",
        },
      ],
    },
    {
      title: "Elemental + chaos hybrid (suffix)",
      steps: [
        {
          do: "Omen of Dextral Necromancy + the boss omen for the element you want (Sovereign = Lightning, Liege = Fire, Blackblooded = Cold) active, then a Preserved Collarbone; reveal.",
          why: "Dextral forces the suffix side (KB §4); a Collarbone 'Desecrates a Rare Amulet, Ring or Belt' and each omen 'will guarantee a random Ulaman / Amanamu / Kurgal modifier' (item text).",
          mats: [MATS.omenDextralNecromancy, MATS.omenTheSovereign, MATS.preservedCollarbone],
          pick: [
            "+(13–17)% to Lightning and Chaos Resistances (Ulaman)",
            "+(13–17)% to Fire and Chaos Resistances (Amanamu)",
            "+(13–17)% to Cold and Chaos Resistances (Kurgal)",
          ],
          unverified: slot === "belt" ? BELT_BOSS : RING_BOSS,
          onFail: "Attribute or utility line instead → keep it (the item still sells on life + two res), or strip it with Omen of Light + an Orb of Annulment and try again.",
          retryFrom: { phase: "Elemental + chaos hybrid (suffix)", step: 1 },
        },
      ],
    },
  ];
}

export const GUIDES_7: Record<string, CraftGuide> = {
  belt_life_res_desecrated_hybrid: {
    goal: "Rare belt: life + two resistances + a desecrated elemental + chaos resistance hybrid, optionally flat Armour.",
    shopping:
      "MAGIC belt with maximum Life (prefix) and a resistance (suffix), ilvl 65+ — the top belt life tier +(150–174) is modifier level 65 (RePoE); the compilation names no base or item level.",
    marketCheck: "Price rare belts with life + 60%+ resistances before buying the omens. The compilation rates it 'medium-high' difficulty.",
    phases: [
      ...resOpening("belt"),
      {
        title: "Armour (optional)",
        steps: [
          {
            do: "One Exalted Orb for a flat Armour prefix.",
            why: "The suffixes are full, so it lands on a prefix; Armour is one of several belt prefixes, so it is a slam, not a guarantee.",
            mats: [MATS.exalted],
          },
        ],
      },
    ],
    brick: "Nothing bricks: the essence always lands and a miss on the hybrid still leaves life + two resistances.",
  },

  ring_prismatic_catalyst_attack: {
    goal: "Rare Prismatic Ring: life + two resistances + a desecrated elemental + chaos hybrid + flat Physical and flat Fire damage to Attacks.",
    shopping:
      "MAGIC Prismatic Ring (implicit +(7–10)% to all Elemental Resistances, RePoE; the compilation says '+10') with Life and a resistance, ilvl 75+ — the top flat Physical and Fire to Attacks tiers are modifier level 75 (RePoE AddedPhysicalDamage9 / AddedFireDamage9).",
    marketCheck: "Price attack rings with flat phys + life + resistances first. The compilation rates it 'high' difficulty.",
    phases: [
      ...resOpening("ring"),
      {
        title: "Catalysed prefixes",
        steps: [
          {
            do: "Uul-Netol's Catalysts to 20% quality, then Omen of Catalysing Exaltation + a Greater Exalted Orb.",
            why: "The omen consumes all the quality into a tag-weight bias: 5× at 20% on a ring (KB §4, §8) — toward Physical mods, i.e. flat Physical to Attacks. A weight, not a guarantee. The suffixes are full, so the exalt lands on a prefix.",
            mats: [MATS.uulNetolsCatalyst, MATS.omenCatalysingExaltation, MATS.greaterExalted],
            check: "Flat Physical to Attacks on the ring (top tier Adds (12–19) to (22–32), modifier level 75).",
          },
          {
            do: "Xoph's Catalysts to 20% quality, then a Greater Exalted Orb on the last prefix.",
            why: "The compilation's route to flat Fire to Attacks (top tier Adds (25–29) to (37–45)).",
            mats: [MATS.xophsCatalyst, MATS.greaterExalted],
            unverified: FIRE_SLAM,
          },
        ],
      },
    ],
    brick: "The two slams are the risk: each can miss the damage line. A ring with life, two resistances and the hybrid still sells as a defensive ring.",
  },
};
