import type { AffixSide } from "../craftmoves/catalog";
import { matchesCatalyst, type CatalystInfo } from "./catalystTags";
import { eligibleAlts, presentModGroups, stateKey } from "./state";
import type { Estimate, PlanCtx, PlanState, ResolvedTarget } from "./types";

/**
 * Odds with an honest basis. PoE2's game files carry no spawn weights (RePoE spawn_weights are a
 * 0/1 "can spawn" flag), so:
 *   exact    — count-based steps: a removal among n removable mods, a fracture among n mods, essence
 *              writes, side omens (KB §2, §4, §7);
 *   estimate — which mod a random ADD rolls: prior A = equal weight per eligible family, equal per
 *              reachable tier, band ×½…×2 (a presentation constant, not a statistical claim);
 *   unknown  — bounds only.
 */

/** The estimate band: ×½ … ×2 of the prior, clamped to a probability. */
export const ESTIMATE_BAND = { down: 0.5, up: 2 } as const;
export const PRIOR_NOTE = "assumes every eligible mod family and every reachable tier is equally likely — PoE2 publishes no mod weights";

export function exact(p: number, formula: string, inputs: Estimate["inputs"] = {}): Estimate {
  if (!(p > 0 && p <= 1)) throw new Error(`exact odds out of range: ${p} (${formula})`);
  return { point: p, low: p, high: p, basis: "exact", formula, inputs };
}

export function estimate(p: number, formula: string, inputs: Estimate["inputs"] = {}): Estimate {
  if (!(p > 0 && p <= 1)) throw new Error(`estimated odds out of range: ${p} (${formula})`);
  return { point: p, low: p * ESTIMATE_BAND.down, high: Math.min(1, p * ESTIMATE_BAND.up), basis: "estimate", formula, inputs };
}

/** An estimate whose band comes from the model itself (not the ×½…×2 constant). */
export function estimateWithin(point: number, low: number, high: number, formula: string, inputs: Estimate["inputs"] = {}): Estimate {
  if (!(point > 0 && point <= 1 && low > 0 && low <= point + 1e-12 && high >= point - 1e-12 && high <= 1)) throw new Error(`estimated odds out of range: ${low} ≤ ${point} ≤ ${high} (${formula})`);
  return { point, low, high, basis: "estimate", formula, inputs };
}

/** Floors are SOFT (KB §1): when every reachable tier sits below the floor, the top reachable tier rolls. */
export function eligibleTierLevels(ctx: PlanCtx, side: AffixSide, family: string, floor: number | null): number[] {
  const levels = Object.values(ctx.combo[side][family] ?? {}).sort((a, b) => a - b);
  const reachable = levels.filter((l) => l <= ctx.base.ilvl);
  if (floor == null) return reachable;
  const above = reachable.filter((l) => l >= floor);
  return above.length > 0 ? above : reachable.slice(-1);
}

/** P(tier >= the target's minimum | its family rolled) under a currency floor. */
export function tierShare(ctx: PlanCtx, t: ResolvedTarget, floor: number | null): { share: number; good: number; of: number } {
  const levels = eligibleTierLevels(ctx, t.side, t.family, floor);
  const good = levels.filter((l) => l >= t.level).length;
  return { share: levels.length === 0 ? 0 : good / levels.length, good, of: levels.length };
}

/**
 * Catalysing Exaltation tag multiplier: ×5 at 20%, ×7.5 at 40% (KB §4). Between and above those
 * points nothing is documented, so the planner rounds DOWN to the last documented point.
 */
export function catalysingMultiplier(quality: number): number | null {
  if (quality >= 40) return 7.5;
  if (quality >= 20) return 5;
  return null;
}
/** Player prose for the catalyst bias in a formula (×5 at 20%, ×7.5 at 40%, crafting rules — omens). */
export const CATALYSING_NOTE = "Catalysing Exaltation weighs them ×5 at 20% quality, ×7.5 at 40%; nothing is documented above 40%";

const presentGroups = presentModGroups;

