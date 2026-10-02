import type { BandView, PlannerCatalog, PlannerPool, PlanRequest, PlanResponse } from "../../../lib/tools/craftPlannerContract";

/**
 * Pure model of the planner's input item: the base, its slot caps and what the player put in each
 * slot. No React, no fetch — the tooltip, the picker and the request builder all read it.
 */

export type Side = "prefix" | "suffix";
export type PoolFamily = PlannerPool["families"][number];
export type PoolTier = PoolFamily["tiers"][number];
export type CatalogBase = PlannerCatalog["classes"][number]["bases"][number];
export type ItemClass = PlannerCatalog["classes"][number]["itemClass"];

/** One filled slot: a family and the minimum tier the player accepts (better tiers count too). */
export interface SlotPick {
  family: string;
  side: Side;
  source: PoolFamily["source"];
  minModId: string;
  fractured: boolean;
}

export interface Slots {
  prefix: readonly (SlotPick | null)[];
  suffix: readonly (SlotPick | null)[];
}

export const emptySlots = (caps: { p: number; s: number }): Slots => ({
  prefix: Array.from({ length: caps.p }, () => null),
  suffix: Array.from({ length: caps.s }, () => null),
});

/** Keep what still fits when the caps change (a Dusk Ring has 4 prefixes, a Ruby Ring 3). */
export function refitSlots(slots: Slots, caps: { p: number; s: number }): Slots {
  const fit = (list: readonly (SlotPick | null)[], n: number) => {
    const kept = list.filter((x): x is SlotPick => x != null).slice(0, n);
    return [...kept, ...Array.from({ length: n - kept.length }, () => null)];
  };
  return { prefix: fit(slots.prefix, caps.p), suffix: fit(slots.suffix, caps.s) };
}

export const picks = (slots: Slots): SlotPick[] => [...slots.prefix, ...slots.suffix].filter((x): x is SlotPick => x != null);

/** "+(165-179) to maximum Mana" → "+# to maximum Mana": the family's name as trade sites write it. */
export const genericText = (text: string): string => text.replace(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)|-?\d+(?:\.\d+)?/g, "#");

export interface TierInfo {
  tier: PoolTier;
  /** In-game numbering counts up: the highest number is the best tier. */
  k: number;
  n: number;
}

export function tierOf(family: PoolFamily, modId: string): TierInfo | null {
  const i = family.tiers.findIndex((t) => t.modId === modId);
  const tier = family.tiers[i];
  return tier ? { tier, k: i + 1, n: family.tiers.length } : null;
}

export const familyKey = (f: { family: string; side: Side; source: string }): string => `${f.side}|${f.source}|${f.family}`;

export function findFamily(pool: PlannerPool, pick: SlotPick): PoolFamily | null {
  return pool.families.find((f) => familyKey(f) === familyKey(pick)) ?? null;
}

/** The best tier this item level can roll (tiers are sorted by level, ascending). */
export function bestReachable(family: PoolFamily, ilvl: number): PoolTier | null {
  return [...family.tiers].reverse().find((t) => t.level <= ilvl) ?? null;
}

export interface LiveCheck {
  p: { used: number; cap: number };
  s: { used: number; cap: number };
  crafted: number;
  desecrated: number;
  fractured: number;
  /** Picks whose minimum tier needs a higher item level than chosen. */
  ilvlShort: Array<{ pick: SlotPick; needs: number }>;
}

/** What the client can say before asking the server: slot counts, one-of limits, item-level gates. */
export function liveCheck(slots: Slots, caps: { p: number; s: number }, ilvl: number, pool: PlannerPool | null): LiveCheck {
  const all = picks(slots);
  const ilvlShort = pool
    ? all.flatMap((pick) => {
        const fam = findFamily(pool, pick);
        const t = fam ? tierOf(fam, pick.minModId) : null;
        return t && t.tier.level > ilvl ? [{ pick, needs: t.tier.level }] : [];
      })
    : [];
  return {
    p: { used: slots.prefix.filter(Boolean).length, cap: caps.p },
    s: { used: slots.suffix.filter(Boolean).length, cap: caps.s },
    crafted: all.filter((x) => x.source === "essence").length,
    desecrated: all.filter((x) => x.source === "desecrated").length,
    fractured: all.filter((x) => x.fractured).length,
    ilvlShort,
  };
}

export interface PlannerInput {
  itemClass: ItemClass;
  base: string;
  ilvl: number;
  slots: Slots;
  includeUnverified: boolean;
  quality: { catalyst: string; pct: number } | null;
}

/** The quality goal carried to a new base: clamped to its cap, dropped where catalysts don't apply. */
export function carryQuality(quality: PlannerInput["quality"], qualityCap: number | null): PlannerInput["quality"] {
  if (!quality || qualityCap == null) return null;
  return { ...quality, pct: Math.min(quality.pct, qualityCap) };
}

export function toRequest(input: PlannerInput): PlanRequest {
  return {
    itemClass: input.itemClass,
    base: input.base,
    ilvl: input.ilvl,
    targets: picks(input.slots).map((p) => ({ family: p.family, side: p.side, minModId: p.minModId, fractured: p.fractured })),
    includeUnverified: input.includeUnverified,
    quality: input.quality,
  };
}

/** Index of a pick in the request's targets array (the server's `target` numbers count this way). */
export function targetIndex(slots: Slots, side: Side, slot: number): number | null {
  const list = slots[side];
  if (list[slot] == null) return null;
  const before = side === "prefix" ? 0 : slots.prefix.filter(Boolean).length;
  return before + list.slice(0, slot).filter(Boolean).length;
}

export type QtyOverrides = Readonly<Record<string, number>>;

/** The total with every overridden line's contribution replaced by override × unit price. */
export function adjustedTotal(plan: Pick<PlanResponse, "totals" | "bill">, over: QtyOverrides): BandView | null {
  const t = plan.totals.div;
  if (!t) return null;
  let { point, low, high } = t;
  for (const line of plan.bill) {
    const o = over[line.id];
    if (o == null || line.unitDiv == null || line.totalDiv == null) continue;
    point += o * line.unitDiv - line.totalDiv.point;
    low += o * line.unitDiv - line.totalDiv.low;
    high += o * line.unitDiv - line.totalDiv.high;
  }
  return { point: Math.max(0, point), low: Math.max(0, low), high: Math.max(0, high) };
}

/**
 * A short stable id of one plan: the request AND the guide's shape (phase titles + step counts),
 * so a saved run never resumes into a guide the planner has since rewritten.
 */
export function planSessionId(req: PlanRequest, guide: Pick<PlanResponse["guide"], "phases">): string {
  const shape = guide.phases.map((p) => `${p.title}#${p.steps.length}`).join("|");
  const text = `${JSON.stringify(req)}\n${shape}`;
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `plan-${(h >>> 0).toString(36)}`;
}
