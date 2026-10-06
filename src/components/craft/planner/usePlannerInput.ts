"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlannerCatalog, PlannerPool } from "../../../lib/tools/craftPlannerContract";
import { carryQuality, emptySlots, findFamily, NO_POOLS, refitSlots, type ItemClass, type PlannerInput, type Pools, type Side, type SidePool, type SlotPick, type StartInput } from "./plannerModel";
import { DEFAULT_START, poolFromSide, withPool, withSlots } from "./plannerStartModel";

/** The input item's state: base, item level, the slot picks, the mod pools and the plan options. */

export interface PlannerExample {
  label: string;
  title: string;
  itemClass: ItemClass;
  base: string;
  ilvl: number;
  picks: SlotPick[];
  pools?: Pools;
}

const pick = (family: string, side: Side, source: SlotPick["source"], minModId: string, fractured = false): SlotPick => ({ family, side, source, minModId, fractured });
const flat = (family: string, id: string) => pick(family, "prefix", "natural", id);
const res = (family: string, id: string) => pick(family, "suffix", "natural", id);

/** The planner's golden plans (src/scripts/tools/plannerFixtures.ts) as one-click examples. */
export const PLANNER_EXAMPLES: readonly PlannerExample[] = [
  {
    label: "Breach Ring mana stacker",
    title: "top-tier flat mana, essence % mana, Amanamu minion damage, two resistances",
    itemClass: "Rings",
    base: "Breach Ring",
    ilvl: 82,
    picks: [
      pick("IncreasedMana", "prefix", "natural", "IncreasedMana12"),
      pick("MaximumManaIncreasePercent", "prefix", "essence", "EssenceIncreasedManaPercent1"),
      pick("IncreasedMinionDamageIfYouHitEnemy", "prefix", "desecrated", "AbyssModRingAmuletAmanamuPrefixMinionDamageIfYou'veHitRecently"),
      pick("FireResistance", "suffix", "natural", "FireResist7"),
      pick("ColdResistance", "suffix", "natural", "ColdResist7"),
    ],
  },
  {
    label: "Breach Ring: any 3 attack flats",
    title: "any 3 of the cold, fire, lightning and physical attack flats (tier 7+ of 9: the top three tiers) and any 2 resistances",
    itemClass: "Rings",
    base: "Breach Ring",
    ilvl: 82,
    picks: [],
    pools: {
      prefix: { need: 3, candidates: [flat("ColdDamage", "AddedColdDamage7"), flat("FireDamage", "AddedFireDamage7"), flat("LightningDamage", "AddedLightningDamage7"), flat("PhysicalDamage", "AddedPhysicalDamage7")] },
      suffix: { need: 2, candidates: [res("FireResistance", "FireResist7"), res("ColdResistance", "ColdResist7"), res("LightningResistance", "LightningResist7"), res("AllResistances", "AllResistances4")] },
    },
  },
  {
    label: "Fractured +3 amulet",
    title: "fractured +3 to Level of all Spell Skills and rarity on a Stellar Amulet",
    itemClass: "Amulets",
    base: "Stellar Amulet",
    ilvl: 82,
    picks: [pick("GlobalIncreaseSpellSkillGemLevel", "suffix", "natural", "GlobalSpellGemsLevel3", true), pick("ItemFoundRarityIncrease", "suffix", "natural", "ItemFoundRarityIncrease3")],
  },
];

const DEFAULT = { itemClass: "Rings" as ItemClass, base: "Breach Ring", ilvl: 82 };

function baseOf(catalog: PlannerCatalog, itemClass: ItemClass, base: string) {
  const b = catalog.classes.find((c) => c.itemClass === itemClass)?.bases.find((x) => x.name === base);
  if (!b) throw new Error(`planner: base ${base} is not in the ${itemClass} catalog`);
  return b;
}

const capsOf = (catalog: PlannerCatalog, itemClass: ItemClass, base: string) => baseOf(catalog, itemClass, base).caps;
const capOf = (caps: { p: number; s: number }, side: Side) => (side === "prefix" ? caps.p : caps.s);

function initial(catalog: PlannerCatalog): PlannerInput {
  const cls = catalog.classes.find((c) => c.itemClass === DEFAULT.itemClass) ?? catalog.classes[0];
  const base = cls?.bases.find((b) => b.name === DEFAULT.base) ?? cls?.bases[0];
  if (!cls || !base) throw new Error("planner: the catalog has no bases");
  return { itemClass: cls.itemClass, base: base.name, ilvl: DEFAULT.ilvl, slots: emptySlots(base.caps), includeUnverified: false, quality: null, pools: NO_POOLS, start: DEFAULT_START };
}

