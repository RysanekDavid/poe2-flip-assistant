import { MATS } from "./craftMaterials";
import type { CraftGuide, GuidePhase } from "./craftRecipes";

/**
 * Fourth batch of craft playbooks (2026-09-30 expansion): Tiara ES helmet, Vile Robe essence flips,
 * putrefaction quiver, Sovereign ballista crossbow. Same tight-prose contract as craftGuideData*.ts.
 * Tiers and item levels are the committed RePoE snapshot (game data 0.5.5b); item behaviour quotes
 * are the entity catalog's game text; sources are listed in craftProvenanceData2.ts.
 */

// KB §7 (verified-secondary, 2026-09-30): a Greater essence keeps the magic item's mods, like a Regal.
const ESSENCE_KEEPS = "The magic mods stay, like a Regal Orb (KB §7).";

// Shown as visible badges: each is a KB-open or single-source claim the craft leans on.
const DEXTRAL_GREATER =
  "Dextral Exaltation + Greater Exaltation on one exalt = two suffixes is KB §4 medium confidence (a 2-1 vote); the Tools rule for the pair is unverified.";
const BALLISTA_POOL =
  "The compilation and the Codex summary say this guarantees the Ballista Totem. RePoE lists TWO Ulaman prefixes a crossbow can roll (AbyssModCrossbowUlamanPrefixMaximumRangedAttackTotems and AbyssModGenWeaponUlamanPrefixLightningPenetration). If the reveal shows three Ulaman options, as the sources imply, the ballista is almost always among them — but neither the three-Ulaman-options behaviour nor Sovereign + Necromancy stacking (the Liege triple in KB §4) is verified.";
const PUTREFY_COUNT =
  "Mod count conflict: the compilation wants the quiver pre-filled to 6 mods; the omen text says 'up to 6 Unrevealed modifiers', and docs/kb/creator-videos.md (S10) says all 3 prefixes + 3 suffixes regardless of the starting count. A 6-mod base costs the same, so buy one.";
const VAAL_NO_BRICK =
  "The compilation says the helmet 'CANNOT brick' under Vaal Infusers; the infuser's item text says it can corrupt the item, and the KB has no corruption outcome table (KB §10).";

type RobeHeadline = "spirit" | "es";

const ROBE_PICKS: Record<RobeHeadline, string[]> = {
  spirit: [
    "prefix: high flat Energy Shield — up to +(91–96), modifier level 79 (the compilation's 'best')",
    "prefix: hybrid (39–42)% increased Energy Shield + (26–30) maximum Energy Shield",
    "prefix: hybrid (39–42)% increased Energy Shield + (42–49) maximum Life",
    "suffix (only if one was open): another resistance",
  ],
  es: [
    "prefix: Spirit — the jackpot, up to +(57–61) at modifier level 78",
    "prefix: hybrid (39–42)% increased Energy Shield + (26–30) maximum Energy Shield",
    "prefix: flat Life (acceptable per the compilation)",
  ],
};

/** Essence + resistance phases, identical for both Vile Robe flips. */
function robeOpeningPhases(headlineLabel: string): GuidePhase[] {
  return [
    {
      title: "Essence → rare",
      steps: [
        {
          do: "Greater Essence of Enhancement on the magic robe.",
          why: `Upgrades it to rare with '(68–79)% increased Armour, Evasion and Energy Shield' (poe2db). On a pure-ES robe the local %ES tier with exactly that range is modifier level 54 (RePoE). ${ESSENCE_KEEPS}`,
          mats: [MATS.greaterEssenceEnhancement],
          check: `Rare robe: ${headlineLabel} + (68–79)% ES.`,
        },
      ],
    },
    {
      title: "Resistance suffixes",
      steps: [
        {
          do: "Omen of Dextral Exaltation + Omen of Greater Exaltation active, then one Greater Exalted Orb.",
          why: "Two suffixes from one exalt, modifier-level 35 floor (KB §1). T1 resistances need ilvl 82, T2 ilvl 71 (KB §3).",
          mats: [MATS.omenDextralExaltation, MATS.omenGreaterExaltation, MATS.greaterExalted],
          unverified: DEXTRAL_GREATER,
        },
      ],
    },
  ];
}

