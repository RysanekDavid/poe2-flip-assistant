import type { BandView, PlanRequest, PlanResponse } from "../../../lib/tools/craftPlannerContract";
import type { BaseLinkRequest } from "../../../lib/tools/craftPlannerContractStart";
import { compactNames } from "../../../lib/tools/modNames";
import {
  genericText,
  picks,
  poolReady,
  targetIndex,
  toRequest,
  type CarriedPick,
  type PlannerInput,
  type PoolFamily,
  type Pools,
  type SidePool,
  type Side,
  type SlotPick,
  type Slots,
  type StartInput,
} from "./plannerModel";

/**
 * Pure model of the two P1 inputs: mod pools ("any k of these n") per side, and where the plan
 * starts (let the planner compare / a clean base / a base the player buys carrying wanted mods).
 * The base price never goes to the server: it only adds to a total, so typing it never re-plans.
 */

export const DEFAULT_START: StartInput = { mode: "compare", carried: [], fractured: true, askDiv: null, note: null };

export const CARRIED_CLEARED_NOTE = "A mod you picked for the bought base left the item: pick again, or leave none and the planner chooses.";

/** The same wanted mod in a slot: a tier change keeps it, another family (or source) is another mod. */
const sameMod = (a: SlotPick | null | undefined, b: SlotPick | null | undefined): boolean => a != null && b != null && a.family === b.family && a.side === b.side && a.source === b.source;

/**
 * The item with new slot picks. A carried pick whose slot emptied or now holds another mod is
 * dropped (left in, it would point at nothing and the planner would quietly pick its own mod), and
 * the start says so.
 */
export function withSlots(input: PlannerInput, slots: Slots): PlannerInput {
  const kept = input.start.carried.filter((c) => c.kind === "pool" || sameMod(input.slots[c.side][c.slot], slots[c.side][c.slot]));
  const dropped = kept.length < input.start.carried.length;
  return { ...input, slots, start: dropped ? { ...input.start, carried: kept, note: CARRIED_CLEARED_NOTE } : input.start };
}

/**
 * The item with a side's pool set (or cleared): the side's single-mod slots shrink to what the pool
 * leaves (cap − need), keeping what still fits; turning a pool on moves the side's ordinary picks in
 * as its first candidates. A carried choice that pointed at a moved slot is dropped.
 */
export function withPool(input: PlannerInput, side: Side, pool: SidePool | null, cap: number): PlannerInput {
  const need = pool ? Math.max(1, Math.min(pool.need, cap, Math.max(pool.candidates.length, 1))) : 0;
  const next = pool ? { ...pool, need } : null;
  const kept = input.slots[side].filter((x): x is SlotPick => x != null && !next?.candidates.some((c) => c.family === x.family)).slice(0, cap - need);
  const list = [...kept, ...Array.from({ length: cap - need - kept.length }, () => null)];
  return { ...input, slots: { ...input.slots, [side]: list }, pools: { ...input.pools, [side]: next }, start: { ...input.start, carried: [] } };
}

/** Pool mode on: the side's ordinary picks become the first candidates ("any of these"), needing as many as there were. */
export function poolFromSide(slots: Slots, side: Side): SidePool {
  const natural = slots[side].filter((x): x is SlotPick => x != null && x.source === "natural").map((x) => ({ ...x, fractured: false }));
  return { candidates: natural, need: Math.max(1, natural.length) };
}

/** Why the pools can't be planned yet (empty = fine). */
export function poolProblems(pools: Pools): string[] {
  return (["prefix", "suffix"] as const).flatMap((side) => {
    const p = pools[side];
    if (!p) return [];
    if (p.candidates.length < 2) return [`the ${side} pool needs at least two mods`];
    return p.need > p.candidates.length ? [`the ${side} pool needs more mods than it holds`] : [];
  });
}

/**
 * What "Plan it" sends: the primary plan (clean when comparing, else the chosen start) and, when
 * comparing, the bought-base plan with the planner's own pick of what the base carries.
 */
export function requestsFor(input: PlannerInput): { primary: PlanRequest; bought: PlanRequest | null } {
  const base = toRequest(input);
  const s = input.start;
  if (s.mode === "clean") return { primary: base, bought: null };
  if (s.mode === "bought") return { primary: { ...base, start: boughtStart(input.slots, input.pools, s) }, bought: null };
  return { primary: base, bought: { ...base, start: { kind: "bought", carried: null, askDiv: null } } };
}

