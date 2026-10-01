import { MATS } from "./craftMaterials";
import type { CraftGuide } from "./craftRecipes";

/**
 * Third batch of craft playbooks: the Potent-liquid 5-mod BASIC jewels, re-added after
 * docs/research/poe2-crafting-knowledge.md §6 was corrected (2026-09-28: poe2db + RePoE show Potent
 * Liquid Contempt grants "+1 Suffix/Prefix Modifier allowed" on Rare Basic Jewels). Sources are the
 * two jewel transcripts under docs/kb/sources/transcripts ([S4] = 04-…, [S20] = 19-…). Split from
 * craftGuideData2.ts to keep it under the 500-line cap; same tight-prose contract.
 */

// Each of these is shown to the player as a visible badge — creator-observed, not primary-sourced.
const CONTEMPT_SIDE =
  "Which mod Contempt removes is creator-observed only: the '+1 Prefix' result has always cost a suffix [S4, S20]. RePoE/poe2db confirm the two crafted mods and their slots, not the removal rule.";
const OVER_CAP =
  "That the 3rd (over-cap) suffix survives pulling the '+1 Suffix Modifier allowed' mod is creator-demonstrated [S4, S20], not primary-sourced — docs/kb/desecration-abyss.md keeps it as an explicit stop condition.";
const FEROCITY_SIDE =
  "Ferocity's mod pool is poe2db + RePoE; that it can only take a prefix slot (and so costs a prefix) while the suffixes are over-cap is creator-observed [S4, S20].";
// Ferocity's pool also holds "(40–60)% increased Effect of Prefixes" in a SUFFIX slot (poe2db +
// RePoE CraftedJewelPrefixEffect) — if that variant lands it costs a caster suffix.
const FEROCITY_SUFFIX_ROLL =
  "Ferocity can also roll '(40–60)% increased Effect of Prefixes' in a SUFFIX slot — that outcome removes one of your caster suffixes.";
const FEROCITY_STOP =
  "Got 'Effect of Prefixes' (a caster suffix is gone) → STOP: no more Ferocity/Chaos, divine if worth it and sell as a 5-mod — the suffix can't be rebuilt without re-running Contempt.";
const UNREVEALED_BLOCKER =
  "Fracturing with an UNREVEALED desecrated blocker is what the creator did [S20] (locked 2 of 5); KB §2 confirms a desecrated mod counts toward 4 and can't be fractured, not that an unrevealed one behaves the same.";

const SPELL_SUFFIX_PICKS = [
  "% increased Critical Hit Chance for Spells",
  "% increased Critical Spell Damage Bonus",
  "% increased Cast Speed",
  "Recover % of maximum Mana on Kill",
];