/** The two Vile Robe flips share every step; only the headline mod and the reveal targets differ. */
function vileRobeGuide(headline: RobeHeadline): CraftGuide {
  const isSpirit = headline === "spirit";
  const buy = isSpirit ? "50+ Spirit" : "T1 flat ES (+91–96, so the robe is ilvl 79+)";
  return {
    goal: `Rare Vile Robe: ${isSpirit ? "50+ Spirit" : "T1 flat ES"} + the essence's %ES + two resistances + a desecrated prefix. 10–15 ex in → 2–4 div typical.`,
    shopping: `MAGIC Vile Robe (drop level 65, 171 base ES; RePoE) with ${buy}, ~10–15 ex. The compilation calls it "Veil Robe" — the base is Vile Robe.`,
    marketCheck: "Price finished rare Vile Robes with the same headline + 60%+ resistances. The Codex summary puts sales at 2–4 div; the compilation says 2–8.",
    phases: [...robeOpeningPhases(isSpirit ? "Spirit" : "T1 flat ES"), ...robeFinishPhases(headline)],
    brick: "No real brick: every step adds value to a 10–15 ex base. The spread is how many resistances land and how good the desecrated prefix is.",
  };
}

/** Desecration + sockets phases; the reveal targets depend on the headline the robe was bought for. */
function robeFinishPhases(headline: RobeHeadline): GuidePhase[] {
  return [
    {
      title: "Desecrated prefix",
      steps: [
        {
          do: "Preserved Rib, then reveal at the Well of Souls.",
          why: "The compilation adds the desecrated mod as a PREFIX: with the suffixes full the rib has only the prefix side left. If a suffix is still open it can land there instead — Omen of Sinistral Necromancy forces the prefix (not in the source's bill). Rib = armour; Gnawed fails above ilvl 64 (KB §5).",
          mats: [MATS.preservedRib],
          pick: ROBE_PICKS[headline],
        },
        {
          do: "Junk options on an otherwise good robe → Omen of Abyssal Echoes rerolls the three options once.",
          why: "Insurance, not a guarantee (KB §4).",
          mats: [MATS.omenAbyssalEchoes],
          onFail: "No usable prefix → list it anyway; the headline + essence ES + resistances are the value.",
        },
      ],
    },
    {
      title: "Sockets, quality, list",
      steps: [
        {
          do: "Two Artificer's Orbs + Greater Iron Runes, Armourer's Scraps to 20% quality, then list.",
          why: "More ES on the tooltip buyers filter on. The Codex summary corrupts with a Vaal only after profit is locked in — skip it on a flip.",
          mats: [MATS.artificers, MATS.scrap],
        },
      ],
    },
  ];
}

