import type { CraftMaterial } from "../../craftMaterials";
import type { Band, Basis, Estimate, MaterialUse } from "./types";

/**
 * Expected material use. A macro with a single retry loop is geometric; one whose recovery can
 * undo earlier progress (a steered Annulment that may hit a good mod) is a small absorbing Markov
 * chain solved exactly by Gaussian elimination — exact GIVEN its p inputs, so its basis is theirs.
 */

const BASIS_RANK: Record<Basis, number> = { exact: 0, estimate: 1, unknown: 2 };

/** A figure mixing inputs is as weak as its weakest input. */
export function combineBasis(...bases: Basis[]): Basis {
  return bases.reduce<Basis>((acc, b) => (BASIS_RANK[b] > BASIS_RANK[acc] ? b : acc), "exact");
}

export const band = (point: number, low = point, high = point): Band => ({ point, low, high });
export const scaleBand = (b: Band, k: number): Band => ({ point: b.point * k, low: b.low * k, high: b.high * k });
export const addBand = (a: Band, b: Band): Band => ({ point: a.point + b.point, low: a.low + b.low, high: a.high + b.high });

/** Expected attempts until the first success: 1/p, the band from the odds band (high p → few). */
export function attemptsOf(odds: Estimate): Band {
  if (odds.point == null || odds.low == null || odds.high == null) throw new Error(`planner bug: no point odds for "${odds.formula}"`);
  return { point: 1 / odds.point, low: 1 / odds.high, high: 1 / odds.low };
}

/** Failures before the first success: attempts − 1. */
export const failuresOf = (odds: Estimate): Band => {
  const a = attemptsOf(odds);
  return { point: a.point - 1, low: a.low - 1, high: a.high - 1 };
};

export const useOf = (mat: CraftMaterial, qty: Band): MaterialUse => ({ mat, qty });

/** Merge uses of the same material (by id), summing their bands; order of first appearance. */
export function mergeUses(uses: readonly MaterialUse[]): MaterialUse[] {
  const out = new Map<string, MaterialUse>();
  for (const u of uses) {
    const prev = out.get(u.mat.id);
    out.set(u.mat.id, prev ? { mat: u.mat, qty: addBand(prev.qty, u.qty) } : u);
  }
  return [...out.values()];
}

/**
 * Solve the augmented rows [A | B] (n×n, n×k) in place by Gaussian elimination with partial pivoting
 * and back substitution; throws on a singular system (a planner bug). Typed rows: the whittle chains
 * reach a few hundred states, and this loop is the planner's hot spot.
 */
function solveAugmented(m: Float64Array[], n: number): number[][] {
  const width = m[0]?.length ?? 0;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) throw new Error("planner bug: the retry chain has no way to finish (singular system)");
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const top = m[col]!;
    // retry chains are sparse: only the pivot row's nonzero columns change anything
    const nz: number[] = [];
    for (let c = col; c < width; c++) if (top[c] !== 0) nz.push(c);
    for (let r = col + 1; r < n; r++) {
      const row = m[r]!;
      const f = row[col]! / top[col]!;
      if (f === 0) continue;
      for (const c of nz) row[c] = row[c]! - f * top[c]!;
    }
  }
  const k = width - n;
  const x = Array.from({ length: n }, () => new Array<number>(k).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const row = m[i]!;
    for (let j = 0; j < k; j++) {
      let s = row[n + j]!;
      for (let c = i + 1; c < n; c++) s -= row[c]! * x[c]![j]!;
      x[i]![j] = s / row[i]!;
    }
  }
  return x;
}

export interface ChainNode {
  id: string;
  terminal: boolean;
  /** Material id → units spent on ONE visit of this node. */
  cost: Record<string, number>;
  edges: Array<{ to: string; p: number }>;
}

/** Expected units of each material from `start` until a terminal node is reached. */
export function solveChain(nodes: readonly ChainNode[], start: string, materials: readonly string[]): Record<string, number> {
  const live = nodes.filter((n) => !n.terminal);
  const index = new Map(live.map((n, i) => [n.id, i]));
  if (!index.has(start)) return Object.fromEntries(materials.map((m) => [m, 0]));
  const n = live.length;
  // row i: x_i − Σ p·x_next = cost_i (terminal nodes drop out: their x is 0)
  const rows = live.map((node, i) => {
    const row = new Float64Array(n + materials.length);
    row[i] = 1;
    for (const e of node.edges) {
      const j = index.get(e.to);
      if (j != null) row[j] = row[j]! - e.p;
    }
    materials.forEach((m, k) => (row[n + k] = node.cost[m] ?? 0));
    return row;
  });
  const x = solveAugmented(rows, n);
  const row = x[index.get(start)!]!;
  return Object.fromEntries(materials.map((m, k) => [m, row[k]!]));
}
