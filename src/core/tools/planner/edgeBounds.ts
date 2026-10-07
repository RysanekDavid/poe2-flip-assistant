import { CATALYSTS, matchesCatalyst, QUALITY_PER_CATALYST } from "./catalystTags";
import { mat, sideOmen } from "./methodKit";
import { RISK_LAMBDA, UNPRICED_RANK_DIV } from "./rank";
import { aimAt, aimOddsAt, bits, NoAimError, type Aim, type AimCache, type SlamScope, type SlamVariant } from "./slamChain";
import type { AffixSide } from "../craftmoves/catalog";
import { SIDES } from "./state";
import type { PlanCtx, PlanState } from "./types";
import { cachedAddShape, scaledAdd, whittleStateAt, type WhittleScope } from "./whittleChain";

/**
 * Lower bounds on the rank cost of the two retry-chain macros, so the search can offer them unbuilt
 * (LazyEdge). A bound must never exceed the built Move's rankCost, or the search could settle on a
 * dearer plan; search.ts throws if a built edge ever comes in under its bound.
 *
 * Both rest on one argument. A chain only gets closer to done on a HIT, one missing target fewer
 * per hit. Group the chain's states into levels by how many targets are missing; to finish, the
 * chain must hit its way down through every level from where it starts to 0. If no attempt at
 * level k hits with probability above H(k), then (Wald) the expected attempts made at level k are
 * at least 1/H(k), and the expected misses there at least 1/H(k) − 1. Undo (an Annulment or a
 * Whittle taking a landed target) only adds attempts, so ignoring it keeps the bound below the
 * cost. H(k) is the maximum hit chance over every state at that level, computed with the very same
 * odds the chain uses, at the prior (×1) and at the dear end of the band (×½): rankCost is
 * (1 − λ)·point + λ·dear, both are bounded the same way. A catalysed slam's ends also differ in the
 * Catalysing multiplier (slamChain aimOddsAt): each end's bound reads that end's own odds. "The high
 * multiplier everywhere" would not be safe — an untagged target's chance falls as the multiplier
 * rises — while the chain's own odds per end make H(k) exactly the chain's best hit.
 *
 * Undo-free floors are far too low where undo dominates (a steered Annulment on a side of three
 * targets takes a landed one 2 times in 3), so slam-fill solves a level chain that keeps the
 * Annulment's undo exactly (levelChainFloor), and the whittle loop gets a second, tighter bound from
 * its solved graph before the rest of the Move is built (whittlePreparedBound).
 */

// rankCost's own price rule: an unpriced material ranks at UNPRICED_RANK_DIV
const rankPrice = (ctx: PlanCtx, id: string): number => ctx.priceOf(id) ?? UNPRICED_RANK_DIV;
const blend = (point: number, dear: number): number => (1 - RISK_LAMBDA) * point + RISK_LAMBDA * dear;
// the chains are solved by elimination, which may land a few ulps under the closed form
const admissible = (bound: number): number => Math.max(0, bound * (1 - 1e-9) - 1e-6);

const popcount = (mask: number): number => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n += 1;
  return n;
};

/** Best hit chance of one slam at each missing count k = 1..chain length (index = k), at band scale `scale`. */
function slamLevelHits(state: PlanState, ctx: PlanCtx, scope: SlamScope, v: SlamVariant, aims: AimCache, scale: number): number[] {
  const n = scope.chain.length;
  const best = new Array<number>(n + 1).fill(0);
  // an Annulment can take a target that was on the item before the chain began, so every mask of
  // the chain counts, not only subsets of the starting one
  for (let mask = 1; mask < 1 << n; mask++) {
    let aim: Aim;
    try {
      aim = aimAt(state, ctx, scope, v, mask, aims);
    } catch (e: unknown) {
      if (e instanceof NoAimError) continue;
      throw e;
    }
    // slamChain.ts slamNode: per-target min(1, p·scale) on the same band end, the hit is their sum clamped to 1
    const odds = aimOddsAt(aim, scale);
    const raw = bits(mask, n).reduce((sum, i) => sum + Math.min(1, (odds.get(scope.chain[i]!.idx) ?? 0) * scale), 0);
    const k = popcount(mask);
    best[k] = Math.max(best[k]!, Math.min(1, raw));
  }
  return best;
}

