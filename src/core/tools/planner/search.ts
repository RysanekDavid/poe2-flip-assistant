import { movesFrom } from "./methods";
import { startMoves } from "./methodsStart";
import { rankCost } from "./rank";
import { allMet, stateKey } from "./state";
import type { Move, PlanCtx, PlanState } from "./types";

/**
 * Uniform-cost (Dijkstra) search over abstract item states with macro methods as edges. The state
 * space is small (slot occupancy × met targets × three flags), so the search is exact for its cost
 * model, deterministic and explainable: equal-cost plans are broken by the method order list.
 * Cost = expected Divine (point) + λ·(dear end − point); a fracture (or any can't-repair step)
 * restarts the plan on a new base, so its edge turns g into (g + c) / p — still monotone in g, so
 * keeping the cheapest g per state stays optimal.
 */

export const SEARCH_CAP = 5000;
export { RISK_LAMBDA, UNPRICED_RANK_DIV, rankCost } from "./rank";

export class SearchCappedError extends Error {
  constructor(expanded: number) {
    super(`the planner stopped after ${expanded} states — try fewer targets, or turn off "include unverified methods"`);
    this.name = "SearchCappedError";
  }
}

/** A wall-clock limit for one search: the planner runs on the web server's only thread. */
export interface Deadline {
  /** Time (from `now`) at which the search gives up. */
  at: number;
  now: () => number;
}

export class SearchTimeoutError extends Error {
  constructor(
    readonly elapsedMs: number,
    readonly expanded: number,
  ) {
    super(`the planner gave up after ${Math.round(elapsedMs)} ms (${expanded} item states) — try fewer targets or a lower minimum tier`);
    this.name = "SearchTimeoutError";
  }
}

export class NoPlanError extends Error {
  constructor(includeUnverified: boolean) {
    super(
      includeUnverified
        ? "no plan reaches every target with the methods the planner knows"
        : 'no plan reaches every target with verified or creator-demonstrated methods — "include unverified methods" admits the rest',
    );
    this.name = "NoPlanError";
  }
}

export interface PathLink {
  move: Move;
  order: number;
  prev: PathLink | null;
}

interface Node {
  state: PlanState;
  key: string;
  g: number;
  sig: string;
  path: PathLink;
}

const nextG = (g: number, move: Move, ctx: PlanCtx): number => {
  const c = rankCost(move, ctx);
  return move.restartP != null ? (g + c) / move.restartP : g + c;
};

const sigOf = (sig: string, order: number, move: Move): string => `${sig}${String(order).padStart(3, "0")}:${move.methodId}|`;

const before = (a: Node, b: Node): boolean => a.g < b.g - 1e-9 || (Math.abs(a.g - b.g) <= 1e-9 && a.sig < b.sig);

/** A tiny binary heap ordered by `before`. */
class Heap {
  private items: Node[] = [];
  get size(): number {
    return this.items.length;
  }
  push(n: Node): void {
    const a = this.items;
    a.push(n);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (!before(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): Node {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && before(a[l]!, a[m]!)) m = l;
        if (r < a.length && before(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

export interface SearchResult {
  moves: Move[];
  expanded: number;
}

function unwind(link: PathLink): Move[] {
  const out: Move[] = [];
  for (let l: PathLink | null = link; l; l = l.prev) out.push(l.move);
  return out.reverse();
}

/** Cheapest plan from any allowed start to a state where every target (and the quality goal) is met. */
export function searchPlan(ctx: PlanCtx, cap: number = SEARCH_CAP, deadline: Deadline | null = null): SearchResult {
  const started = deadline?.now() ?? 0;
  const heap = new Heap();
  const best = new Map<string, Node>();
  const offer = (n: Node) => {
    const prev = best.get(n.key);
    if (prev && !before(n, prev)) return;
    best.set(n.key, n);
    heap.push(n);
  };
  for (const move of startMoves(ctx)) {
    const sig = sigOf("", 0, move);
    offer({ state: move.next, key: stateKey(move.next), g: rankCost(move, ctx), sig, path: { move, order: 0, prev: null } });
  }
  let expanded = 0;
  while (heap.size > 0) {
    const node = heap.pop();
    if (best.get(node.key) !== node) continue;
    if (allMet(ctx, node.state)) return { moves: unwind(node.path), expanded };
    if (++expanded > cap) throw new SearchCappedError(cap);
    if (deadline && deadline.now() >= deadline.at) throw new SearchTimeoutError(deadline.now() - started, expanded);
    for (const { move, order } of movesFrom(node.state, ctx)) {
      const sig = sigOf(node.sig, order, move);
      offer({ state: move.next, key: stateKey(move.next), g: nextG(node.g, move, ctx), sig, path: { move, order, prev: node.path } });
    }
  }
  throw new NoPlanError(ctx.includeUnverified);
}
