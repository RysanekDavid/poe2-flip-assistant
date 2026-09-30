import { MATS } from "./craftMaterials";
import type { CraftGuide, GuidePhase } from "./craftRecipes";

/**
 * Sixth batch of craft playbooks (2026-09-30 second wave, armour + weapons): the Katla's Gloom
 * putrefaction gloves, the essence + Sinistral-desecration bows and quarterstaff, the evasion
 * movement-speed boots and the budget Evasion/ES body armour. Every step comes from one compilation
 * entry (craftProvenanceData2.ts); tiers and item levels are the committed RePoE snapshot (game data
 * 0.5.5b); essence mods are poe2db's per-class tables; item behaviour quotes are the entity catalog.
 */

// KB §7 (verified-secondary, 2026-09-30): a Greater essence keeps the magic item's mods, like a Regal.
const ESSENCE_KEEPS = "The magic mods stay, like a Regal Orb (KB §7).";

// Shown as visible badges: each is a single-source or KB-conflicting claim the craft leans on.
const GLOVE_SOCKETS =
  "The compilation adds 2 sockets; docs/kb/currency-core.md caps gloves at 1 socket (body armour and two-handers at 2) [single-source]. One Artificer's Orb is budgeted.";
const DECAY_POOL =
  "That the rune's Decay modifiers join the putrefaction reveal pool rests on the compilation and the creator's video description ('By using the Katla's Gloom Rune in Gloves, you can roll Decay modifiers'); the KB does not cover reveal pools widened by a rune. The compilation also wants exactly 6 mods first, while the omen text says 'up to 6 Unrevealed modifiers'.";
const EXALT_PAIR = "Omen of Greater Exaltation adds two mods from one exalt (KB §4).";

type BowVariant = "abrasion" | "seeking";

const BOW: Record<BowVariant, { essence: string; mod: string; want: string[] }> = {
  abrasion: {
    essence: "Greater Essence of Abrasion",
    mod: "'Adds (16—24) to (28—42) Physical Damage' on bows (poe2db) — RePoE's third-highest of nine flat-phys tiers, matching the compilation's 'T3 flat phys'",
    want: [
      "flat Cold damage — the compilation's priority for non-crit (Ice Shot) bows; top tier Adds (72–81) to (110–123), modifier level 81",
      "flat Fire or Lightning damage",
      "desecrated: Attacks with this Weapon Penetrate (15–25)% Cold/Fire/Lightning Resistance",
    ],
  },
  seeking: {
    essence: "Greater Essence of Seeking",
    mod: "'+(3.11—3.8)% to Critical Hit Chance' on bows (poe2db) — RePoE's third-highest of six crit tiers, matching the compilation's 'T3 crit'",
    want: [
      "flat Physical damage — the compilation's first want; top tier Adds (26–39) to (44–66), modifier level 75",
      "flat Cold, Fire or Lightning damage",
      "desecrated: Projectiles deal (60–79)% increased Damage with Hits against Enemies further than 6m",
    ],
  },
};

/** The two compilation bows share every step; only the essence and the reveal targets differ. */
function bowGuide(variant: BowVariant): CraftGuide {
  const v = BOW[variant];
  const crit = variant === "seeking";
  return {
    goal: `Rare bow: high % Physical + the essence's ${crit ? "T3 crit" : "T3 flat phys"} + a desecrated prefix + two exalted mods. ${crit ? "Crit" : "Non-crit"} Deadeye/Ice Shot bows.`,
    shopping:
      "MAGIC bow, ilvl 75+ (the %phys T7 is modifier level 75, T8 is 82; RePoE), with high % increased Physical Damage and one suffix. The compilation hunts it with Perfect Transmutation/Augmentation; buying one is the same start. Keep the second prefix open for the essence and the third for the desecration.",
    marketCheck: `Price finished ${crit ? "crit bows (%phys + 3%+ crit)" : "phys bows with flat elemental"} before buying. The compilation rates it 'medium' budget with 'RNG on the final slam'.`,
    phases: [
      {
        title: "Essence → rare",
        steps: [
          {
            do: `${v.essence} on the magic bow.`,
            why: `Upgrades it to rare and adds ${v.mod}. ${ESSENCE_KEEPS}`,
            mats: [crit ? MATS.greaterEssenceSeeking : MATS.greaterEssenceAbrasion],
            check: crit ? "Rare: %phys + crit + the base's suffix." : "Rare: %phys + flat phys + the base's suffix, one prefix open.",
          },
        ],
      },
      {
        title: "Desecrated prefix",
        steps: [
          {
            do: "Omen of Sinistral Necromancy active, slam a Preserved Jawbone, then reveal at the Well of Souls.",
            why: "Sinistral forces the desecration onto a prefix (KB §4); a Jawbone 'Desecrates a Rare Weapon or Quiver' (item text), Preserved works at any item level.",
            mats: [MATS.omenSinistralNecromancy, MATS.preservedJawbone],
            pick: v.want,
          },
          {
            do: "Junk options → Omen of Abyssal Echoes rerolls the three options once (optional in the compilation).",
            why: "One reroll, not a guarantee (KB §4).",
            mats: [MATS.omenAbyssalEchoes],
            onFail: "No damage prefix → it still sells as a %phys bow; skip the exalts if the prefixes are weak.",
          },
        ],
      },
      {
        title: "Fill the last two",
        steps: [
          {
            do: "Omen of Greater Exaltation + one Greater Exalted Orb.",
            why: `${EXALT_PAIR} Greater floor 35 (KB §1); the compilation allows the Perfect orb (floor 50) on a good bow.`,
            mats: [MATS.omenGreaterExaltation, MATS.greaterExalted],
            check: "Six mods.",
          },
        ],
      },
    ],
    brick: "No brick before the reveal: the essence always lands. A dead prefix reveal is the miss — the bow still sells on its %phys.",
  };
}

