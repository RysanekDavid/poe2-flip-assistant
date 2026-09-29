import { MATS } from "./craftMaterials";
import type { CraftGuide } from "./craftRecipes";

/**
 * Fifth batch of craft playbooks (2026-09-30 expansion): Breach Ring mana stacker, fractured
 * Large-radius Time-Lost Sapphire, fractured +3 amulet with chaos Spirit, and the +4 amulet quality
 * tech (draft). Tiers/levels are the committed RePoE snapshot (game data 0.5.5b), item behaviour is
 * the entity catalog's game text, sources are in craftProvenanceData2.ts.
 */

// Shown as visible badges on the steps that lean on them.
const PRE_05_SOURCE =
  "The only step-by-step write-up (p2pah) is dated 2026-03-28 and names no patch; the 0.5.5 videos by SaVeQ and WesDesu cover the craft, but we have not reviewed their content.";
const RADIUS_FRACTURE =
  "Single secondary source (the Codex summary of Scorpius). RePoE lists 'Upgrades Radius to Large' as an ordinary spawnable prefix (JewelRadiusLargeSize), but an unfetched Reddit snippet says the radius can't be fractured; KB §6 also leaves the rare Time-Lost affix cap open. The source does not say whether the blocker was revealed; leaving it unrevealed is our choice — KB §2 confirms a desecrated mod counts, not that an unrevealed one behaves the same.";
const COMPILATION_ONLY = "Only the community compilation gives this step (the Mobalytics snippet stops at the essence).";
const QUALITY_PLUS4 =
  "KB conflict K4: that catalyst quality scales a '+N to Level of all Spell Skills' mod, and that ~34% turns +3 into +4, is claimed by the compilation; Forge's title claims +4 but shows no tooltip. K4 stays open — test on one cheap amulet before spending.";
const BREACH_CRYSTAL =
  "Essence of the Breach is a CORRUPTED essence (RePoE CurrencyCorruptedEssenceBreach) and Crystallisation omens act on a 'Perfect or Corrupted Essence' (item text), so the pairing should hold; the compilation's AMULET_004 does it, but no second source confirms it on this craft.";
const TWO_COLLARBONES = "The compilation desecrates twice; KB §5 allows ONE desecrated mod per item, so the second bone's outcome is unknown.";