export function familyGroups(ctx: PlanCtx, side: AffixSide, family: string): readonly string[] {
  const first = Object.keys(ctx.combo[side][family] ?? {})[0];
  return first ? ctx.cat.mods[first]?.groups ?? [family] : [family];
}

export interface AddPool {
  sides: readonly AffixSide[];
  floor: number | null;
  catalyst: CatalystInfo | null;
  quality: number;
  /** Junk mods that will still be on the item when the add rolls (each blocks one unknown family). */
  junkAfter: number;
}

interface PoolWeights {
  total: number;
  families: number;
  tagged: number;
  mult: number;
  weightOf: (t: ResolvedTarget) => number;
}

// one search prices the same item's add pool for many moves (every slam variant, chain node and
// whittle shape); the weights read only the item's mod groups, the sides, the catalyst bias and the
// junk count — the currency floor only changes tierShare, so it is not part of the key
const WEIGHTS = new WeakMap<PlanCtx, Map<string, PoolWeights>>();

function poolWeights(ctx: PlanCtx, state: PlanState, pool: AddPool): PoolWeights {
  let byKey = WEIGHTS.get(ctx);
  if (!byKey) WEIGHTS.set(ctx, (byKey = new Map()));
  const key = `${stateKey(state)}|${pool.sides.join(",")}|${pool.catalyst?.mat.id ?? "-"}|${pool.quality}|${pool.junkAfter}`;
  let w = byKey.get(key);
  if (!w) byKey.set(key, (w = computePoolWeights(ctx, state, pool)));
  return w;
}

/** Eligible = families of the pooled sides whose groups are not on the item (and not a target's own). */
function computePoolWeights(ctx: PlanCtx, state: PlanState, pool: AddPool): PoolWeights {
  const blocked = presentGroups(ctx, state);
  const mult = pool.catalyst ? catalysingMultiplier(pool.quality) ?? 1 : 1;
  let total = 0;
  let families = 0;
  let tagged = 0;
  const weights = new Map<string, number>();
  for (const side of pool.sides) {
    for (const family of Object.keys(ctx.combo[side])) {
      if (familyGroups(ctx, side, family).some((g) => blocked.has(g))) continue;
      const tags = ctx.cat.mods[Object.keys(ctx.combo[side][family]!)[0]!]?.tags ?? [];
      const isTagged = pool.catalyst != null && matchesCatalyst(pool.catalyst, tags);
      const w = isTagged ? mult : 1;
      weights.set(`${side}:${family}`, w);
      total += w;
      families += 1;
      if (isTagged) tagged += 1;
    }
  }
  // junk of unknown identity occupies one family each; counted as an untagged one
  total = Math.max(total - pool.junkAfter, 1);
  return { total, families: families - pool.junkAfter, tagged, mult, weightOf: (t) => weights.get(`${t.side}:${t.family}`) ?? 0 };
}

export interface AddOdds {
  /** P(the add rolls target i at or above its minimum tier), per target index. */
  p: Map<number, number>;
  estimate: (idx: number) => Estimate;
}

function singleOdds(ctx: PlanCtx, w: PoolWeights, pool: AddPool, t: ResolvedTarget): { p: number; est: () => Estimate } {
  const share = tierShare(ctx, t, pool.floor);
  const p = (w.weightOf(t) / w.total) * share.share;
  const est = () => {
    const bias = pool.catalyst && w.weightOf(t) > 1 ? ` (${pool.catalyst.mat.label} favours ${w.tagged} famil${w.tagged === 1 ? "y" : "ies"} ×${w.mult}: ${CATALYSING_NOTE})` : "";
    const floorTxt = pool.floor != null ? ` at currency floor ${pool.floor}` : "";
    const formula = `P = ${w.weightOf(t)}/${round(w.total)} family weight × ${share.good}/${share.of} reachable tiers${floorTxt}${bias} — ${PRIOR_NOTE}`;
    const inputs = {
      "eligible mod families": w.families,
      "good tiers": share.good,
      "reachable tiers": share.of,
      ...(pool.floor != null ? { "currency floor level": pool.floor } : {}),
    };
    return estimate(p, formula, inputs);
  };
  return { p, est };
}

