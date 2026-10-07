import { DESECRATE_METHODS } from "./methodsDesecrate";
import { FILL_METHODS } from "./methodsFill";
import { JEWEL_METHODS } from "./methodsJewel";
import { PREP_METHODS } from "./methodsPrep";
import { QUALITY_METHODS } from "./methodsQuality";
import { WRITE_METHODS } from "./methodsWrite";
import type { LazyEdge, Method, Move, PlanCtx, PlanState } from "./types";

/**
 * The planner's method library. `order` is only the tie-break between equal-cost plans; which
 * method runs when is decided by the search (search.ts), never by this list.
 */
export const ALL_METHODS: readonly Method[] = [...PREP_METHODS, ...FILL_METHODS, ...WRITE_METHODS, ...DESECRATE_METHODS, ...QUALITY_METHODS, ...JEWEL_METHODS].sort((a, b) => a.order - b.order);

const orderOf = new Map(ALL_METHODS.map((m) => [m.id, m.order]));

/** One outgoing edge: a built Move, or a LazyEdge the search builds when its bound is reached. */
export type Edge = { order: number; move: Move; lazy: null } | { order: number; move: null; lazy: LazyEdge };

/** Every edge from a state, in method order: lazy-capable methods offer theirs unbuilt. */
export function edgesFrom(state: PlanState, ctx: PlanCtx): Edge[] {
  const out: Edge[] = [];
  for (const m of ALL_METHODS) {
    const order = orderOf.get(m.id)!;
    if (m.lazy) for (const lazy of m.lazy(state, ctx)) out.push({ order, move: null, lazy });
    else for (const move of m.moves(state, ctx)) out.push({ order, move, lazy: null });
  }
  return out;
}

/** Every move every method offers from a state (each one already legality-checked). */
export function movesFrom(state: PlanState, ctx: PlanCtx): Array<{ move: Move; order: number }> {
  return ALL_METHODS.flatMap((m) => m.moves(state, ctx).map((move) => ({ move, order: orderOf.get(m.id)! })));
}