/** Undo ignored: Σ over levels 1..top of the click cost of (1/H) slams and (1/H − 1) Annulments; Infinity when a level can't be hit. */
function waldFloor(hits: readonly number[], top: number, price: ClickPrices): number {
  let cost = 0;
  for (let k = 1; k <= top; k++) {
    if (!(hits[k]! > 0)) return Infinity;
    cost += price.slam / hits[k]! + price.annul * (1 / hits[k]! - 1);
  }
  return cost;
}

/** Dense Gaussian elimination with partial pivoting; the level chains are at most a few rows. */
function solveDense(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    for (let r = col + 1; r < n; r++) {
      const f = a[r]![col]! / a[col]![col]!;
      for (let c = col; c < n; c++) a[r]![c] = a[r]![c]! - f * a[col]![c]!;
      b[r] = b[r]! - f * b[col]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i]!;
    for (let c = i + 1; c < n; c++) sum -= a[i]![c]! * x[c]!;
    x[i] = sum / a[i]![i]!;
  }
  return x;
}

/**
 * The level chain: S_k = a slam with k targets missing, A_k = the Annulment after a miss (j0 + 1
 * junk). An Annulment's odds depend only on the level (it picks uniformly among the j0 + 1 junk and
 * the n − k landed targets), so the real chain differs from this one only in its slam hit chances,
 * each ≤ H(k). φ solved here is a floor of the real cost (optional stopping on φ) as long as a hit
 * never leaves the player worse off than a miss, φ(S_{k−1}) ≤ φ(A_k) — checked, not assumed:
 * when it fails the caller falls back to the undo-free floor. Returns φ(S_top), or null.
 */
function levelChainFloor(hits: readonly number[], top: number, j0: number, price: ClickPrices): number | null {
  const n = hits.length - 1;
  if (hits.slice(1).some((h) => !(h > 0))) return null;
  const S = (k: number): number => k - 1;
  const A = (k: number): number => n + k - 1;
  const a = Array.from({ length: 2 * n }, () => new Array<number>(2 * n).fill(0));
  const b = new Array<number>(2 * n).fill(0);
  for (let k = 1; k <= n; k++) {
    const h = hits[k]!;
    a[S(k)]![S(k)] = 1;
    if (k > 1) a[S(k)]![S(k - 1)] = -h;
    a[S(k)]![A(k)] = -(1 - h);
    b[S(k)] = price.slam;
    const toJunk = (j0 + 1) / (j0 + 1 + n - k);
    a[A(k)]![A(k)] = 1;
    a[A(k)]![S(k)] = -toJunk;
    if (k < n) a[A(k)]![A(k + 1)] = -(1 - toJunk);
    b[A(k)] = price.annul;
  }
  const phi = solveDense(a, b);
  if (!phi) return null;
  // every level, even one whose best slam never misses: some other slam at that level may
  for (let k = 1; k <= n; k++) if (phi[A(k)]! < (k > 1 ? phi[S(k - 1)]! : 0)) return null;
  return phi[S(top)]!;
}

interface ClickPrices {
  slam: number;
  annul: number;
}

/** Per-click prices of a slam variant: the slam (currency, side omen, catalysing) and the Annulment that fixes a miss. */
function slamClickPrices(ctx: PlanCtx, scope: SlamScope, v: SlamVariant): ClickPrices {
  let slam = rankPrice(ctx, mat(v.tier.key).id);
  if (scope.steerExalt) slam += rankPrice(ctx, mat(sideOmen(scope.side, "Exaltation").key).id);
  if (v.catalysing) {
    // each slam re-catalyses with whichever catalyst its node aims at: the cheapest one is a floor
    const options = CATALYSTS.filter((c) => scope.chain.some((t) => matchesCatalyst(c, t.tags)));
    const cheapest = Math.min(...options.map((c) => rankPrice(ctx, c.mat.id)));
    slam += rankPrice(ctx, mat("omenCatalysingExaltation").id) + (Number.isFinite(cheapest) ? ((ctx.base.qualityCap ?? 0) / QUALITY_PER_CATALYST) * cheapest : 0);
  }
  let annul = rankPrice(ctx, mat("annul").id);
  if (scope.steerAnnul) annul += rankPrice(ctx, mat(sideOmen(scope.side, "Annulment").key).id);
  return { slam, annul };
}