const glovesGuide: CraftGuide = {
  goal: "Corrupted rare gloves carrying Katla's Gloom and Decay modifiers (ailment magnitude, faster damaging ailments). Martial Artist 'explode' gloves: the creator's description says the Decay modifiers 'can convert into Explode on Gloves when using Way of the Stonefist'.",
  shopping:
    "RARE gloves, ilvl 75+ (the higher Decay tiers are modifier level 75; RePoE), 20% quality already on, 6 mods, not corrupted, not desecrated — ~8–10 chaos per the compilation. Its 'Gold Gloves' is not a 0.5.5b base name: a gold-named (rare) pair is our reading. It says 'ilvl 75 exactly' without a reason.",
  marketCheck: "~40 ex all-in per the compilation (Katla's Gloom 5–25 ex, the omen ~8 ex). Price corrupted gloves with a Decay line before buying the rune.",
  phases: [
    {
      title: "Socket the rune (BEFORE the omen)",
      steps: [
        {
          do: "Artificer's Orb for an Augment socket.",
          why: "Putrefaction corrupts; sockets can't be added after (KB §4). The pre-bought 20% quality covers the quality step.",
          mats: [MATS.artificers],
          unverified: GLOVE_SOCKETS,
        },
        {
          do: "Socket Katla's Gloom.",
          why: "RePoE RuneWarpingDecayInfluence: gloves only, 'Can roll Decay modifiers'; it 'cannot be retrieved or replaced'. The compilation calls it 'Cutthroat's Gloom' — the 0.5.5b game data has only Katla's Gloom with that text, and the creator's video description names Katla's Gloom.",
          mats: [MATS.katlasGloom],
          check: "Gloves show 'Can roll Decay modifiers'.",
        },
      ],
    },
    {
      title: "Putrefy",
      steps: [
        {
          do: "Omen of Putrefaction active, slam a Preserved Rib.",
          why: "The omen's next desecration 'will replace all modifiers on the item creating an item with up to 6 Unrevealed modifiers and Corrupting the item'. The compilation names no bone: gloves are armour, and a Rib 'Desecrates a Rare Armour' (item text).",
          mats: [MATS.omenPutrefaction, MATS.preservedRib],
          warning: "It corrupts — socket and rune first.",
          check: "Item corrupted, all mods unrevealed.",
          unverified: DECAY_POOL,
        },
      ],
    },
    {
      title: "Reveal",
      steps: [
        {
          do: "Well of Souls: the three prefixes first, then the three suffixes.",
          why: "The compilation's order. The ranges below are RePoE's modifier-level-75 Decay tiers (each family also has a level-45 tier).",
          pick: [
            "prefix: (35–50)% increased Ignite Magnitude",
            "prefix: (30–42)% increased Magnitude of Bleeding / of Poison you inflict",
            "prefix: (26–32)% increased Magnitude of Ailments you inflict",
            "prefix: Damaging Ailments deal damage (14–20)% faster",
            "suffix: (20–30)% increased Duration of Damaging Ailments on Enemies",
          ],
          onFail: "No Decay line → ordinary corrupted gloves; the rune is spent.",
        },
      ],
    },
  ],
  brick: "Slot machine: the ~40 ex (rune + omen + base) is the stake per pair; a miss keeps only what the normal reveals give.",
};

