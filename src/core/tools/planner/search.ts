import { edgesFrom } from "./methods";
import { startMoves } from "./methodsStart";
import { rankCost } from "./rank";
import { allMet, stateKey } from "./state";
import type { LazyEdge, Move, PlanCtx, PlanState } from "./types";

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

/**
 * Heap order: cost, then the method-order signature, then birth — the parent's expansion number and
 * the edge's index among its parent's edges. Birth makes the order total, so the plan never hangs
 * on heap layout, and it is the same in both edge modes (a lazy edge keeps the birth of its slot).
 */
interface Rank {
  g: number;
  sig: string;
  born: number;
  slot: number;
}

interface Exact extends Rank {
  kind: "exact";
  state: PlanState;
  key: string;
  path: PathLink;
}

/** An unbuilt edge, queued at parent g + its admissible bound. */
interface Deferred extends Rank {
  kind: "lazy";
  key: string;
  parent: Exact;
  order: number;
  edge: LazyEdge;
}

type Node = Exact | Deferred;

/**
 * "lazy" (the default) builds a LazyEdge only when its bound is the cheapest thing left — standard
 * branch and bound: the bound never exceeds the edge's cost, so the built node still enters the
 * heap before any node it would have preceded, and the plan, totals and `expanded` are exactly the
 * eager search's. "eager" builds every edge at once; it is the reference the tests hold lazy to.
 */
export type EdgeMode = "lazy" | "eager";

const nextG = (g: number, move: Move, ctx: PlanCtx): number => {
  const c = rankCost(move, ctx);
  return move.restartP != null ? (g + c) / move.restartP : g + c;
};

const sigOf = (sig: string, order: number, methodId: string): string => `${sig}${String(order).padStart(3, "0")}:${methodId}|`;

const before = (a: Rank, b: Rank): boolean => {
  if (a.g < b.g - 1e-9) return true;
  if (Math.abs(a.g - b.g) > 1e-9) return false;
  if (a.sig !== b.sig) return a.sig < b.sig;
  return a.born !== b.born ? a.born < b.born : a.slot < b.slot;
};

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

function child(parent: Exact | null, move: Move, order: number, rank: Omit<Rank, "g">, ctx: PlanCtx): Exact {
  const g = parent ? nextG(parent.g, move, ctx) : rankCost(move, ctx);
  return { kind: "exact", state: move.next, key: stateKey(move.next), g, sig: rank.sig, born: rank.born, slot: rank.slot, path: { move, order, prev: parent?.path ?? null } };
}

/** The open list: the cheapest exact node per item, plus every unbuilt edge still worth building. */
class Frontier {
  readonly heap = new Heap();
  readonly best = new Map<string, Exact>();
  constructor(private readonly ctx: PlanCtx) {}

  offer(n: Exact): void {
    const prev = this.best.get(n.key);
    if (prev && !before(n, prev)) return;
    this.best.set(n.key, n);
    this.heap.push(n);
  }

  /** Queue an unbuilt edge, unless its item is already reached at or under its bound (the cost can only be higher). */
  defer(n: Deferred): void {
    const prev = this.best.get(n.key);
    if (prev && before(prev, n)) return;
    this.heap.push(n);
  }

  expand(node: Exact, born: number, mode: EdgeMode): void {
    edgesFrom(node.state, this.ctx).forEach((e, slot) => {
      const sig = sigOf(node.sig, e.order, e.move ? e.move.methodId : e.lazy.methodId);
      const rank = { sig, born, slot };
      if (e.move) return this.offer(child(node, e.move, e.order, rank, this.ctx));
      if (mode === "lazy") return this.defer({ kind: "lazy", key: stateKey(e.lazy.next), g: node.g + e.lazy.bound, ...rank, parent: node, order: e.order, edge: e.lazy });
      const move = e.lazy.build();
      if (!move) return;
      const n = child(node, move, e.order, rank, this.ctx);
      // every eager run checks the lazy search's premise at every expanded state: the bound never exceeds the cost
      if (n.g < node.g + e.lazy.bound - 1e-9) throw new Error(`planner bug: ${move.methodId} costs ${n.g - node.g} under its search bound ${e.lazy.bound}`);
      this.offer(n);
    });
  }

  /** A deferred edge whose bound came up: tighten it (re-queue) or build it and queue the real node at its exact cost. */
  materialise(d: Deferred): void {
    const prev = this.best.get(d.key);
    if (prev && before(prev, d)) return;
    if (d.edge.refine) {
      const tighter = d.edge.refine();
      if (!tighter) return;
      // both bounds are admissible: the larger one is too
      const bound = Math.max(tighter.bound, d.edge.bound);
      return this.defer({ ...d, g: d.parent.g + bound, edge: { ...tighter, bound } });
    }
    const move = d.edge.build();
    if (!move) return;
    const n = child(d.parent, move, d.order, { sig: d.sig, born: d.born, slot: d.slot }, this.ctx);
    // fail loudly: either would let the lazy search return a different plan than the eager one
    if (n.key !== d.key || move.restartP != null) throw new Error(`planner bug: lazy ${move.methodId} edge named a different item or restarts the plan`);
    if (n.g < d.g - 1e-9) throw new Error(`planner bug: ${move.methodId} costs ${n.g - d.parent.g} under its search bound ${d.edge.bound}`);
    this.offer(n);
  }
}

/** Cheapest plan from any allowed start to a state where every target (and the quality goal) is met. */
export function searchPlan(ctx: PlanCtx, cap: number = SEARCH_CAP, deadline: Deadline | null = null, mode: EdgeMode = "lazy"): SearchResult {
  const started = deadline?.now() ?? 0;
  const open = new Frontier(ctx);
  startMoves(ctx).forEach((move, slot) => open.offer(child(null, move, 0, { sig: sigOf("", 0, move.methodId), born: 0, slot }, ctx)));
  let expanded = 0;
  const overdue = (): void => {
    if (deadline && deadline.now() >= deadline.at) throw new SearchTimeoutError(deadline.now() - started, expanded);
  };
  while (open.heap.size > 0) {
    const node = open.heap.pop();
    if (node.kind === "lazy") {
      overdue();
      open.materialise(node);
      continue;
    }
    if (open.best.get(node.key) !== node) continue;
    if (allMet(ctx, node.state)) return { moves: unwind(node.path), expanded };
    if (++expanded > cap) throw new SearchCappedError(cap);
    overdue();
    open.expand(node, expanded, mode);
  }
  throw new NoPlanError(ctx.includeUnverified);
}
