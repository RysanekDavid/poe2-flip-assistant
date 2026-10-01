import type { MaterialKey } from "../../craftMaterials";
import type { ItemState } from "./classify";
import { KB, KB_CURRENCY_CORE, type MoveRule, type Verdict } from "./ruleTypes";
import { all, floorNote, isMagic, isMagicOrRare, isNormal, isRare, lowIlvlWarning, needMods, needOpen, needRemovable, PASS } from "./rulePredicates";

/** Plain currency: transmute/aug/regal/alchemy/exalt/chaos/divine/annul/fracture (KB §1, §2). */

const S1 = `${KB} §1`;
const S2 = `${KB} §2`;
const CC1 = `${KB_CURRENCY_CORE} §1`;
const CC2 = `${KB_CURRENCY_CORE} §2`;
/** Alchemy / Annulment targets: entity-catalog item text (0.5.5b), quoted in both KBs. */
const CC_TARGETS = `${KB_CURRENCY_CORE} §1, §5`;

interface Tier {
  suffix: string;
  label: string;
  key: MaterialKey;
  floor?: number;
}

/** One rule per currency tier (base / Greater / Perfect) sharing everything but material + floor. */
function tiers(base: Omit<MoveRule, "id" | "label" | "materials" | "floor">, idBase: string, list: Tier[], floorVerified: boolean): MoveRule[] {
  return list.map((t) => ({
    ...base,
    id: `${idBase}${t.suffix}`,
    label: t.label,
    materials: [t.key],
    floor: t.floor,
    notes: [
      ...(base.notes ?? []),
      ...(t.floor != null ? [floorNote(t.floor)] : []),
      ...(t.floor != null && !floorVerified ? [`floor ${t.floor} is UNVERIFIED — the KB lists no surviving claim (${S1}); number from ${CC2}`] : []),
    ],
    verified: base.verified && (t.floor == null || floorVerified),
  }));
}

const onNormal = (s: ItemState): Verdict => (isNormal(s) ? PASS : null);
const onMagic = (s: ItemState): Verdict => (isMagic(s) ? PASS : null);

function augCheck(floor: number | null) {
  return (s: ItemState): Verdict =>
    isMagic(s) ? all([needOpen(s, "any")], { pass: true, warnings: floor == null ? [] : lowIlvlWarning(s, floor) }) : null;
}

const TRANSMUTE: MoveRule[] = tiers(
  {
    family: "currency",
    requires: "normal item",
    effect: "normal → magic with one random mod",
    notes: ["the Normal→Magic precondition is not in the verified KB (only the Greater/Perfect floors are, §1)"],
    source: CC1,
    verified: false,
    check: onNormal,
  },
  "transmute",
  [
    { suffix: "", label: "Orb of Transmutation", key: "transmute" },
    { suffix: "-greater", label: "Greater Orb of Transmutation", key: "greaterTransmute", floor: 44 },
    { suffix: "-perfect", label: "Perfect Orb of Transmutation", key: "perfectTransmute", floor: 70 },
  ],
  true,
);

const AUG: MoveRule[] = [
  { suffix: "", label: "Orb of Augmentation", key: "aug" as const, floor: undefined },
  { suffix: "-greater", label: "Greater Orb of Augmentation", key: "greaterAug" as const, floor: 44 },
  { suffix: "-perfect", label: "Perfect Orb of Augmentation", key: "perfectAug" as const, floor: 70 },
].flatMap((t) =>
  tiers(
    {
      family: "currency",
      requires: "magic item with an open affix",
      effect: "adds one random mod",
      source: S1,
      verified: true,
      check: augCheck(t.floor ?? null),
    },
    "aug",
    [t],
    true,
  ),
);

const REGAL: MoveRule[] = tiers(
  {
    family: "currency",
    requires: "magic item",
    effect: "magic → rare: keeps the existing mods and adds one",
    source: CC1,
    verified: false,
    check: onMagic,
  },
  "regal",
  [
    { suffix: "", label: "Regal Orb", key: "regal" },
    { suffix: "-greater", label: "Greater Regal Orb", key: "greaterRegal", floor: 35 },
    { suffix: "-perfect", label: "Perfect Regal Orb", key: "perfectRegal", floor: 50 },
  ],
  false,
);

const EXALT: MoveRule[] = tiers(
  {
    family: "currency",
    requires: "rare item with an open affix",
    effect: "adds one random mod — the only currency that fills an empty slot",
    source: `${S1}; TOP rule 8`,
    verified: true,
    check: (s) => (isRare(s) ? all([needOpen(s, "any")]) : null),
  },
  "exalt",
  [
    { suffix: "", label: "Exalted Orb", key: "exalted" },
    { suffix: "-greater", label: "Greater Exalted Orb", key: "greaterExalted", floor: 35 },
    { suffix: "-perfect", label: "Perfect Exalted Orb", key: "perfectExalted", floor: 50 },
  ],
  true,
);