export const GUIDES_4: Record<string, CraftGuide> = {
  helmet_tiara_es: {
    goal: "Rare Ancestral Tiara: T1 flat ES + the essence's (68–79)% ES + a desecrated hybrid %ES/Life + resistances. 300+ ES caster helmet.",
    shopping:
      "WHITE (normal) Ancestral Tiara — drop level 80, 109 base ES (RePoE), the base the Forge of Exiles write-up names. Kamasan Tiara (drop 75, 103 ES) works only at ilvl 78+ (the hybrid's T1 is modifier level 78). ~1 ex each; buy 3–5, the first gate is per base.",
    marketCheck:
      "Price finished 300+ ES Tiaras with resistances before buying bases. The expensive items (Perfect Exalt, omens) only go on bases that already passed the flat-ES gate.",
    phases: [
      {
        title: "Land T1 flat ES",
        steps: [
          {
            do: "Perfect Orb of Transmutation on each white Tiara.",
            why: "Its modifier-level floor is 70 (KB §1). Every flat-ES and %ES tier on a Tiara sits at level 65 or below (RePoE), so the soft floor leaves only their TOP tiers: any flat ES it rolls is the T1 +(61–73). The compilation says 'Trans/Aug until T1 +Energy Shield'; the Perfect orbs make each roll T1-or-nothing.",
            mats: [MATS.perfectTransmute],
            check: "Magic Tiara with +(61–73) to maximum Energy Shield.",
          },
          {
            do: "No flat ES yet but the prefix is still open → Perfect Orb of Augmentation.",
            why: "Same floor-70 logic on the second affix. A magic item holds one prefix + one suffix.",
            mats: [MATS.perfectAug],
            onFail:
              "Still no flat ES → next base. Rolled T1 %ES instead → the compilation's triple-T1 variant uses a resistance or rarity essence there, not Enhancement; this recipe's costs assume flat ES.",
          },
        ],
      },
      {
        title: "Essence → rare",
        steps: [
          {
            do: "Greater Essence of Enhancement.",
            why: `Upgrades the Tiara to rare and adds '(68–79)% increased Armour, Evasion and Energy Shield' (poe2db) — on a pure-ES Tiara the local %ES tier with that range is modifier level 54 (RePoE). ${ESSENCE_KEEPS}`,
            mats: [MATS.greaterEssenceEnhancement],
            check: "Rare: T1 flat ES + (68–79)% ES, one prefix still open.",
          },
        ],
      },
      {
        title: "Desecrated hybrid prefix",
        steps: [
          {
            do: "Omen of Sinistral Necromancy + Preserved Rib, then reveal at the Well of Souls.",
            why: "Sinistral forces the desecration onto the last open prefix (KB §4). Rib = armour; Preserved works at any item level.",
            mats: [MATS.omenSinistralNecromancy, MATS.preservedRib],
            pick: [
              "(39–42)% increased Energy Shield + (42–49) to maximum Life — the hybrid T1, modifier level 78",
              "(39–42)% increased Energy Shield + (33–39) to maximum Mana",
              // the helmet's desecrated-only mods are all suffixes, so a Sinistral reveal draws from the normal prefix pool
              "+(150–174) to maximum Life (normal-pool prefix, modifier level 65)",
            ],
          },
          {
            do: "No hybrid %ES line among the three options → Omen of Abyssal Echoes rerolls them once.",
            why: "The compilation's triple-T1 variant spends it 'to upgrade the hybrid tier'. One reroll, not a guarantee (KB §4).",
            mats: [MATS.omenAbyssalEchoes],
            onFail: "Still no ES line → take the best defence prefix; T1 flat + the essence's %ES still sells.",
          },
        ],
      },
      {
        title: "Resistance suffixes",
        steps: [
          {
            do: "Omen of Greater Exaltation + a Perfect Exalted Orb on the open suffixes.",
            why: "The prefixes are full, so both mods land on suffixes; the Perfect floor (50) cuts the low resistance tiers (KB §1). T1 resistances need ilvl 82 (KB §3) — an ilvl 80 Tiara tops at T2 36–40%. The compilation spends the Perfect pair when the hybrid landed T1; plain exalts otherwise.",
            mats: [MATS.omenGreaterExaltation, MATS.perfectExalted],
            check: "Six mods: three ES prefixes + resistances.",
          },
          {
            do: "Optional: add a socket first, then a Vaal Armourer's Infuser for quality above 20%.",
            why: "The Infuser 'exceeds maximum quality by up to 10%' on armour at max quality (item text).",
            unverified: VAAL_NO_BRICK,
          },
        ],
      },
    ],
    brick:
      "The flat-ES gate is the only real loss: a white base (~1 ex) plus a Perfect Transmute (and maybe an Aug). After the essence every step adds value; a missed hybrid still sells as a T1-flat ES helmet.",
  },

  armour_vile_robe_spirit: vileRobeGuide("spirit"),
  armour_vile_robe_es: vileRobeGuide("es"),

  quiver_putrefaction: {
    goal: "Corrupted 6-mod rare quiver: Damage with Bow Skills + bow-attack suffixes. 1–2 ex base → 2–12 div per the compilation.",
    shopping:
      "Cheapest RARE quiver, ilvl 81+ — Damage with Bow Skills' T1 (51–59%) is modifier level 81 (RePoE). The compilation names 'Citadel or Prime Quiver'; neither exists in the 0.5.5b base list — the closest is Primed Quiver ((7–10)% increased Attack Speed implicit). Visceral (crit chance) and Penetrating (pierce) are the other endgame implicits. Prefer a 6-mod rare (same 1–2 ex). Not corrupted, not desecrated.",
    marketCheck: "~4 ex omen + ~1 ex Jawbone + a 1–2 ex base per try (compilation). Price corrupted quivers with 43%+ bow damage first.",
    phases: [
      {
        title: "Putrefy",
        steps: [
          {
            do: "Omen of Putrefaction active, slam a Preserved Jawbone.",
            why: "The omen's next desecration 'will replace all modifiers on the item creating an item with up to 6 Unrevealed modifiers and Corrupting the item'; a Jawbone 'Desecrates a Rare Weapon or Quiver' (item text).",
            mats: [MATS.omenPutrefaction, MATS.preservedJawbone],
            warning:
              "It corrupts. No quality or socket step: no quality currency in the game data names quivers (Armourer's Scrap = armour, Whetstone = martial weapon, catalysts = rings/amulets/jewels) and the Artificer's Orb targets martial weapons, wands, staves and armour.",
            check: "Item corrupted, all mods unrevealed.",
            unverified: PUTREFY_COUNT,
          },
        ],
      },
      {
        title: "Reveal",
        steps: [
          {
            do: "Well of Souls: reveal one slot at a time, picking as you go.",
            why: "A sellable quiver = high bow damage + an attack suffix buyers filter on.",
            pick: [
              "prefix: (51–59)% increased Damage with Bow Skills — T1, modifier level 81",
              "prefix: flat Physical or Lightning damage to Attacks",
              "prefix: 'Increases and Reductions to Projectile Speed also apply to Damage with Bows' (Ulaman, RePoE AbyssModQuiverUlamanPrefixIncreasesToProjectileSpeedApplyToDamage)",
              "suffix: +(41–60)% Surpassing chance to fire an additional Arrow — modifier level 80",
              "suffix: Critical Damage Bonus / Critical Hit Chance for Attacks",
              "suffix: Attack Speed",
            ],
          },
          {
            do: "Keep an Omen of Abyssal Echoes for a good quiver that hits a junk option set.",
            why: "One reroll of the three options (KB §4). A waste on a fresh 1-ex base.",
            mats: [MATS.omenAbyssalEchoes],
            onFail: "No bow damage in the reveals → sell cheap, next base.",
          },
        ],
      },
    ],
    brick: "Slot machine like the boots/body recipes: ~1 in 3 lands a sellable quiver; one good hit pays several bases.",
  },

  crossbow_sovereign_ballista: {
    goal: "Rare Siege Crossbow: 100%+ phys + the essence's flat phys + a desecrated '+1 to maximum number of Summoned Ballista Totems' + two suffixes. Ballista/mortar builds.",
    shopping:
      "MAGIC Siege Crossbow (drop level 79; RePoE) with 100%+ increased Physical Damage. A magic item holds one prefix, so the essence and the desecration get the other two. The mid-budget variant also wants '+ Level of all Projectile Skills' as the suffix (compilation crossbow_002).",
    marketCheck: "Price finished Siege Crossbows with the ballista line first — the buyers are ballista/mortar builds, the line is worth little elsewhere.",
    phases: [
      {
        title: "Flat phys",
        steps: [
          {
            do: "Greater Essence of Abrasion.",
            why: `Upgrades to rare and adds 'Adds (23—35) to (39—59) Physical Damage' on two-handers (poe2db) — RePoE's level-60 flat-phys tier. ${ESSENCE_KEEPS}`,
            mats: [MATS.greaterEssenceAbrasion],
            check: "Rare: %phys + flat phys, one prefix open.",
          },
        ],
      },
      {
        title: "Ulaman prefix",
        steps: [
          {
            do: "Omen of Sinistral Necromancy + Omen of the Sovereign active, slam a Preserved Jawbone. Leave it unrevealed for now.",
            why: "Sinistral = the open prefix (KB §4). The Sovereign 'will guarantee a random Ulaman modifier' on a weapon desecration (item text).",
            mats: [MATS.omenSinistralNecromancy, MATS.omenTheSovereign, MATS.preservedJawbone],
            unverified: BALLISTA_POOL,
          },
        ],
      },
      {
        title: "Suffixes, reveal, finish",
        steps: [
          {
            do: "Two open suffixes → Omen of Greater Exaltation + one Greater Exalted Orb (one open suffix → the orb alone; suffixes already full, e.g. back here after a strip → skip).",
            why: "The prefixes are full (the unrevealed mod counts), so the mods land on suffixes. Modifier-level 35 floor (KB §1).",
            mats: [MATS.omenGreaterExaltation, MATS.greaterExalted],
          },
          {
            do: "Well of Souls: reveal the desecrated prefix; Omen of Abyssal Echoes rerolls the three options once if the ballista line is missing.",
            mats: [MATS.omenAbyssalEchoes],
            pick: ["+1 to maximum number of Summoned Ballista Totems", "Attacks with this Weapon Penetrate (15–25)% Lightning Resistance (the other Ulaman prefix)"],
            onFail:
              "Penetration only → it still sells as a 350+ pdps crossbow; or strip it with Omen of Light + Orb of Annulment (the Annulment then removes only desecrated mods) and desecrate again.",
            retryFrom: { phase: "Ulaman prefix", step: 1 },
          },
          {
            do: "Blacksmith's Whetstones to 20% quality, two Artificer's Orbs, Greater Iron Runes.",
            why: "The compilation upgrades the runes to a Perfect Iron Rune with Masterwork Runes (not tracked).",
            mats: [MATS.whetstone, MATS.artificers],
          },
        ],
      },
    ],
    brick: "No brick before the reveal: the essence and exalts always add value. A penetration reveal is the miss — sell as a phys crossbow or strip and retry.",
  },
};
