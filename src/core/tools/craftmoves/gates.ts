import { AFFIX_SIDES, comboFor, type AffixSide, type CatalogCombo, type CraftCatalog } from "./catalog";
import type { ItemState } from "./classify";
import { KB } from "./ruleTypes";

/**
 * Tier gates per eligible mod family: the best tier this item level can roll, and how many of the
 * reachable tiers each currency's floor cuts. Floors are SOFT (KB §1) — when every reachable tier
 * sits below a floor, the family's top reachable tier still rolls — so a cut reads "cannot roll
 * tiers below N", never "cannot roll this mod".
 */

export interface CurrencyFloor {
  id: string;
  label: string;
  floor: number;
  rarity: "Normal" | "Magic" | "Rare";
  source: string;
}

/** Only the KB-verified floors (§1). Greater/Perfect Regal & Chaos are UNVERIFIED there, so absent. */
export const VERIFIED_FLOORS: readonly CurrencyFloor[] = [
  { id: "greater-transmute", label: "Greater Transmutation", floor: 44, rarity: "Normal", source: `${KB} §1` },
  { id: "perfect-transmute", label: "Perfect Transmutation", floor: 70, rarity: "Normal", source: `${KB} §1` },
  { id: "greater-aug", label: "Greater Augmentation", floor: 44, rarity: "Magic", source: `${KB} §1` },
  { id: "perfect-aug", label: "Perfect Augmentation", floor: 70, rarity: "Magic", source: `${KB} §1` },
  { id: "greater-exalt", label: "Greater Exalted", floor: 35, rarity: "Rare", source: `${KB} §1` },
  { id: "perfect-exalt", label: "Perfect Exalted", floor: 50, rarity: "Rare", source: `${KB} §1` },
];

export interface FloorCut {
  currency: string;
  floor: number;
  /** Reachable tiers below the floor — the ones this currency cannot roll. */
  cutTiers: number;
  /** Every reachable tier is below the floor, so the soft-floor valve keeps the top reachable tier. */
  softFloor: boolean;
}

export interface TierRef {
  modId: string;
  level: number;
  rank: number;
  text: string;
}

export interface FamilyGate {
  family: string;
  side: AffixSide;
  tiers: number;
  reachable: number;
  /** Best tier at this item level (null: the lowest tier needs a higher ilvl). */
  topReachable: TierRef | null;
  /** Best tier in the game — its level is the item level it needs. */
  best: TierRef;
  present: boolean;
  floors: FloorCut[];
  /** The KB §3 row this family's gate is cross-checked against, when there is one. */
  kbRow: string | null;
}

/** KB §3 gate examples, cross-checked against the catalog by test:tools:craft-moves. */
export interface KbGateExample {
  itemClass: string;
  family: string;
  /** Verbatim KB §3 table rows (prefix of the line) — the test asserts the KB still says this. */
  kbRows: string[];
  /** From the top: 0 = best tier. `min`/`max` = the tier's roll range where the KB states it. */
  expect: Array<{ fromTop: number; level: number; min?: number; max?: number }>;
  tiers?: number;
}

const RES_ROW = "| Fire/Cold/Light res (T1, +41–45%) | of Tzteosh/Haast/Ephij | **82** |";
const RES_T2_ROW = "| Ele res T2 (+36–40%) | of Magma etc. | **71** |";
const RES_EXPECT = [{ fromTop: 0, level: 82, min: 41, max: 45 }, { fromTop: 1, level: 71, min: 36, max: 40 }];
const ATTACK_ROW = "| Ring flat fire/cold/light to Attacks | T1 @ **75** (9 tiers) |";