const quarterstaffGuide: CraftGuide = {
  goal: "Rare quarterstaff: % Elemental (or % Physical) + the essence's flat damage + a desecrated prefix + two sockets. The compilation's '1000+ DPS Monk quarterstaff', 'beginner friendly'.",
  shopping:
    "MAGIC quarterstaff, ilvl 75+ (the compilation), with % increased Elemental Damage with Attacks — or % Physical / Added Elemental — and an open prefix. Sort trade by DPS. Don't pair Added Fire with the Flames essence: an essence mod that shares a family with an existing mod is not covered by the KB (§7).",
  marketCheck: "Price finished elemental quarterstaves with the essence's flat line first. The compilation calls the bases cheap and the essences accessible.",
  phases: [
    {
      title: "Flat damage essence",
      steps: [
        {
          do: "Greater Essence of Flames — the compilation also names 'ice' and 'storm'; the 0.5.5b cold and lightning ones are Greater Essence of Ice and of Electricity (RePoE ids …Cold / …Lightning).",
          why: `Upgrades to rare and adds 'Adds (56—70) to (84—107) Fire Damage' on quarterstaves (poe2db) — the compilation's own example. ${ESSENCE_KEEPS}`,
          mats: [MATS.greaterEssenceFlames],
          check: "Rare: % elemental + flat fire, one prefix open.",
        },
      ],
    },
    {
      title: "Desecrated prefix",
      steps: [
        {
          do: "Activate Omen of Sinistral Necromancy FIRST, then the Preserved Jawbone; reveal at the Well of Souls.",
          why: "Sinistral forces the prefix side (KB §4). The jackpot is a % damage prefix.",
          mats: [MATS.omenSinistralNecromancy, MATS.preservedJawbone],
          pick: [
            "desecrated: (86–99)% increased Fire Damage + (14–23)% increased Ignite Magnitude (Amanamu; Cold/Freeze and Lightning/Shock twins)",
            "% increased Elemental Damage with Attacks — top (120–139)%, modifier level 81",
            "% increased Physical Damage (phys path)",
          ],
          onFail: "No damage prefix → still a rare staff with two flat/% lines; finish cheaply or sell.",
        },
      ],
    },
    {
      title: "Sockets, quality",
      steps: [
        {
          do: "Two Artificer's Orbs + runes, then Blacksmith's Whetstones to 20% quality.",
          why: "The compilation sockets Greater Iron Runes, but their martial-weapon line is '18% increased Physical Damage' (item text) — it only pays on the phys path. The optional Vaal Orb 'Modifies an item unpredictably and Corrupts it' (item text): only on a staff you'd accept losing.",
          mats: [MATS.artificers, MATS.whetstone],
        },
      ],
    },
  ],
  brick: "Cheap at every step: the essence and bone cost a few ex, and a weak reveal still leaves a usable staff.",
};

const bootsGuide: CraftGuide = {
  goal: "Rare evasion boots: 35% Movement Speed + your missing resistance + chaos resistance + a desecrated mod + two exalted mods (flat/% Evasion, Dexterity).",
  shopping:
    "MAGIC pure-evasion boots with 35% Movement Speed and a resistance (e.g. Lightning 35+). 35% MS is modifier level 82 (RePoE; 30% is 65), so the base is ilvl 82+ — the compilation's 'ilvl 75+' cannot carry 35%. Pure evasion: set the armour and ES filters to 0.",
  marketCheck: "Price finished 35% MS evasion boots with chaos res. The compilation: 'Medium — scales with how much you chase the desecrate roll'.",
  phases: [
    {
      title: "Chaos res essence",
      steps: [
        {
          do: "Greater Essence of Ruin.",
          why: `Adds '+(16—19)% to Chaos Resistance' on boots (poe2db) and upgrades to rare. ${ESSENCE_KEEPS}`,
          mats: [MATS.greaterEssenceRuin],
          check: "Rare: 35% MS + resistance + chaos res.",
        },
      ],
    },
    {
      title: "Desecrate, then exalt",
      steps: [
        {
          do: "Choose the side: Omen of Sinistral (prefix: flat/% Evasion, Life) or Dextral Necromancy (suffix: Dexterity, a hybrid resistance), then a Preserved Rib. Leave it unrevealed.",
          why: "Necromancy picks the side (KB §4); a Rib 'Desecrates a Rare Armour' (item text).",
          mats: [MATS.omenSinistralNecromancy, MATS.omenDextralNecromancy, MATS.preservedRib],
        },
        {
          do: "Omen of Greater Exaltation + one Greater Exalted Orb.",
          why: `${EXALT_PAIR} The unrevealed mod holds its slot, so the two land on the two open slots. The compilation: 'Perfect Exalt is ~2.5 div and not required'.`,
          mats: [MATS.omenGreaterExaltation, MATS.greaterExalted],
          check: "Six mods, one unrevealed.",
        },
      ],
    },
    bootsFinish(),
  ],
  brick: "Every step before the reveal adds value to a base that already had the MS. The chase — Echoes and Light/Annulment retries — is where it gets expensive.",
};

