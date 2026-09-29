/* Seeded randomness and synthetic tooltip items for testRegexPoolCompose: an item is built from the
 * pool's own templates and the hand-written headers, with numbers drawn inside each tier's ranges
 * (or forced into a threshold), so the emulator sees text shaped exactly like a real tooltip. */
import { POOL_HEADERS, RARITIES, rarityHeaderId, type Rarity } from "../../core/tools/regex/pools/headers";
import type { PoolMod, PoolTab, PoolTier, RegexPool } from "../../core/tools/regex/pools/schema";
import { fillTemplate } from "../../core/tools/regex/pools/template";
import {
  TABLET_TYPES,
  emptyPoolSelection,
  thresholdKey,
  type CorruptedFilter,
  type PoolTabSelection,
  type ValueRange,
} from "../../lib/tools/regexPoolContract";

/** mulberry32: tiny, seedable, good enough to spread test cases. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => {
    const x = xs[int(0, xs.length - 1)];
    if (x === undefined) throw new Error("pick from empty list");
    return x;
  };
  const sample = <T>(xs: readonly T[], n: number): T[] => {
    const pool = [...xs];
    const out: T[] = [];
    while (out.length < n && pool.length > 0) out.push(...pool.splice(int(0, pool.length - 1), 1));
    return out;
  };
  return { next, int, pick, sample, chance: (p: number): boolean => next() < p };
}
export type Rng = ReturnType<typeof makeRng>;

export interface ModRoll {
  mod: PoolMod;
  tier: PoolTier;
  /** Forced values per `${line}.${slot}`. */
  forced: Map<string, number>;
}

export interface ItemSpec {
  rarity: Rarity;
  corrupted: boolean;
  tier: number;
  base: string;
  props: Map<string, number>;
  mods: ModRoll[];
}

function rollValue(rng: Rng, min: number, max: number): number {
  return Number.isInteger(min) && Number.isInteger(max) ? rng.int(min, max) : min;
}

/** One rolled mod as tooltip lines. */
export function rolledLines(rng: Rng, roll: ModRoll): string[] {
  return roll.tier.lines.map(({ line, ranges }) => {
    const template = roll.mod.lines[line]?.template ?? "";
    const values = ranges.map((r, slot) => roll.forced.get(`${line}.${slot}`) ?? rollValue(rng, r.min, r.max));
    return fillTemplate(template, values);
  });
}

/** Tooltip lines for a synthetic item of the pool's tab (normal-copy order, markers stripped). */
export function itemLines(rng: Rng, tab: PoolTab, spec: ItemSpec): string[] {
  const out: string[] = [];
  for (const h of POOL_HEADERS[tab]) {
    if (h.kind === "class" || h.kind === "boilerplate") out.push(h.template);
    else if (h.kind === "rarity" && h.id === rarityHeaderId(spec.rarity)) out.push(h.template, "Qqq Zzz");
    else if (h.kind === "tier") out.push(fillTemplate(h.template, [spec.tier]));
    else if (h.kind === "property") out.push(fillTemplate(h.template, [spec.props.get(h.id) ?? rng.int(0, 150)]));
    else if (h.id === "corrupted" && spec.corrupted) out.push(h.template);
  }
  if (tab !== "waystone") out.push(spec.base);
  for (const roll of spec.mods) out.push(...rolledLines(rng, roll));
  return out;
}

export const roll = (rng: Rng, mod: PoolMod, forced = new Map<string, number>()): ModRoll => ({ mod, tier: rng.pick(mod.tiers), forced });

/** Integer number slots present in every tier of the mod — where a threshold is always meaningful. */
export function thresholdSlots(mod: PoolMod): Array<{ line: number; slot: number; lo: number; hi: number }> {
  const out: Array<{ line: number; slot: number; lo: number; hi: number }> = [];
  mod.lines.forEach((l, line) => {
    if (l.numeric.decimals > 0 || !mod.tiers.every((t) => t.lines.some((x) => x.line === line))) return;
    for (let slot = 0; slot < l.numeric.count; slot++) {
      const ranges = mod.tiers.flatMap((t) => t.lines.filter((x) => x.line === line).map((x) => x.ranges[slot]));
      const lo = Math.min(...ranges.map((r) => r?.min ?? 0));
      const hi = Math.max(...ranges.map((r) => r?.max ?? 0));
      out.push({ line, slot, lo: Math.ceil(lo), hi: Math.floor(hi) });
    }
  });
  return out;
}