export const KB_GATE_EXAMPLES: readonly KbGateExample[] = [
  { itemClass: "Rings", family: "FireResistance", kbRows: [RES_ROW, RES_T2_ROW], expect: RES_EXPECT },
  { itemClass: "Rings", family: "ColdResistance", kbRows: [RES_ROW, RES_T2_ROW], expect: RES_EXPECT },
  { itemClass: "Rings", family: "LightningResistance", kbRows: [RES_ROW, RES_T2_ROW], expect: RES_EXPECT },
  {
    itemClass: "Rings",
    family: "ChaosResistance",
    kbRows: ["| Chaos res top (+24–27%, of Bameth) | 6 tiers, ~5.3× rarer than ele res | **81** |"],
    expect: [{ fromTop: 0, level: 81, min: 24, max: 27 }],
    tiers: 6,
  },
  {
    itemClass: "Boots",
    family: "MovementVelocity",
    kbRows: ["| Boots % Movement Speed | T1 35% @ **82**, T2 30% @ **65**, T3 25% @ 46 |"],
    expect: [
      { fromTop: 0, level: 82, min: 35, max: 35 },
      { fromTop: 1, level: 65, min: 30, max: 30 },
      { fromTop: 2, level: 46, min: 25, max: 25 },
    ],
  },
  { itemClass: "Rings", family: "FireDamage", kbRows: [ATTACK_ROW], expect: [{ fromTop: 0, level: 75 }], tiers: 9 },
  { itemClass: "Rings", family: "ColdDamage", kbRows: [ATTACK_ROW], expect: [{ fromTop: 0, level: 75 }], tiers: 9 },
  { itemClass: "Rings", family: "LightningDamage", kbRows: [ATTACK_ROW], expect: [{ fromTop: 0, level: 75 }], tiers: 9 },
];

function tierRefs(cat: CraftCatalog, tiers: Record<string, number>): TierRef[] {
  return Object.entries(tiers)
    .sort((a, b) => a[1] - b[1])
    .map(([modId, level], i) => ({ modId, level, rank: i + 1, text: cat.mods[modId]?.text ?? modId }));
}

function floorCuts(reachable: TierRef[], floors: readonly CurrencyFloor[]): FloorCut[] {
  return floors.map((f) => {
    const cut = reachable.filter((t) => t.level < f.floor).length;
    return { currency: f.label, floor: f.floor, cutTiers: cut, softFloor: reachable.length > 0 && cut === reachable.length };
  });
}

function kbRowFor(itemClass: string, family: string): string | null {
  return KB_GATE_EXAMPLES.find((e) => e.itemClass === itemClass && e.family === family)?.kbRows.join(" / ") ?? null;
}

/** The KB-verified floors that apply to a currency tier used on an item of this rarity. */
export function floorsFor(rarity: string): CurrencyFloor[] {
  return VERIFIED_FLOORS.filter((f) => f.rarity === rarity);
}

export interface FamilyGateOpts {
  itemClass: string;
  /** null = unknown item level: every tier counts as reachable. */
  ilvl: number | null;
  /** Families already on the item (sorted first); the mod pool browser passes an empty set. */
  present: ReadonlySet<string>;
  floors: readonly CurrencyFloor[];
}

/** Gates for every prefix/suffix family a base combo can roll; present families first. */
export function familyGates(combo: CatalogCombo, cat: CraftCatalog, opts: FamilyGateOpts): FamilyGate[] {
  const { ilvl } = opts;
  const out: FamilyGate[] = [];
  for (const side of AFFIX_SIDES) {
    for (const [family, tiers] of Object.entries(combo[side])) {
      const refs = tierRefs(cat, tiers);
      const best = refs[refs.length - 1];
      if (!best) continue;
      const reachable = ilvl == null ? refs : refs.filter((t) => t.level <= ilvl);
      out.push({
        family,
        side,
        tiers: refs.length,
        reachable: reachable.length,
        topReachable: reachable[reachable.length - 1] ?? null,
        best,
        present: opts.present.has(family),
        floors: floorCuts(reachable, opts.floors),
        kbRow: kbRowFor(opts.itemClass, family),
      });
    }
  }
  return out.sort((a, b) => Number(b.present) - Number(a.present) || a.side.localeCompare(b.side) || a.family.localeCompare(b.family));
}

/** Gates for a classified item: its base's families, with the ones it already carries first. */
export function tierGates(state: ItemState, cat: CraftCatalog): FamilyGate[] {
  if (!state.itemClass || !state.baseType) return [];
  const combo = comboFor(cat, state.itemClass, state.baseType);
  if (!combo) return [];
  const present = new Set(state.affixes.map((a) => a.family).filter((f): f is string => f != null));
  return familyGates(combo, cat, { itemClass: state.itemClass, ilvl: state.ilvl, present, floors: floorsFor(state.rarity) });
}