/** Reveal (with the optional Echoes / Light retries) and the quality/socket finish. */
function bootsFinish(): GuidePhase {
  return {
    title: "Reveal, finish",
    steps: [
      {
        do: "Well of Souls: reveal the desecrated mod.",
        pick: [
          "prefix (Sinistral): flat Evasion — top +(147–176), modifier level 54",
          "prefix (Sinistral): % increased Evasion Rating — top (92–100)%",
          "suffix (Dextral): Dexterity — top +(31–33), modifier level 74",
          "suffix (Dextral): +(13–17)% to Lightning/Fire/Cold and Chaos Resistances (desecrated)",
        ],
      },
      {
        do: "Bad reveal on a good pair → Omen of Abyssal Echoes for one reroll of the options; or strip it: Omen of Light + an Orb of Annulment, then another Rib.",
        why: "Light makes the next Annulment remove only Desecrated modifiers (item text). The compilation marks both conditional (Echoes ~93 ex, Light ~3 div).",
        mats: [MATS.omenAbyssalEchoes, MATS.omenLight, MATS.annul, MATS.preservedRib],
      },
      {
        do: "Armourer's Scraps to 20% quality, then one Artificer's Orb + a rune.",
        why: "Quality before any corruption (the compilation). One socket is the boots cap (docs/kb/currency-core.md). A Masterwork Rune and the Vaal Temple are optional extras (not tracked).",
        mats: [MATS.scrap, MATS.artificers],
      },
    ],
  };
}

const bodyGuide: CraftGuide = {
  goal: "Rare Evasion/ES body armour: the base's % Evasion and Energy Shield + the essence's life + a desecrated prefix + resistances. '~12 ex in → ~1 div out' (the compilation).",
  shopping:
    "MAGIC Evasion/ES body armour, ilvl 70+, ~1 ex (the compilation). Its 'T1 Evasion+ES': RePoE's top (101–110)% increased Evasion and Energy Shield is modifier level 75; an ilvl 70–74 base tops at (92–100)% (level 65).",
  marketCheck: "Price rare EV/ES chests with 100+ life and resistances first; the compilation calls it the 'simplest armour recipe'.",
  phases: [
    {
      title: "Life essence",
      steps: [
        {
          do: "Greater Essence of the Body.",
          why: `Adds '+(100—119) to maximum Life' on body armours (poe2db) and upgrades to rare. ${ESSENCE_KEEPS}`,
          mats: [MATS.greaterEssenceTheBody],
          check: "Rare: % EV/ES + life.",
        },
      ],
    },
    {
      title: "Desecrated prefix",
      steps: [
        {
          do: "Omen of Sinistral Necromancy (optional in the compilation) + a Preserved Rib, then reveal.",
          why: "Sinistral forces the prefix (KB §4); without it the Rib may take a suffix.",
          mats: [MATS.omenSinistralNecromancy, MATS.preservedRib],
          pick: [
            "prefix: (39–42)% increased Evasion and Energy Shield + (42–49) to maximum Life — hybrid top tier, modifier level 78",
            "prefix: (39–42)% increased Evasion and Energy Shield + flat Evasion/ES — modifier level 78",
            "prefix: flat Evasion or Energy Shield",
          ],
        },
      ],
    },
    {
      title: "Fill, sockets, quality",
      steps: [
        {
          do: "Exalted Orbs into the open slots (Omen of Greater Exaltation fills two at once).",
          why: "Resistances are the want. Two plain Exalts are the compilation's bill; the omen is its optional saver.",
          mats: [MATS.exalted],
          check: "Six mods.",
        },
        {
          do: "Armourer's Scraps to 20% quality, two Artificer's Orbs, two Iron Runes.",
          why: "The compilation lists a Blacksmith's Whetstone for the quality — that 'Improves the quality of a martial weapon' (item text); armour takes Armourer's Scraps.",
          mats: [MATS.scrap, MATS.artificers],
        },
      ],
    },
  ],
  brick: "No brick: a ~1 ex base plus a cheap essence. A weak reveal still leaves a life + defence chest.",
};

export const GUIDES_6: Record<string, CraftGuide> = {
  gloves_putrefaction_decay: glovesGuide,
  bow_abrasion_desecrated_prefix: bowGuide("abrasion"),
  bow_seeking_desecrated_prefix: bowGuide("seeking"),
  quarterstaff_flames_desecrated_prefix: quarterstaffGuide,
  boots_evasion_ms_ruin: bootsGuide,
  armour_evasion_es_body_essence: bodyGuide,
};