/** A pool slot: any still-possible candidate counts, so the chance is the sum over them. */
function poolOdds(ctx: PlanCtx, state: PlanState, w: PoolWeights, pool: AddPool, idx: number): { p: number; est: () => Estimate } {
  const t = ctx.targets[idx]!;
  const parts = eligibleAlts(ctx, state, idx).map((a) => ({ c: t.alts[a]!, ...singleOdds(ctx, w, pool, t.alts[a]!) }));
  const p = Math.min(1, parts.reduce((s, x) => s + x.p, 0));
  const est = () => {
    const terms = parts.filter((x) => x.p > 0).map((x) => `${w.weightOf(x.c)}/${round(w.total)} × ${tierShare(ctx, x.c, pool.floor).good}/${tierShare(ctx, x.c, pool.floor).of}`);
    const bias = pool.catalyst && parts.some((x) => w.weightOf(x.c) > 1) ? ` (${pool.catalyst.mat.label} favours ${w.tagged} famil${w.tagged === 1 ? "y" : "ies"} ×${w.mult}: ${CATALYSING_NOTE})` : "";
    const floorTxt = pool.floor != null ? ` at currency floor ${pool.floor}` : "";
    const formula = `P = any of ${parts.length} pool mods: ${terms.join(" + ")} (family weight × good/reachable tiers${floorTxt})${bias} — ${PRIOR_NOTE}`;
    return estimate(p, formula, { "eligible mod families": w.families, "pool mods still possible": parts.length, ...(pool.floor != null ? { "currency floor level": pool.floor } : {}) });
  };
  return { p, est };
}

/** Odds that one random add (Exalt, Chaos add, Aug, Transmute) lands each given target. */
export function addOdds(ctx: PlanCtx, state: PlanState, pool: AddPool, targetIdx: readonly number[]): AddOdds {
  const w = poolWeights(ctx, state, pool);
  const p = new Map<number, number>();
  const formulas = new Map<number, Estimate>();
  const aimedPools = new Set<number>();
  for (const idx of targetIdx) {
    const t = ctx.targets[idx]!;
    // two missing slots of one pool are one "any of" roll: the first listed takes the whole chance
    if (t.group != null && aimedPools.has(t.group)) {
      p.set(idx, 0);
      continue;
    }
    if (t.group != null) aimedPools.add(t.group);
    const o = t.group != null ? poolOdds(ctx, state, w, pool, idx) : singleOdds(ctx, w, pool, t);
    p.set(idx, o.p);
    if (o.p > 0) formulas.set(idx, o.est());
  }
  return {
    p,
    estimate: (idx) => {
      const e = formulas.get(idx);
      if (!e) throw new Error(`planner bug: target ${idx} can't roll from this pool`);
      return e;
    },
  };
}

const round = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export interface LevelOutcome {
  side: AffixSide;
  family: string;
  /** Modifier level of the rolled tier (what Omen of Whittling compares). */
  level: number;
  p: number;
}

/**
 * Every (family, tier) one plain random add (no floor, no catalyst) can roll, under the same prior
 * as addOdds: equal weight per eligible family, equal per reachable tier. Sums to 1 over the pool.
 */
export function addLevelOutcomes(ctx: PlanCtx, state: PlanState, sides: readonly AffixSide[]): LevelOutcome[] {
  const blocked = presentGroups(ctx, state);
  const families: Array<{ side: AffixSide; family: string; levels: number[] }> = [];
  for (const side of sides) {
    for (const family of Object.keys(ctx.combo[side])) {
      if (familyGroups(ctx, side, family).some((g) => blocked.has(g))) continue;
      const levels = eligibleTierLevels(ctx, side, family, null);
      if (levels.length > 0) families.push({ side, family, levels });
    }
  }
  return families.flatMap((f) => f.levels.map((level) => ({ side: f.side, family: f.family, level, p: 1 / families.length / f.levels.length })));
}