function withPicks(caps: { p: number; s: number }, list: readonly SlotPick[], pools: Pools) {
  const slots = emptySlots({ p: caps.p - (pools.prefix?.need ?? 0), s: caps.s - (pools.suffix?.need ?? 0) });
  const side = (s: Side) => [...list.filter((x) => x.side === s), ...slots[s]].slice(0, slots[s].length);
  return { prefix: side("prefix"), suffix: side("suffix") };
}

/** A new base of the same class keeps what fits: pools clamp to the new caps, slots refit around them. */
function rebase(cur: PlannerInput, caps: { p: number; s: number }): PlannerInput {
  let next: PlannerInput = { ...cur, slots: refitSlots(cur.slots, caps) };
  for (const side of ["prefix", "suffix"] as const) if (cur.pools[side]) next = withPool(next, side, cur.pools[side], capOf(caps, side));
  return next;
}

export function usePlannerInput(catalog: PlannerCatalog) {
  const [input, setInput] = useState<PlannerInput>(() => initial(catalog));
  const pickBase = useCallback(
    (itemClass: ItemClass, base: string) =>
      setInput((cur) => {
        const b = baseOf(catalog, itemClass, base);
        // another class rolls other families: start clean; the same class keeps what still fits
        if (cur.itemClass !== itemClass) return { ...cur, itemClass, base, slots: emptySlots(b.caps), pools: NO_POOLS, quality: null, start: { ...cur.start, carried: [] } };
        return { ...rebase(cur, b.caps), itemClass, base, quality: carryQuality(cur.quality, b.qualityCap) };
      }),
    [catalog],
  );
  const setSlot = useCallback(
    (side: Side, i: number, value: SlotPick | null) => setInput((cur) => withSlots(cur, { ...cur.slots, [side]: cur.slots[side].map((x, k) => (k === i ? value : x)) })),
    [],
  );
  const setIlvl = useCallback((ilvl: number) => setInput((cur) => ({ ...cur, ilvl })), []);
  const setSlots = useCallback((slots: PlannerInput["slots"]) => setInput((cur) => withSlots(cur, slots)), []);
  const setOptions = useCallback((patch: Partial<Pick<PlannerInput, "includeUnverified" | "quality">>) => setInput((cur) => ({ ...cur, ...patch })), []);
  // the player touching the start answers the note
  const setStart = useCallback((patch: Partial<StartInput>) => setInput((cur) => ({ ...cur, start: { ...cur.start, note: null, ...patch } })), []);
  const setPool = useCallback(
    (side: Side, pool: SidePool | "from-side" | null) =>
      setInput((cur) => withPool(cur, side, pool === "from-side" ? poolFromSide(cur.slots, side) : pool, capOf(capsOf(catalog, cur.itemClass, cur.base), side))),
    [catalog],
  );
  const applyExample = useCallback(
    (ex: PlannerExample) =>
      setInput((cur) => {
        const pools = ex.pools ?? NO_POOLS;
        return { ...cur, itemClass: ex.itemClass, base: ex.base, ilvl: ex.ilvl, quality: null, pools, start: { ...cur.start, carried: [] }, slots: withPicks(capsOf(catalog, ex.itemClass, ex.base), ex.picks, pools) };
      }),
    [catalog],
  );
  return { input, pickBase, setSlot, setSlots, setIlvl, setOptions, setStart, setPool, applyExample };
}

/** A pick (or pool candidate) the new base can't carry (another base of the class rolls other families) is dropped. */
export function usePrunePicks(input: PlannerInput, pool: PlannerPool | null, setSlot: (side: Side, i: number, v: SlotPick | null) => void, setPool: (side: Side, p: SidePool | null) => void): void {
  useEffect(() => {
    if (!pool || pool.base !== input.base) return;
    for (const side of ["prefix", "suffix"] as const) {
      input.slots[side].forEach((p, i) => {
        if (p && !findFamily(pool, p)) setSlot(side, i, null);
      });
      const sp = input.pools[side];
      if (sp && sp.candidates.some((c) => !findFamily(pool, c))) setPool(side, { ...sp, candidates: sp.candidates.filter((c) => findFamily(pool, c)) });
    }
  }, [pool, input.base, input.slots, input.pools, setSlot, setPool]);
}
