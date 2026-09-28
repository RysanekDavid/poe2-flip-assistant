import type { ItemState } from "./classify";
import { mat, KB, type MaterialSpec, type MoveMaterial, type MoveRule, type Verdict } from "./ruleTypes";
import type { MaterialKey } from "../../craftMaterials";
import { isRare } from "./rulePredicates";

/** Desecration: abyssal bones, the omens that steer them, Putrefaction and the reveal (KB §4, §5, §9). */

const S4 = `${KB} §4`;
const S5 = `${KB} §5`;

type BoneSlot = "Jawbone" | "Rib" | "Collarbone" | "Cranium";
type BoneTier = "gnawed" | "preserved" | "ancient";

const WEAPONS = new Set([
  "Claws", "Daggers", "Wands", "One Hand Swords", "One Hand Axes", "One Hand Maces", "Sceptres", "Spears", "Flails",
  "Bows", "Staves", "Two Hand Swords", "Two Hand Axes", "Two Hand Maces", "Quarterstaves", "Crossbows", "Talismans",
]);
const BODY_ARMOUR = new Set(["Gloves", "Boots", "Body Armours", "Helmets"]);
const OFF_HAND = new Set(["Shields", "Bucklers", "Foci"]);
const JEWELLERY = new Set(["Amulets", "Rings"]);

interface SlotMapping {
  slot: BoneSlot;
  unverifiedBecause?: string;
}

const TIME_LOST_DESECRATION = "the KB confirms desecration on regular rare jewels only, not Time-Lost ones";

/** KB §5: Jawbone = weapons/quivers, Rib = armour, Collarbone = amulet/ring/belt, Cranium = jewels. */
export function boneSlotOf(s: Pick<ItemState, "itemClass" | "timeLost">): SlotMapping | null {
  const itemClass = s.itemClass;
  if (itemClass == null) return null;
  if (WEAPONS.has(itemClass) || itemClass === "Quivers") return { slot: "Jawbone" };
  if (BODY_ARMOUR.has(itemClass)) return { slot: "Rib" };
  if (OFF_HAND.has(itemClass)) return { slot: "Rib", unverifiedBecause: "the KB maps Rib to 'armour' without naming shields, bucklers or foci" };
  if (JEWELLERY.has(itemClass) || itemClass === "Belts") return { slot: "Collarbone" };
  if (itemClass === "Jewels") return { slot: "Cranium", unverifiedBecause: s.timeLost ? TIME_LOST_DESECRATION : undefined };
  return null;
}

// Cranium exists only as Preserved (research 2026-09-29) — no Gnawed or Ancient move for jewels
const BONE_MATS: Record<BoneTier, Partial<Record<BoneSlot, MaterialKey>>> = {
  gnawed: { Jawbone: "gnawedJawbone", Rib: "gnawedRib", Collarbone: "gnawedCollarbone" },
  preserved: { Jawbone: "preservedJawbone", Rib: "preservedRib", Collarbone: "preservedCollarbone", Cranium: "preservedCranium" },
  ancient: { Jawbone: "ancientJawbone", Rib: "ancientRib", Collarbone: "ancientCollarbone" },
};

function boneMaterial(tier: BoneTier): MaterialSpec {
  return (s: ItemState): MoveMaterial => {
    const slot = boneSlotOf(s)?.slot;
    const key = slot ? BONE_MATS[tier][slot] : undefined;
    if (!key) throw new Error(`no ${tier} bone for class ${s.itemClass ?? "?"}`);
    return mat(key);
  };
}

/** The omen rules below are priced with a Preserved bone: the KB ties none of them to a bone tier. */
const PRESERVED_ASSUMPTION = "priced with a Preserved bone — the KB does not say which bone tiers the omen works with";

const boneLabel = (tier: BoneTier, slot: BoneSlot): string => `${tier[0]!.toUpperCase()}${tier.slice(1)} ${slot}`;

const ONE_DESECRATED = `already carries a desecrated mod — max ONE per item (${S5}); only Putrefaction replaces everything`;

/** Shared bone gate: rare, a mapped slot, a free desecrated slot, and the tier's item-level limit. */
function boneGate(s: ItemState, tier: BoneTier): { slot: SlotMapping } | { verdict: Verdict } {
  // bones are rare-only; a class/tier with no bone (Gnawed/Ancient Cranium) is simply not a move
  const slot = isRare(s) ? boneSlotOf(s) : null;
  if (!slot || !BONE_MATS[tier][slot.slot]) return { verdict: null };
  if (s.slots.desecrated > 0) return { verdict: { block: ONE_DESECRATED } };
  if (tier === "gnawed") {
    if (s.ilvl == null) return { verdict: { block: "item level unknown — Gnawed bones stop at ilvl 64" } };
    if (s.ilvl > 64) return { verdict: { block: `"Item Level is too high": ilvl ${s.ilvl} > 64 — use Preserved (${S5}, §9)` } };
  }
  return { slot };
}

