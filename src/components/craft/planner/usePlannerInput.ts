"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlannerCatalog, PlannerPool } from "../../../lib/tools/craftPlannerContract";
import { emptySlots, findFamily, refitSlots, type ItemClass, type PlannerInput, type Side, type SlotPick } from "./plannerModel";

/** The input item's state: base, item level, the slot picks and the plan options. */

export interface PlannerExample {
  label: string;
  title: string;
  itemClass: ItemClass;
  base: string;
  ilvl: number;
  picks: SlotPick[];
}

const pick = (family: string, side: Side, source: SlotPick["source"], minModId: string, fractured = false): SlotPick => ({ family, side, source, minModId, fractured });

/** The planner's golden plans (src/scripts/tools/plannerFixtures.ts) as one-click examples. */
export const PLANNER_EXAMPLES: readonly PlannerExample[] = [
  {
    label: "Breach Ring mana stacker",
    title: "T1 flat mana, essence % mana, Amanamu minion damage, two resistances",
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
    label: "Fractured +3 amulet",
    title: "fractured +3 to Level of all Spell Skills and rarity on a Stellar Amulet",
    itemClass: "Amulets",
    base: "Stellar Amulet",
    ilvl: 82,
    picks: [pick("GlobalIncreaseSpellSkillGemLevel", "suffix", "natural", "GlobalSpellGemsLevel3", true), pick("ItemFoundRarityIncrease", "suffix", "natural", "ItemFoundRarityIncrease3")],
  },
];

const DEFAULT = { itemClass: "Rings" as ItemClass, base: "Breach Ring", ilvl: 82 };

function capsOf(catalog: PlannerCatalog, itemClass: ItemClass, base: string): { p: number; s: number } {
  const b = catalog.classes.find((c) => c.itemClass === itemClass)?.bases.find((x) => x.name === base);
  if (!b) throw new Error(`planner: base ${base} is not in the ${itemClass} catalog`);
  return b.caps;
}

function initial(catalog: PlannerCatalog): PlannerInput {
  const cls = catalog.classes.find((c) => c.itemClass === DEFAULT.itemClass) ?? catalog.classes[0];
  const base = cls?.bases.find((b) => b.name === DEFAULT.base) ?? cls?.bases[0];
  if (!cls || !base) throw new Error("planner: the catalog has no bases");
  return { itemClass: cls.itemClass, base: base.name, ilvl: DEFAULT.ilvl, slots: emptySlots(base.caps), includeUnverified: false, quality: null };
}

function withPicks(caps: { p: number; s: number }, list: readonly SlotPick[]) {
  const slots = emptySlots(caps);
  const side = (s: Side) => [...list.filter((x) => x.side === s), ...slots[s]].slice(0, s === "prefix" ? caps.p : caps.s);
  return { prefix: side("prefix"), suffix: side("suffix") };
}

export function usePlannerInput(catalog: PlannerCatalog) {
  const [input, setInput] = useState<PlannerInput>(() => initial(catalog));
  const pickBase = useCallback(
    (itemClass: ItemClass, base: string) =>
      setInput((cur) => {
        const caps = capsOf(catalog, itemClass, base);
        // another class rolls other families: start clean; the same class keeps what still fits
        const slots = cur.itemClass === itemClass ? refitSlots(cur.slots, caps) : emptySlots(caps);
        return { ...cur, itemClass, base, slots, quality: cur.itemClass === itemClass ? cur.quality : null };
      }),
    [catalog],
  );
  const setSlot = useCallback(
    (side: Side, i: number, value: SlotPick | null) =>
      setInput((cur) => ({ ...cur, slots: { ...cur.slots, [side]: cur.slots[side].map((x, k) => (k === i ? value : x)) } })),
    [],
  );
  const setIlvl = useCallback((ilvl: number) => setInput((cur) => ({ ...cur, ilvl })), []);
  const setOptions = useCallback((patch: Partial<Pick<PlannerInput, "includeUnverified" | "quality">>) => setInput((cur) => ({ ...cur, ...patch })), []);
  const applyExample = useCallback(
    (ex: PlannerExample) =>
      setInput((cur) => ({ ...cur, itemClass: ex.itemClass, base: ex.base, ilvl: ex.ilvl, quality: null, slots: withPicks(capsOf(catalog, ex.itemClass, ex.base), ex.picks) })),
    [catalog],
  );
  return { input, pickBase, setSlot, setIlvl, setOptions, applyExample };
}

/** A pick the new base can't carry (another base of the class rolls other families) is dropped. */
export function usePrunePicks(input: PlannerInput, pool: PlannerPool | null, setSlot: (side: Side, i: number, v: SlotPick | null) => void): void {
  useEffect(() => {
    if (!pool || pool.base !== input.base) return;
    for (const side of ["prefix", "suffix"] as const) {
      input.slots[side].forEach((p, i) => {
        if (p && !findFamily(pool, p)) setSlot(side, i, null);
      });
    }
  }, [pool, input.base, input.slots, setSlot]);
}
