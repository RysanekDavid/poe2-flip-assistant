import type { ItemState } from "./classify";
import { KB, KB_CURRENCY_CORE, type MoveRule, type UnlistedMaterial, type Verdict } from "./ruleTypes";
import { all, isMagicOrRare, isRare, needMods, needOpen, whittlingTarget } from "./rulePredicates";
import { JEWEL_ESSENCE } from "./ruleTableInstill";

/**
 * Omens riding an Exalted / Chaos / Annulment click or a Perfect / Corrupted Essence (KB §1, §4,
 * §7, §8). The Annulment omens follow the orb onto magic items.
 */

const S4 = `${KB} §4`;

// Both halves are now in the KB (§4 side mapping, §1 Annulment target). Verifying the pairing would
// change recipe-audit verdicts, so it is left for its own review instead of riding the target fix.
const ANNUL_OMEN_NOTE = `the side mapping (${S4}) and Annulment's magic-or-rare target (${KB} §1) are KB-verified; the omen + Annulment pairing itself is not yet reviewed`;

const WHITTLING_WARNING =
  "WALLET-KILLER: removes the mod with the lowest MODIFIER LEVEL (hidden in-game), not the lowest displayed tier — check the hover preview before clicking";

function exaltWith(side: "prefix" | "suffix" | "any", count: number) {
  return (s: ItemState): Verdict => (isRare(s) ? all([needOpen(s, side, count)]) : null);
}

function whittle(side: "prefix" | "suffix" | null) {
  return (s: ItemState): Verdict => {
    if (!isRare(s)) return null;
    const target = whittlingTarget(s);
    const unrevealed = s.slots.unrevealed > 0;
    return all([needMods(s, 1, side ?? undefined)], {
      pass: true,
      warnings: unrevealed ? [target] : [],
      notes: unrevealed ? [] : [target],
    });
  };
}

const CATALYST_CLASSES = new Set(["Rings", "Amulets"]);

function catalysingCheck(s: ItemState): Verdict {
  if (!isRare(s) || s.itemClass == null || !CATALYST_CLASSES.has(s.itemClass)) return null;
  if (!s.quality) return { block: "no catalyst quality on the item — apply a catalyst first" };
  return all([needOpen(s, "any")]);
}

const EXALTATION: MoveRule[] = [
  {
    id: "omen-sinistral-exaltation",
    label: "Omen of Sinistral Exaltation + Exalted Orb",
    family: "omen",
    materials: ["omenSinistralExaltation", "exalted"],
    requires: "rare with an open prefix",
    effect: "the next Exalt adds a PREFIX",
    notes: ["rides any Exalt tier — that tier's floor still applies"],
    source: S4,
    verified: true,
    check: exaltWith("prefix", 1),
  },
  {
    id: "omen-dextral-exaltation",
    label: "Omen of Dextral Exaltation + Exalted Orb",
    family: "omen",
    materials: ["omenDextralExaltation", "exalted"],
    requires: "rare with an open suffix",
    effect: "the next Exalt adds a SUFFIX",
    notes: ["rides any Exalt tier — that tier's floor still applies"],
    source: S4,
    verified: true,
    check: exaltWith("suffix", 1),
  },
  {
    id: "omen-greater-exaltation",
    label: "Omen of Greater Exaltation + Exalted Orb",
    family: "omen",
    materials: ["omenGreaterExaltation", "exalted"],
    requires: "rare with two open affix slots",
    effect: "the next Exalt adds TWO mods",
    source: S4,
    verified: true,
    check: exaltWith("any", 2),
  },
  {
    id: "omen-sinistral-greater-exaltation",
    label: "Sinistral + Greater Exaltation + Exalted Orb",
    family: "omen",
    materials: ["omenSinistralExaltation", "omenGreaterExaltation", "exalted"],
    requires: "rare with two open prefixes",
    effect: "the next Exalt adds TWO prefixes (same-family omens stack)",
    notes: ["stacking is medium confidence (2-1 vote) in the KB"],
    source: S4,
    verified: false,
    check: exaltWith("prefix", 2),
  },
  {
    id: "omen-dextral-greater-exaltation",
    label: "Dextral + Greater Exaltation + Exalted Orb",
    family: "omen",
    materials: ["omenDextralExaltation", "omenGreaterExaltation", "exalted"],
    requires: "rare with two open suffixes",
    effect: "the next Exalt adds TWO suffixes (same-family omens stack)",
    notes: ["stacking is medium confidence (2-1 vote) in the KB"],
    source: S4,
    verified: false,
    check: exaltWith("suffix", 2),
  },
  {
    id: "omen-catalysing-exaltation",
    label: "Omen of Catalysing Exaltation + Exalted Orb",
    family: "omen",
    materials: ["omenCatalysingExaltation", "exalted"],
    requires: "rare ring/amulet with catalyst quality and an open affix",
    effect: "the next Exalt consumes ALL catalyst quality to bias toward the catalyst's tag (×5 at 20%, ×7.5 at 40%)",
    warnings: ["a weighted bias, NOT a guarantee — and all quality is consumed"],
    notes: [
      "with Greater Exaltation the bias may hit only the FIRST added mod (KB dispute) — budget first-only",
      `raw catalyst quality alone never changes roll weights (${KB} §8)`,
    ],
    source: `${S4}; ${KB} §8`,
    verified: true,
    check: catalysingCheck,
  },
];