export const GUIDES_3: Record<string, CraftGuide> = {
  jewel_liquid_5mod_budget: {
    goal: "5-mod caster Sapphire: 3 suffixes (Crit Chance for Spells + 2 caster) + Spell Damage + Ferocity 'Effect of Suffixes'. Uncorrupted.",
    shopping:
      "RARE basic Sapphire (not Time-Lost) with EXACTLY 3 mods: 2 caster suffixes you want (Crit Chance for Spells + Mana on Kill/Cast Speed/Crit Spell Damage) + ONE junk prefix. ~10–30 ex each; buy several. Two prefixes = a second ~10 div Annulment later — skip those bases [S20].",
    marketCheck:
      "Price finished 3-suffix Sapphires with Spell Damage + 'Effect of Suffixes' (creator's comparables started ~170 div [S20]). Total spend ~20–30 div per finished jewel incl. dead bases — craft only if the finished floor clears that several times over.",
    phases: [
      {
        title: "Contempt: +1 suffix",
        steps: [
          {
            do: "Slam Potent Liquid Contempt on the 3-mod base.",
            why: "Removes a random mod and adds a crafted '+1 Suffix Modifier allowed' (takes a PREFIX slot) or '+1 Prefix Modifier allowed' (takes a SUFFIX slot) — poe2db + RePoE. ~50/50; the creator won 2 of 3 [S20].",
            mats: [MATS.potentLiquidContempt],
            onFail: "'+1 Prefix Modifier allowed' ate a caster suffix → discard the base (~10–30 ex), next one. Cheaper than fixing it.",
            check: "2 caster suffixes + '+1 Suffix Modifier allowed' as the only prefix.",
            unverified: CONTEMPT_SIDE,
          },
        ],
      },
      {
        title: "Desecrated 3rd suffix",
        steps: [
          {
            do: "Activate Omen of Dextral Necromancy, slam a Preserved Cranium.",
            why: "A prefix slot is still open, so without the omen the desecration can land on the prefix side.",
            mats: [MATS.omenDextralNecromancy, MATS.preservedCranium],
          },
          {
            do: "Well of Souls: Omen of Abyssal Echoes in the inventory, then reveal and pick a caster suffix.",
            why: "Echoes = ONE reroll of the three offered options — insurance, not a guarantee.",
            mats: [MATS.omenAbyssalEchoes],
            pick: SPELL_SUFFIX_PICKS,
            onFail:
              "Nothing usable → discard the base while it costs under half an Omen of Light [S20]. Pricier base: strip just the desecrated mod with Omen of Light + Orb of Annulment and slam a fresh cranium.",
            retryFrom: { phase: "Desecrated 3rd suffix", step: 1 },
            check: "3 caster suffixes + '+1 Suffix Modifier allowed'.",
          },
        ],
      },
      {
        title: "Strip the +1, fill prefixes",
        steps: [
          {
            do: "Omen of Sinistral Annulment + Orb of Annulment.",
            why: "The crafted '+1' mod is your ONLY prefix, so a prefix-only Annulment is guaranteed to take exactly it.",
            mats: [MATS.omenSinistralAnnulment, MATS.annul],
            warning: "Never a plain Annulment/Chaos here — it can strip a suffix. A second prefix makes this a 50/50 (buy 1-prefix bases).",
            check: "3 suffixes, 0 prefixes, no '+1 Suffix Modifier allowed'.",
            unverified: OVER_CAP,
          },
          {
            do: "Two Exalted Orbs, fishing Spell Damage.",
            why: "Suffixes are over-cap, so new mods can only be prefixes. Spell Damage resells best (buyers' caster catalysts boost it) [S20].",
            mats: [MATS.exalted],
            check: "5 mods: 3 suffixes + 2 prefixes — sellable as-is if the market wants no Ferocity.",
          },
        ],
      },
      {
        title: "Ferocity finish",
        steps: [
          {
            do: "Slam Potent Liquid Ferocity.",
            why: "Removes a random mod and adds crafted '(40–60)% increased Effect of Suffixes' in a prefix slot — 50/50 it keeps Spell Damage.",
            mats: [MATS.potentLiquidFerocity],
            warning: FEROCITY_SUFFIX_ROLL,
            onFail: `It took Spell Damage → Chaos-spam the prefixes (suffixes can't be hit) until Spell Damage returns, then slam Ferocity again. ${FEROCITY_STOP}`,
            retryFrom: { phase: "Ferocity finish", step: 1 },
            check: "3 suffixes + Spell Damage + 'increased Effect of Suffixes'.",
            unverified: FEROCITY_SIDE,
          },
          {
            do: "Chaos Orbs only inside the Ferocity loop above.",
            why: "With 3 suffixes on a 2-suffix jewel the game reports 'no space' for a suffix roll, so chaos only reshuffles prefixes [S4, S20].",
            mats: [MATS.chaos],
            unverified: OVER_CAP,
          },
        ],
      },
    ],
    brick: "Dead Contempt/reveal = a ~10–30 ex base lost, by design. After the +1 is stripped the suffixes are locked; the only loop left is Chaos + Ferocity.",
  },

  jewel_fractured_5mod: {
    goal: "High-end caster Sapphire: FRACTURED max-roll Crit Spell Damage Bonus + Crit Chance for Spells + 3rd caster suffix, Spell Damage + Ferocity prefix, divined.",
    shopping:
      "RARE basic Sapphire with a 20% (max) Critical Spell Damage Bonus and EXACTLY 3 mods (2 suffixes + 1 prefix, so the open slot is a prefix). Other mods don't matter. Buy ~5 — the fracture is 1-in-3 [S20].",
    marketCheck:
      "Budget ~150 div per finished jewel incl. divines [S20]; creator sales 280 / 400 / 580 div. Needs tens, better hundreds of div of runway — go only if finished 3-suffix fractured Sapphires clear ~250 div.",
    phases: [
      {
        title: "Lock the max roll",
        steps: [
          {
            do: "Omen of Sinistral Necromancy + Preserved Cranium — leave the desecration UNREVEALED.",
            why: "Fills the open prefix as a blocker: 4 mods, and the bone can't touch your suffix.",
            mats: [MATS.omenSinistralNecromancy, MATS.preservedCranium],
            check: "Exactly 4 mods: max Crit Spell Damage + 1 suffix + 1 prefix + unrevealed desecrated prefix.",
            unverified: UNREVEALED_BLOCKER,
          },
          {
            do: "Fracturing Orb at exactly 4 mods.",
            why: "Needs ≥4 mods; the desecrated blocker can't be fractured → 1-in-3 to lock the max-roll crit damage (KB §2).",
            mats: [MATS.fracturing],
            onFail: "Wrong mod fractured → one fracture per item, ever: sell/discard, next base (loss lives in hitRate).",
            check: "'Fractured' Critical Spell Damage Bonus 20%.",
            unverified: UNREVEALED_BLOCKER,
          },
        ],
      },
      {
        title: "Second caster suffix",
        steps: [
          {
            do: "Annul twice, then Chaos-spam until Crit Chance for Spells.",
            why: "The fractured mod can't be removed, so this is safe: fractured + 1 mod, and every Chaos swaps the loose one [S4].",
            mats: [MATS.annul, MATS.chaos],
            check: "Fractured Crit Spell Damage + Crit Chance for Spells.",
          },
          {
            do: "Two Exalted Orbs (prefixes don't matter yet).",
            why: "Contempt then removes one of 3 loose mods — with 2 junk prefixes most removals hit a prefix [S4].",
            mats: [MATS.exalted],
            check: "4 mods: 2 suffixes (1 fractured) + 2 prefixes.",
          },
        ],
      },
      {
        title: "Contempt + desecrated suffix",
        steps: [
          {
            do: "Slam Potent Liquid Contempt.",
            why: "Want '+1 Suffix Modifier allowed' (prefix slot). ~50/50, or ~1-in-3 to fail with a fractured suffix [S4].",
            mats: [MATS.potentLiquidContempt],
            onFail:
              "'+1 Prefix Modifier allowed' (sits in a suffix slot) took Crit Chance → Orb of Annulment ×2 (the fracture can't be hit) leaves fractured + 1 loose mod = the 'Second caster suffix' start; Chaos-spam to Crit Chance for Spells, 2 Exalts, Contempt again.",
            retryFrom: { phase: "Second caster suffix", step: 1 },
            check: "Fractured + Crit Chance suffixes, '+1 Suffix Modifier allowed' + 1 prefix.",
            unverified: CONTEMPT_SIDE,
          },
          {
            do: "Preserved Cranium, then Well of Souls with Omen of Abyssal Echoes; pick a caster suffix.",
            why: "Prefixes are full (crafted mod + 1), so the desecration can only land on the suffix side.",
            mats: [MATS.preservedCranium, MATS.omenAbyssalEchoes],
            pick: SPELL_SUFFIX_PICKS,
            onFail: "Bad options → Omen of Light + Orb of Annulment strips only the desecrated mod; slam a fresh cranium. Worth it on a fractured base [S20].",
            retryFrom: { phase: "Contempt + desecrated suffix", step: 2 },
          },
          {
            do: "Omen of Light + Orb of Annulment (only on a bad reveal).",
            why: "Removes only the desecrated mod — one desecrated mod per item, so it must go before the next cranium.",
            mats: [MATS.omenLight, MATS.annul],
          },
        ],
      },
      {
        title: "Strip the +1, finish prefixes",
        steps: [
          {
            do: "Omen of Sinistral Annulment + Orb of Annulment until the '+1 Suffix Modifier allowed' is gone.",
            why: "Prefix-only removal; with 2 prefixes it's 50/50 per try — lost = the junk prefix went, now the crafted mod is the only prefix [S4]. Omen of Sinistral Erasure + Chaos works too if cheaper [S20].",
            mats: [MATS.omenSinistralAnnulment, MATS.annul],
            warning: "Without the Sinistral omen this bricks the item — the removal can take a suffix [S20].",
            check: "3 suffixes (1 fractured), ≤1 prefix, no '+1' mod.",
            unverified: OVER_CAP,
          },
          {
            do: "Exalt the last prefix, then Chaos-spam prefixes until Spell Damage.",
            why: "Suffixes are over-cap and untouchable — chaos only reshuffles prefixes [S4, S20].",
            mats: [MATS.exalted, MATS.chaos],
            check: "5 mods: 3 suffixes + Spell Damage + 1 prefix.",
            unverified: OVER_CAP,
          },
          {
            do: "Slam Potent Liquid Ferocity; on a miss chaos back to Spell Damage and slam again.",
            why: "Adds '(40–60)% increased Effect of Suffixes' in a prefix slot — 50/50 it replaces the junk prefix, not Spell Damage.",
            mats: [MATS.potentLiquidFerocity, MATS.chaos],
            warning: FEROCITY_SUFFIX_ROLL,
            onFail: FEROCITY_STOP,
            check: "3 suffixes + Spell Damage + 'increased Effect of Suffixes'.",
            unverified: FEROCITY_SIDE,
          },
          {
            do: "Divine until the rolls are high, then list.",
            why: "Rerolls every value except the fractured one (Divine-proof, KB §2). The single most expensive step [S20].",
            mats: [MATS.divine],
          },
        ],
      },
    ],
    brick: "Missed fracture = the only real loss. After the lock every gate (Contempt, reveal, strip, Ferocity) is a retry loop — cost, not brick.",
  },
};