function randomRange(rng: Rng, lo: number, hi: number): ValueRange {
  const min = rng.int(Math.max(0, lo), Math.max(lo, hi));
  return { min, max: rng.chance(0.5) ? null : min + rng.int(0, 20) };
}

function randomThresholds(rng: Rng, wants: readonly PoolMod[]): Record<string, ValueRange> {
  const out: Record<string, ValueRange> = {};
  for (const mod of wants) {
    const slots = thresholdSlots(mod);
    if (slots.length === 0 || !rng.chance(0.35)) continue;
    const s = rng.pick(slots);
    out[thresholdKey(mod.id, s.line, s.slot)] = randomRange(rng, s.lo, s.hi);
  }
  return out;
}

const WAYSTONE_PROPS = ["itemRarity", "monsterRarity", "waystoneDrop", "revives"] as const;

/** A random selection for the pool's tab: 1–4 wanted, 0–2 avoided, optional filters. */
export function randomSelection(rng: Rng, pool: RegexPool): PoolTabSelection {
  const picked = rng.sample(pool.mods, rng.int(1, 6));
  const wants = picked.slice(0, rng.int(1, Math.min(4, picked.length)));
  const avoids = picked.slice(wants.length, wants.length + rng.int(0, 2));
  const mods: Record<string, "want" | "avoid"> = {};
  for (const m of wants) mods[m.id] = "want";
  for (const m of avoids) mods[m.id] = "avoid";
  const corrupted: CorruptedFilter = rng.pick(["any", "any", "only", "exclude"] as const);
  const common = {
    mods,
    match: rng.pick(["any", "all"] as const),
    thresholds: randomThresholds(rng, wants),
    rarity: rng.chance(0.3) ? rng.sample(RARITIES, rng.int(1, 3)) : [],
    corrupted,
  };
  const props: Record<string, ValueRange> = {};
  if (pool.tab === "waystone" && rng.chance(0.3)) props[rng.pick(WAYSTONE_PROPS)] = randomRange(rng, 0, 150);
  const sel = { ...emptyPoolSelection(pool.tab), ...common, props };
  if (sel.tab === "waystone" && rng.chance(0.4)) {
    const min = rng.int(1, 16);
    return { ...sel, tier: { min, max: rng.int(min, 16) } };
  }
  if (sel.tab === "tablet" && rng.chance(0.3)) return { ...sel, types: rng.sample(TABLET_TYPES, rng.int(1, 3)) };
  return sel;
}

/** Forced values that satisfy every threshold on the mod (a value inside each range). */
export function satisfying(sel: PoolTabSelection, mod: PoolMod): Map<string, number> {
  const forced = new Map<string, number>();
  for (const [key, range] of Object.entries(sel.thresholds)) {
    const [modId, rest] = key.split("#");
    if (modId === mod.id && rest) forced.set(rest, range.min);
  }
  return forced;
}

/** An item spec that passes every filter of the selection, carrying the given mods. */
export function passingSpec(rng: Rng, pool: RegexPool, sel: PoolTabSelection, mods: ModRoll[]): ItemSpec {
  const props = new Map<string, number>();
  for (const [id, r] of Object.entries(sel.props)) props.set(id, r.min);
  const tier = sel.tab === "waystone" && sel.tier ? rng.int(sel.tier.min, sel.tier.max) : rng.int(1, 16);
  const types = sel.tab === "tablet" ? (sel.types as readonly string[]) : [];
  const bases = types.length > 0 ? pool.bases.filter((b) => (pool.baseBands[b] ?? []).some((t) => types.includes(t))) : pool.bases;
  return {
    rarity: sel.rarity.length > 0 ? rng.pick(sel.rarity) : rng.pick(RARITIES),
    corrupted: sel.corrupted === "only" ? true : sel.corrupted === "exclude" ? false : rng.chance(0.5),
    tier,
    base: rng.pick(bases.length > 0 ? bases : pool.bases),
    props,
    mods,
  };
}