const REMOVAL: MoveRule[] = [
  {
    id: "omen-sinistral-erasure",
    label: "Omen of Sinistral Erasure + Chaos Orb",
    family: "omen",
    materials: ["omenSinistralErasure", "chaos"],
    requires: "rare with a prefix",
    effect: "the Chaos removal hits a PREFIX, then one new mod is added",
    source: `${KB} §1; ${S4}`,
    verified: true,
    check: (s) => (isRare(s) ? all([needMods(s, 1, "prefix")]) : null),
  },
  {
    id: "omen-dextral-erasure",
    label: "Omen of Dextral Erasure + Chaos Orb",
    family: "omen",
    materials: ["omenDextralErasure", "chaos"],
    requires: "rare with a suffix",
    effect: "the Chaos removal hits a SUFFIX, then one new mod is added",
    source: `${KB} §1; ${S4}`,
    verified: true,
    check: (s) => (isRare(s) ? all([needMods(s, 1, "suffix")]) : null),
  },
  {
    id: "omen-whittling",
    label: "Omen of Whittling + Chaos Orb",
    family: "omen",
    materials: ["omenWhittling", "chaos"],
    requires: "rare with at least one mod (Chaos Orb only — not Annulment)",
    effect: "the Chaos removal takes the mod with the lowest modifier level, then adds one",
    warnings: [WHITTLING_WARNING],
    source: S4,
    verified: true,
    check: whittle(null),
  },
  {
    id: "omen-whittling-sinistral",
    label: "Whittling + Sinistral Erasure + Chaos Orb",
    family: "omen",
    materials: ["omenWhittling", "omenSinistralErasure", "chaos"],
    requires: "rare with a prefix",
    effect: "removes the lowest-level PREFIX, then adds one mod",
    warnings: [WHITTLING_WARNING],
    notes: ["the Whittling + Erasure stack is a reddit-round claim in the KB, not confirmed"],
    source: S4,
    verified: false,
    check: whittle("prefix"),
  },
  {
    id: "omen-whittling-dextral",
    label: "Whittling + Dextral Erasure + Chaos Orb",
    family: "omen",
    materials: ["omenWhittling", "omenDextralErasure", "chaos"],
    requires: "rare with a suffix",
    effect: "removes the lowest-level SUFFIX, then adds one mod",
    warnings: [WHITTLING_WARNING],
    notes: ["the Whittling + Erasure stack is a reddit-round claim in the KB, not confirmed"],
    source: S4,
    verified: false,
    check: whittle("suffix"),
  },
  {
    id: "omen-sinistral-annulment",
    label: "Omen of Sinistral Annulment + Orb of Annulment",
    family: "omen",
    materials: ["omenSinistralAnnulment", "annul"],
    requires: "magic or rare with a prefix",
    effect: "the Annulment removes a PREFIX",
    notes: [ANNUL_OMEN_NOTE],
    source: `${S4}; ${KB} §1; ${KB_CURRENCY_CORE} §1, §5`,
    verified: false,
    check: (s) => (isMagicOrRare(s) ? all([needMods(s, 1, "prefix")]) : null),
  },
  {
    id: "omen-dextral-annulment",
    label: "Omen of Dextral Annulment + Orb of Annulment",
    family: "omen",
    materials: ["omenDextralAnnulment", "annul"],
    requires: "magic or rare with a suffix",
    effect: "the Annulment removes a SUFFIX",
    notes: [ANNUL_OMEN_NOTE],
    source: `${S4}; ${KB} §1; ${KB_CURRENCY_CORE} §1, §5`,
    verified: false,
    check: (s) => (isMagicOrRare(s) ? all([needMods(s, 1, "suffix")]) : null),
  },
];

