import type { ItemState } from "./classify";
import { KB, KB_CURRENCY_CORE, type MoveRule, type Verdict } from "./ruleTypes";
import { all, isRare, needMods, needOpen, whittlingTarget } from "./rulePredicates";

/** Omens riding an Exalted / Chaos / Annulment click (KB §1, §4, §8). */

const S4 = `${KB} §4`;

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
    requires: "rare with a prefix",
    effect: "the Annulment removes a PREFIX",
    notes: [`the side mapping is KB-confirmed (§4); Annulment's own behaviour is only in ${KB_CURRENCY_CORE} §5`],
    source: `${S4}; ${KB_CURRENCY_CORE} §5`,
    verified: false,
    check: (s) => (isRare(s) ? all([needMods(s, 1, "prefix")]) : null),
  },
  {
    id: "omen-dextral-annulment",
    label: "Omen of Dextral Annulment + Orb of Annulment",
    family: "omen",
    materials: ["omenDextralAnnulment", "annul"],
    requires: "rare with a suffix",
    effect: "the Annulment removes a SUFFIX",
    notes: [`the side mapping is KB-confirmed (§4); Annulment's own behaviour is only in ${KB_CURRENCY_CORE} §5`],
    source: `${S4}; ${KB_CURRENCY_CORE} §5`,
    verified: false,
    check: (s) => (isRare(s) ? all([needMods(s, 1, "suffix")]) : null),
  },
];

export const OMEN_RULES: readonly MoveRule[] = [...EXALTATION, ...REMOVAL];