/** The request index of a pool's first slot: single targets come first, then the prefix pool's slots, then the suffix pool's. */
export function poolSlot0(slots: Slots, pools: Pools, side: Side): number {
  const singles = picks(slots).length;
  return side === "prefix" ? singles : singles + (poolReady(pools.prefix) ? pools.prefix.need : 0);
}

/** A carried pick → the request's slot index (null when it no longer points at anything). */
export function carriedRef(slots: Slots, pools: Pools, c: CarriedPick): number | null {
  if (c.kind === "slot") return targetIndex(slots, c.side, c.slot);
  return poolReady(pools[c.side]) ? poolSlot0(slots, pools, c.side) : null;
}

/** The bought start as the server takes it: the player's chips, or the planner's own pick when none are set. */
export function boughtStart(slots: Slots, pools: Pools, s: StartInput): NonNullable<PlanRequest["start"]> {
  const refs = s.carried.map((c) => carriedRef(slots, pools, c)).filter((r): r is number => r != null);
  return { kind: "bought", carried: refs.length === 0 ? null : refs.map((ref) => ({ ref, fractured: s.fractured })), askDiv: null };
}

/** Materials + the bases bought at the player's price; null until both are known. */
export function totalWithBase(plan: Pick<PlanResponse, "totals" | "start">, askDiv: number | null): BandView | null {
  const t = plan.totals.div;
  if (plan.start.kind !== "bought" || !t || askDiv == null) return null;
  const b = plan.start.buys;
  return { point: t.point + b.point * askDiv, low: t.low + b.low * askDiv, high: t.high + b.high * askDiv };
}

/** A plan's total counts the base: only a bought plan with the player's price entered (a clean plan's bill never prices its base). */
export const totalIncludesBase = (plan: Pick<PlanResponse, "totals" | "start">, askDiv: number | null): boolean => totalWithBase(plan, askDiv) != null;

/**
 * Which compare card earns the "cheaper" badge: only when BOTH totals count the base — a clean
 * total without its base against a bought total with it would favour the clean plan by the price.
 */
export function cheaperPlan(primary: Pick<PlanResponse, "totals" | "start"> | null, bought: Pick<PlanResponse, "totals" | "start"> | null, askDiv: number | null): "primary" | "bought" | null {
  if (!primary || !bought || !totalIncludesBase(primary, askDiv) || !totalIncludesBase(bought, askDiv)) return null;
  const tp = totalWithBase(primary, askDiv)!.point;
  const tb = totalWithBase(bought, askDiv)!.point;
  return tp < tb ? "primary" : tb < tp ? "bought" : null;
}

/** The trade search body for a plan's bought base (what the base-link route takes). */
export function baseLinkRequest(plan: PlanResponse): BaseLinkRequest | null {
  if (plan.start.kind !== "bought") return null;
  return { itemClass: plan.base.itemClass, base: plan.base.name, ilvl: plan.base.ilvl, rarity: plan.start.rarity, carried: plan.start.carried.map((c) => ({ modIds: c.modIds, fractured: c.fractured })) };
}

/** A short name for a chip: "Adds # to # Cold damage to Attacks" for a slot, "any of the 4 prefix pool mods" for a pool. */
export function carriedLabel(slots: Slots, pools: Pools, c: CarriedPick, familyText: (p: SlotPick) => string): string {
  if (c.kind === "pool") return `any of the ${pools[c.side]?.candidates.length ?? 0} ${c.side} pool mods`;
  const pick = slots[c.side][c.slot];
  return pick ? familyText(pick) : "(empty slot)";
}

export { compactNames };

/** Pool rows read "any of: Adds # to # Cold · Fire · … damage to Attacks" (family names, the minimum tier is on the chips). */
export function poolRowText(pool: SidePool, familyOf: (p: SlotPick) => PoolFamily | null): string {
  const names = pool.candidates.map((c) => {
    const f = familyOf(c);
    const best = f?.tiers.find((t) => t.modId === c.minModId)?.text ?? c.minModId;
    return genericText(best.split("\n")[0] ?? best);
  });
  return `any of: ${compactNames(names)}`;
}

/** A carried mod of a plan's bought base, short: its family name, or the pool's names in one line. */
export function carriedText(plan: PlanResponse, ref: number): string {
  const t = plan.targets[ref];
  if (!t) return "";
  const names = (t.candidates.length > 0 ? t.candidates.map((c) => c.text) : [t.text]).map((x) => genericText(x.split("\n")[0] ?? x));
  return t.candidates.length > 0 ? `one of ${compactNames(names)}` : (names[0] ?? "");
}