/** What the Crystallisation omen text names: "your next Perfect or Corrupted Essence" (entity catalog, 0.5.5b). */
export const RARE_ESSENCE: UnlistedMaterial = { key: "perfect-or-corrupted-essence", label: "Perfect or Corrupted Essence of your choice" };

// RePoE CurrencyCorruptedEssence* (entity catalog, game data 0.5.5b): the rare-target essences that are not Perfect.
const CORRUPTED_ESSENCE_IDS: ReadonlySet<string> = new Set([
  "essence-of-delirium",
  "essence-of-horror",
  "essence-of-hysteria",
  "essence-of-insanity",
  "essence-of-the-abyss",
  "essence-of-the-breach",
]);

/** True for the exchange ids a Crystallisation omen acts on: every Perfect essence and the corrupted ones. */
export function isPerfectOrCorruptedEssence(exchangeId: string): boolean {
  return exchangeId.startsWith("perfect-essence-of-") || CORRUPTED_ESSENCE_IDS.has(exchangeId);
}

const CRYSTALLISATION_NOTES = [
  `a Crystallisation omen is consumed by ANY essence, Greater included (${S4}, single-source) — activate it right before the Perfect or Corrupted one`,
  "pick the essence whose guaranteed mod you want — read its actual mod first",
];

const CRAFTED_SIDE_UNKNOWN = `the item already has a crafted mod (one per item, ${KB} §7) — what a side-steered essence does when that mod is on the other side is not in the KB`;

/** KB §4 side mapping on a KB §7 remove-then-replace: removal restricted to `side`, write unchanged. */
function crystallise(side: "prefix" | "suffix") {
  return (s: ItemState): Verdict => {
    if (!isRare(s)) return null;
    const unverifiedBecause = s.jewel ? JEWEL_ESSENCE : s.slots.crafted > 0 ? CRAFTED_SIDE_UNKNOWN : undefined;
    return all([needMods(s, 1, side)], { pass: true, unverifiedBecause });
  };
}

const CRYSTALLISATION: MoveRule[] = [
  {
    id: "omen-sinistral-crystallisation",
    label: "Omen of Sinistral Crystallisation + Perfect Essence",
    family: "omen",
    materials: ["omenSinistralCrystallisation", RARE_ESSENCE],
    requires: "rare with a prefix",
    effect: "the Perfect or Corrupted Essence removes only a PREFIX, then writes its guaranteed mod into the crafted slot",
    notes: CRYSTALLISATION_NOTES,
    source: `${S4}; ${KB} §7`,
    verified: true,
    check: crystallise("prefix"),
  },
  {
    id: "omen-dextral-crystallisation",
    label: "Omen of Dextral Crystallisation + Perfect Essence",
    family: "omen",
    materials: ["omenDextralCrystallisation", RARE_ESSENCE],
    requires: "rare with a suffix",
    effect: "the Perfect or Corrupted Essence removes only a SUFFIX, then writes its guaranteed mod into the crafted slot",
    notes: CRYSTALLISATION_NOTES,
    source: `${S4}; ${KB} §7`,
    verified: true,
    check: crystallise("suffix"),
  },
];

export const OMEN_RULES: readonly MoveRule[] = [...EXALTATION, ...REMOVAL, ...CRYSTALLISATION];