/**
 * Slam-fill: every slam pays the slam click; every miss adds a throwaway that an Annulment must take
 * before the next slam (slams only fire at j0). The level-chain floor counts the Annulments that take
 * a landed target too; the undo-free floor is the fallback.
 */
export function slamBound(state: PlanState, ctx: PlanCtx, scope: SlamScope, v: SlamVariant, aims: AimCache): number {
  const top = popcount(scope.missing0);
  const price = slamClickPrices(ctx, scope, v);
  const floorAt = (scale: number): number => {
    const hits = slamLevelHits(state, ctx, scope, v, aims, scale);
    return levelChainFloor(hits, top, scope.j0, price) ?? waldFloor(hits, top, price);
  };
  return admissible(blend(floorAt(1), floorAt(0.5)));
}

/** Erasure sides a last-hit attempt could use: a side where some chain target, if it were the one missing, leaves no kept mod. */
function lastHitErasureSides(scope: WhittleScope): AffixSide[] {
  return SIDES.filter((side) => !scope.fixed.some((f) => f.side === side) && scope.chain.some((_, i) => !scope.chain.some((c, j) => j !== i && c.side === side)));
}

/**
 * Whittle loop: the last hit (one target missing → none) is made from an item holding every other
 * chain target and no throwaway, so the level-1 hit chance is the best such item's (whittleChain
 * addShape, the same shapes the chain uses). Every attempt pays a Chaos Orb and one omen: Whittling,
 * or a side Erasure where the throwaway's side holds no kept mod (whittleChain exactErasureSide).
 * With no such side every attempt is a Whittle, at the prior and at the dear end alike. With one,
 * the omen counts only at the prior (cheapest omen): the built Move drops a material whose prior
 * use is ~0 even when the dear end uses it, so there the dear end is bounded by the Chaos alone.
 */
export function whittleBound(state: PlanState, ctx: PlanCtx, scope: WhittleScope): number {
  const hits = lastHitChances(state, ctx, scope);
  if (!(hits.point > 0 && hits.dear > 0)) return Infinity;
  const price = attemptPrices(ctx, scope);
  return admissible(blend(price.point / hits.point, price.dear / hits.dear));
}

/** Best last-hit chance at the prior and at the dear end of the band. */
function lastHitChances(state: PlanState, ctx: PlanCtx, scope: WhittleScope): { point: number; dear: number } {
  let point = 0;
  let dear = 0;
  for (let i = 0; i < scope.chain.length; i++) {
    const shape = cachedAddShape(ctx, scope, whittleStateAt(state, scope, 1 << i, []), 1 << i);
    const hit = (scale: number): number => [...scaledAdd(shape, scale).hits.values()].reduce((a, b) => a + b, 0);
    point = Math.max(point, hit(1));
    dear = Math.max(dear, hit(0.5));
  }
  return { point, dear };
}

/** A floor on one attempt's price at the prior and at the dear end (see whittleBound). */
function attemptPrices(ctx: PlanCtx, scope: WhittleScope): { point: number; dear: number } {
  const chaos = rankPrice(ctx, mat("chaos").id);
  const whittle = rankPrice(ctx, mat("omenWhittling").id);
  const erasure = lastHitErasureSides(scope).map((side) => rankPrice(ctx, mat(sideOmen(side, "Erasure").key).id));
  if (erasure.length === 0) return { point: chaos + whittle, dear: chaos + whittle };
  return { point: chaos + Math.min(whittle, ...erasure), dear: chaos };
}

/**
 * The whittle loop once its graph is solved at the prior: the prior part of rankCost is then known
 * (the built Move drops only materials used ≤ 1e-9 times, inside the slack) and the dear part keeps
 * the level-1 floor of whittleBound.
 */
export function whittlePreparedBound(state: PlanState, ctx: PlanCtx, scope: WhittleScope, point: Readonly<Record<string, number>>): number {
  const dearHit = lastHitChances(state, ctx, scope).dear;
  if (!(dearHit > 0)) return Infinity;
  const prior = Object.entries(point).reduce((sum, [id, qty]) => sum + qty * rankPrice(ctx, id), 0);
  return admissible(blend(prior, attemptPrices(ctx, scope).dear / dearHit));
}