export const GUIDES_5: Record<string, CraftGuide> = {
  ring_breach_mana_stacker: {
    goal: "Breach Ring for mana stackers: fractured rarity + T1 flat mana + (4–6)% maximum mana + desecrated minion damage + two resistances. 20–40 div in; p2pah values the three core prefixes at '30+ divines to several hundred' and finished rings at 200+ div.",
    shopping:
      "Rare Breach Ring, ilvl 75+ (T1 flat mana +165–179 is modifier level 75; RePoE), with a FRACTURED rarity SUFFIX (~5–10 div). The Breach Ring's '+20% to Maximum Quality' implicit is what allows 40% catalyst quality (KB §8).",
    marketCheck: "Price finished mana-stacker Breach Rings first. Budget ~300 chaos for the T1 mana alone, plus two Catalysing slams with 40% quality each.",
    phases: [
      {
        title: "T1 flat mana",
        steps: [
          {
            do: "Orbs of Annulment down to the fractured rarity + one mod, then Chaos Orbs until TRUE T1 flat mana (+165–179).",
            why: "A Chaos Orb removes one random mod and adds one (KB §1); the fractured rarity can't be removed, so each chaos swaps the one open mod. Lower tiers cut the resale — don't proceed on T2.",
            mats: [MATS.annul, MATS.chaos],
            check: "Fractured rarity suffix + T1 flat mana prefix, nothing else.",
            unverified: PRE_05_SOURCE,
          },
        ],
      },
      {
        title: "% mana via Crystallisation",
        steps: [
          {
            do: "Omen of Dextral Exaltation + Exalted Orb (a throwaway suffix), then Omen of Dextral Crystallisation + Perfect Essence of the Mind.",
            why: "The omen makes the Perfect essence 'remove only Suffix modifiers' (item text) — the fractured rarity can't go, so it eats the throwaway and adds (4–6)% increased maximum Mana, a prefix (poe2db + RePoE).",
            mats: [MATS.omenDextralExaltation, MATS.exalted, MATS.omenDextralCrystallisation, MATS.perfectEssenceMind],
            check: "Prefixes: T1 flat mana + % mana. Suffix: the fractured rarity only.",
          },
        ],
      },
      {
        title: "Amanamu minion damage",
        steps: [
          {
            do: "Omen of Sinistral Necromancy + Omen of the Liege active, slam a Preserved Collarbone, reveal at the Well of Souls.",
            why: "Sinistral = the last prefix; the Liege 'will guarantee a random Amanamu modifier' on jewellery (item text). RePoE's Amanamu ring prefixes are minion damage, Remnant effect and Ignite magnitude. Necromancy + Liege + bone is a documented triple (KB §4); p2pah: 'In-game, this interaction yields three Amunamu options'.",
            mats: [MATS.omenSinistralNecromancy, MATS.omenTheLiege, MATS.preservedCollarbone],
            pick: ["Minions deal (15–25)% increased Damage if you've Hit Recently"],
            warning: "Not Omen of the Blackblooded: it forces a Kurgal mod, not Amanamu (item text, https://poe2db.tw/us/Omen_of_the_Blackblooded).",
            unverified: PRE_05_SOURCE,
          },
          {
            do: "No minion damage among the options → Omen of Abyssal Echoes rerolls them once.",
            mats: [MATS.omenAbyssalEchoes],
            onFail: "Still missing → Omen of Light + Orb of Annulment strips only the desecrated mod; slam a fresh Collarbone.",
          },
        ],
      },
      {
        title: "Resistance slams",
        steps: [
          {
            do: "Elemental catalyst (Xoph's / Tul's / Esh's) to 40% quality, then Omen of Catalysing Exaltation + a Perfect Exalted Orb. Re-catalyse to 40% and repeat for the second suffix.",
            why: "Catalysing consumes ALL catalyst quality for a 7.5× tag weight at 40% (KB §4) — a bias, not a guarantee. Prefixes are full, so each slam lands a suffix. p2pah allows a Greater Exalt instead.",
            mats: [MATS.xophsCatalyst, MATS.omenCatalysingExaltation, MATS.perfectExalted],
            unverified: PRE_05_SOURCE,
          },
          {
            do: "A bad suffix → Omen of Dextral Annulment + Orb of Annulment, then re-slam.",
            why: "A plain Annulment removes a random mod — it can hit the T1 mana or the % mana. The Dextral omen keeps it on the suffixes (Sinistral/Dextral = prefix/suffix, KB §4); the fractured rarity can't be removed.",
            mats: [MATS.omenDextralAnnulment, MATS.annul],
          },
        ],
      },
    ],
    brick: "The chaos phase is a grind, not a brick. The real loss is an unlucky Annulment without the Dextral omen; after the % mana the ring already sells to mana stackers.",
  },

  jewel_timelost_fractured_radius: {
    goal: "Rare Time-Lost Sapphire with a FRACTURED 'Upgrades Radius to Large' + crit chance / crit damage / small- or notable-effect. ~9 div in → 50–60 div (Codex summary).",
    shopping:
      "Rare Time-Lost Sapphire with 'Upgrades Radius to Large' and exactly 3 mods (radius + two random), not fractured, corrupted or desecrated. ~25–40 ex each; buy three per expected lock.",
    marketCheck: "Price fractured Large-radius Sapphires with a crit or notable-effect line first — the fracture is the only expensive gate.",
    phases: [
      {
        title: "Blocker + fracture",
        steps: [
          {
            do: "Preserved Cranium on the 3-mod jewel — leave the desecrated mod UNREVEALED.",
            why: "The Cranium 'Desecrates a Rare Jewel' (item text). The desecrated mod counts toward the 4-mod minimum but can't be fractured (KB §2). Four-mod jewel instead? The source adds Omen of Dextral Necromancy there, keeping the desecration on the suffix side, away from the radius prefix.",
            mats: [MATS.preservedCranium],
            check: "Exactly 4 mods: Large radius + two random + the unrevealed desecrated mod.",
          },
          {
            do: "Fracturing Orb at exactly 4 mods.",
            why: "Needs a rare with at least 4 mods (item text); the blocker can't be picked → 1-in-3 to lock the radius (KB §2).",
            mats: [MATS.fracturing],
            onFail: "Wrong mod fractured → sell the jewel as-is, next base (the loss lives in hitRate).",
            unverified: RADIUS_FRACTURE,
          },
        ],
      },
      {
        title: "Strip and chaos",
        steps: [
          {
            do: "Orbs of Annulment down to the fractured radius + one mod, then Chaos Orbs.",
            why: "The fractured radius can't be removed, so each Chaos Orb swaps the one open mod (KB §1).",
            mats: [MATS.annul, MATS.chaos],
            pick: [
              "(3–7)% increased Critical Hit Chance",
              "(5–10)% increased Critical Damage Bonus",
              "(15–25)% increased Effect of Notable Passive Skills in Radius",
              "(15–25)% increased Effect of Small Passive Skills in Radius",
            ],
          },
          {
            do: "Optional: Divine Orb on a good roll.",
            why: "Rerolls every value within its tier (KB §1); the fractured mod is Divine-proof (KB §2).",
            mats: [MATS.divine],
          },
        ],
      },
    ],
    brick: "Two out of three bases miss the fracture and resell below cost; the Cranium is the sunk part (~1.6 div). A locked radius is never bricked — chaos just keeps swapping.",
  },

  amulet_plus3_spirit_chaos: {
    goal: "Rare amulet: FRACTURED +3 Projectile Skills + T1/T2 Spirit + global defences + two resistances + a desecrated prefix.",
    shopping:
      "Rare amulet with a FRACTURED +3 Projectile Skills, ilvl 75+ (+3 is modifier level 75; RePoE). The compilation prefers ilvl 80+ and a Solar Amulet for the 60-Spirit breakpoint (its implicit adds 10–15 Spirit).",
    marketCheck: "Price fractured +3 Projectile amulets with 43+ Spirit and resistances. The Spirit chaos loop is the variable cost.",
    phases: [
      {
        title: "Chaos the Spirit",
        steps: [
          {
            do: "Orbs of Annulment down to 2 mods (the fractured +3 + one), then Chaos Orbs until T1/T2 Spirit (+47–50 / +43–46).",
            why: "The fractured +3 can't be removed, so each chaos swaps the one open mod (KB §1). Spirit is a prefix, top tier modifier level 54 on amulets (RePoE).",
            mats: [MATS.annul, MATS.chaos],
            check: "Fractured +3 (suffix) + Spirit (prefix).",
          },
        ],
      },
      {
        title: "Suffix → global defences",
        steps: [
          {
            do: "Omen of Dextral Exaltation + a Greater Exalted Orb, then Omen of Dextral Crystallisation + Perfect Essence of Enhancement.",
            why: "Crystallisation works with a Perfect or Corrupted essence only (item text) — the compilation's 'Essence of Enhancement' must be the Perfect one. It removes only a suffix: the fractured +3 can't go, so it eats the new suffix and adds (20–30)% increased Global Armour, Evasion and Energy Shield, a prefix (RePoE EssenceGlobalDefences1).",
            mats: [MATS.omenDextralExaltation, MATS.greaterExalted, MATS.omenDextralCrystallisation, MATS.perfectEssenceEnhancement],
            check: "Prefixes: Spirit + global defences. Suffix: the fractured +3.",
          },
        ],
      },
      {
        title: "Resistances + last prefix",
        steps: [
          {
            do: "Elemental catalyst to 20% quality, then Omen of Dextral Exaltation + a Perfect Exalted Orb; repeat for the second suffix.",
            why: "Catalyst quality alone only inflates the numbers (KB §8); the weight bias needs Omen of Catalysing Exaltation, which the compilation doesn't list. A miss: Annulment and re-slam — a plain Annulment can also hit Spirit.",
            mats: [MATS.xophsCatalyst, MATS.omenDextralExaltation, MATS.perfectExalted, MATS.annul],
            unverified: COMPILATION_ONLY,
          },
          {
            do: "Fill the last prefix with the Collarbone loop: Preserved Collarbone, reveal with Omen of Abyssal Echoes; a miss → Omen of Light + Orb of Annulment strips only the desecrated mod, desecrate again.",
            why: "Only the prefix is open, so the bone lands there. Omen of Light makes the next Annulment remove only desecrated mods (item text).",
            mats: [MATS.preservedCollarbone, MATS.omenAbyssalEchoes, MATS.omenLight, MATS.annul],
            unverified: COMPILATION_ONLY,
          },
        ],
      },
    ],
    brick: "The Spirit loop can't brick (the +3 is fractured). The risk is an unprotected Annulment taking Spirit during the resistance phase.",
  },

  amulet_plus4_breach_quality: {
    goal: "DRAFT — rare amulet whose +3 Spell Skills shows as +4 through ~34% caster quality (Essence of the Breach raises the quality cap). Claimed 70–300 div.",
    shopping: "Cheap rare amulet with +3 to Level of all Spell Skills (~1 div) and an open suffix. Gold Amulet in the Forge of Exiles write-up.",
    marketCheck: "Do NOT scale this before one test amulet confirms the +4 in game — the value rests on an unconfirmed quality interaction.",
    phases: [
      {
        title: "Breach quality cap",
        steps: [
          {
            do: "Omen of Sinistral Exaltation + Exalted Orb (a throwaway PREFIX), then Omen of Sinistral Crystallisation + Essence of the Breach.",
            why: "Essence of the Breach 'Removes a random modifier and augments a Rare item with a new guaranteed modifier' (item text): '+20% to Maximum Quality', a prefix (RePoE EssenceBreach). With Sinistral Crystallisation it removes only a prefix, so the +3 (a suffix on amulets, RePoE) is safe and the throwaway goes. Forge of Exiles writes 'Perfect Essence of the Breach'; only 'Essence of the Breach' exists in the game data.",
            mats: [MATS.omenSinistralExaltation, MATS.exalted, MATS.omenSinistralCrystallisation, MATS.essenceOfTheBreach],
            warning: "Without the Sinistral omen the removal is random — it can take the +3 itself.",
            unverified: BREACH_CRYSTAL,
          },
          {
            do: "Sibilant (caster) Catalysts to ~34% quality.",
            why: "RePoE tags '+# to Level of all Spell Skills' caster + gem, the Sibilant tag. The compilation names 'River/Spell Catalyst' and Forge of Exiles 'Reaver Catalyst' (attack — the melee version).",
            mats: [MATS.sibilantCatalyst],
            check: "The +3 line reads +4 on the tooltip.",
            unverified: QUALITY_PLUS4,
          },
        ],
      },
      {
        title: "Fill",
        steps: [
          {
            do: "Preserved Collarbone (the compilation uses two) with Omen of Abyssal Echoes, then Omen of Greater Exaltation + a Perfect Exalted Orb, reveal at the Well of Souls.",
            mats: [MATS.preservedCollarbone, MATS.omenAbyssalEchoes, MATS.omenGreaterExaltation, MATS.perfectExalted],
            unverified: TWO_COLLARBONES,
          },
        ],
      },
    ],
    brick: "If the quality doesn't turn +3 into +4 the amulet is a plain +3 with extra mods — sellable, but nowhere near the claimed price.",
  },
};