const CHAOS: MoveRule[] = tiers(
  {
    family: "currency",
    requires: "rare item with at least one mod",
    effect: "removes ONE random existing mod and adds one new mod — not a full reroll",
    source: S1,
    verified: true,
    check: (s) => (isRare(s) ? all([needRemovable(s, 1)]) : null),
  },
  "chaos",
  [
    { suffix: "", label: "Chaos Orb", key: "chaos" },
    { suffix: "-greater", label: "Greater Chaos Orb", key: "greaterChaos", floor: 35 },
    { suffix: "-perfect", label: "Perfect Chaos Orb", key: "perfectChaos", floor: 50 },
  ],
  false,
);

function fractureCheck(s: ItemState): Verdict {
  if (!isRare(s)) return null;
  if (s.slots.fractured > 0) return { block: `already fractured — one fracture per item, ever (${S2})` };
  if (s.affixes.length < 4) {
    const why = s.unmatched.length > 0 ? " readable (an unreadable line might be the 4th)" : "";
    return { block: `needs at least 4 mods (desecrated count), has ${s.affixes.length}${why}` };
  }
  const notes = s.slots.desecrated > 0
    ? [`desecrated mods can't be fractured but count toward the 4 — the fracture lands on one of the other ${s.affixes.length - s.slots.desecrated} mods (${S2})`]
    : [];
  if (s.slots.unrevealed > 0) notes.push("whether an UNREVEALED desecrated mod counts like a revealed one is not in the KB");
  return { pass: true, notes };
}

/** Alchemy on a Magic item starts over: "Current modifiers are not retained" (currency-core §1). */
function alchemyCheck(s: ItemState): Verdict {
  if (isNormal(s)) return PASS;
  if (!isMagic(s)) return null;
  return { pass: true, warnings: [`throws the magic mods away — Alchemy makes a fresh 4-mod rare; Regal keeps them (${CC1})`] };
}

/** Divine has no rarity gate ("left click an item"); on a Normal item only the implicits can move. */
function divineCheck(s: ItemState): Verdict {
  if (isNormal(s)) {
    return {
      pass: true,
      notes: ["a normal item has no explicit mods — only its implicit values reroll"],
      unverifiedBecause: `Divine on a normal item is only in ${CC1}`,
    };
  }
  return all([needMods(s, 1)], { pass: true, notes: s.slots.fractured > 0 ? [`the fractured mod's values are Divine-proof (${S2})`] : [] });
}

const SINGLES: MoveRule[] = [
  {
    id: "alchemy",
    label: "Orb of Alchemy",
    family: "currency",
    materials: ["alch"],
    requires: "normal or magic item",
    effect: "normal or magic → rare with four random mods; a magic item's mods are discarded, not kept",
    source: `${S1}; ${CC_TARGETS}`,
    verified: true,
    check: alchemyCheck,
  },
  {
    id: "divine",
    label: "Divine Orb",
    family: "currency",
    materials: ["divine"],
    requires: "any item with mods to reroll — no rarity limit",
    effect: "rerolls the numeric values of ALL mods within their current tiers — cannot change tiers or target a subset",
    notes: [`only divine when every mod deserves a reroll (${KB} TOP rule 10)`],
    source: `${S1}; ${CC1}`,
    verified: true,
    check: divineCheck,
  },
  {
    id: "annul",
    label: "Orb of Annulment",
    family: "currency",
    materials: ["annul"],
    requires: "magic or rare item with at least one mod",
    effect: "removes one random existing mod",
    notes: [`Omen of Whittling does NOT work with Annulment (${KB} §4)`],
    source: `${S1}; ${CC_TARGETS}`,
    verified: true,
    check: (s) => (isMagicOrRare(s) ? all([needRemovable(s, 1)]) : null),
  },
  {
    id: "fracture",
    label: "Fracturing Orb",
    family: "currency",
    materials: ["fracturing"],
    requires: "rare, at least 4 mods (desecrated count), none fractured yet",
    effect: "permanently locks one random existing mod; its values become Divine-proof",
    warnings: ["one fracture per item, ever"],
    source: S2,
    verified: true,
    check: fractureCheck,
  },
];

export const CURRENCY_RULES: readonly MoveRule[] = [...TRANSMUTE, ...AUG, ...REGAL, ...EXALT, ...CHAOS, ...SINGLES];