function boneCheck(tier: BoneTier, labelPrefix = "") {
  return (s: ItemState): Verdict => {
    const gate = boneGate(s, tier);
    if ("verdict" in gate) return gate.verdict;
    const notes = s.openTotal === 0 ? [`full rare: the bone removes a random mod of the matching side and replaces it (${S5})`] : [];
    return { pass: true, label: `${labelPrefix}${boneLabel(tier, gate.slot.slot)}`, notes, unverifiedBecause: gate.slot.unverifiedBecause };
  };
}

const BONE_EFFECT = "adds one desecrated mod, unrevealed until the Well of Souls";

const BONES: MoveRule[] = (["gnawed", "preserved", "ancient"] as const).map((tier) => ({
  id: `bone-${tier}`,
  label: `${tier[0]!.toUpperCase()}${tier.slice(1)} bone`, // a legal move is relabelled with the class's bone
  family: "bone" as const,
  materials: [boneMaterial(tier)],
  requires: tier === "gnawed" ? "rare, item level ≤ 64, no desecrated mod yet" : "rare, no desecrated mod yet",
  effect: BONE_EFFECT,
  floor: tier === "ancient" ? 40 : undefined,
  notes: tier === "ancient" ? ["Ancient bones roll modifier level 40+"] : [],
  source: S5,
  verified: true,
  check: boneCheck(tier),
}));

/** KB §4: Liege is weapons + jewellery only; belts/quivers are plausible but not named. */
function liegeCheck(s: ItemState): Verdict {
  const cls = s.itemClass;
  if (cls == null) return null;
  const named = WEAPONS.has(cls) || JEWELLERY.has(cls);
  const plausible = cls === "Belts" || cls === "Quivers";
  if (!named && !plausible) return null;
  const base = boneCheck("preserved", "Omen of the Liege + ")(s);
  if (base == null || "block" in base || named) return base;
  return { ...base, unverifiedBecause: `the KB says "weapons + jewellery" without naming ${cls.toLowerCase()}` };
}

const STEERED: MoveRule[] = [
  ...(["sinistral", "dextral"] as const).map((dir) => ({
    id: `omen-${dir}-necromancy`,
    label: `Omen of ${dir === "sinistral" ? "Sinistral" : "Dextral"} Necromancy + bone`,
    family: "omen" as const,
    materials: [dir === "sinistral" ? "omenSinistralNecromancy" : "omenDextralNecromancy", boneMaterial("preserved")] as MaterialSpec[],
    requires: "rare, no desecrated mod yet",
    effect: `the desecrated mod lands on the ${dir === "sinistral" ? "PREFIX" : "SUFFIX"} side`,
    notes: ["Necromancy does NOT pair with Essence of the Abyss — that wants Crystallisation", PRESERVED_ASSUMPTION],
    source: S4,
    verified: true,
    check: boneCheck("preserved", `${dir === "sinistral" ? "Sinistral" : "Dextral"} Necromancy + `),
  })),
  {
    id: "omen-liege",
    label: "Omen of the Liege + bone",
    family: "omen",
    materials: ["omenTheLiege", boneMaterial("preserved")],
    requires: "rare weapon or jewellery, no desecrated mod yet",
    effect: "forces an Amanamu desecrated mod (blocks Ulaman / Kurgal)",
    notes: [PRESERVED_ASSUMPTION],
    source: S4,
    verified: true,
    check: liegeCheck,
  },
];

function putrefactionCheck(s: ItemState): Verdict {
  const slot = isRare(s) ? boneSlotOf(s) : null;
  if (!slot) return null;
  return { pass: true, label: `Omen of Putrefaction + ${boneLabel("preserved", slot.slot)}`, unverifiedBecause: slot.unverifiedBecause };
}

const FULL_REPLACE: MoveRule[] = [
  {
    id: "omen-putrefaction",
    label: "Omen of Putrefaction + bone",
    family: "omen",
    materials: ["omenPutrefaction", boneMaterial("preserved")],
    requires: "rare (the one-desecrated-mod limit does not apply)",
    effect: "replaces ALL mods with up to 6 unrevealed desecrated mods",
    warnings: [
      "CORRUPTS the item — add quality and sockets BEFORE",
      "every existing mod is wiped — never pay for good mods on a Putrefaction base",
    ],
    notes: ["desecrated prefix pools follow the base's defence type (ES base → ES-flavoured prefixes)", PRESERVED_ASSUMPTION],
    source: `${S4}; ${S5}; ${KB} §9`,
    verified: true,
    check: putrefactionCheck,
  },
  {
    id: "omen-abyssal-echoes",
    label: "Omen of Abyssal Echoes (at the reveal)",
    family: "omen",
    materials: ["omenAbyssalEchoes"],
    requires: "an unrevealed desecrated mod to reveal",
    effect: "ONE reroll of the three offered reveal options",
    notes: ["insurance, not an auto-best-pick — budget it on already-good items (TOP rule 12)"],
    source: S4,
    verified: true,
    check: (s) => (isRare(s) && s.slots.unrevealed > 0 ? { pass: true } : null),
  },
];

export const ABYSS_RULES: readonly MoveRule[] = [...BONES, ...STEERED, ...FULL_REPLACE];
