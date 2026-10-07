import type { AffixSide } from "../craftmoves/catalog";
import { solveChain, useOf } from "./expectation";
import { makeMove, mat, sideOmen, step, targetText } from "./methodKit";
import { addOdds } from "./odds";
import { sources, type SourceId } from "./sources";
import { isJunk, isOverCap, openOf, SIDES } from "./state";
import { whittleBound, whittlePreparedBound } from "./edgeBounds";
import type { Estimate, LazyEdge, Move, PlanCtx, PlanState, StepText } from "./types";
import { buildWhittleGraph, chainAt, whittleScope, whittleStateAt, WhittleOutOfScopeError, type WhittleGraph, type WhittleScope } from "./whittleChain";

/**
 * The whittle loop: kept targets + one throwaway, then Omen of Whittling + Chaos Orb until the next
 * target lands. Whittling makes the Chaos remove the lowest-LEVEL mod, so high-level kept mods are
 * safe while the throwaway sits below them — unlike a side-steered Annulment, which takes a landed
 * target as often as the throwaway. The risk that a new throwaway rolls at or above a kept mod's
 * level (and the next Whittle takes that mod) is costed exactly in whittleChain.ts.
 */

const TIE_FACT = "When several mods share the lowest level the game marks them all as \"may be removed\"; the planner assumes each is equally likely to go.";

/** P(the first Chaos add lands the target), with the same pool and prior as every other Chaos add. */
function firstOdds(ctx: PlanCtx, state: PlanState, scope: WhittleScope): Estimate | null {
  const after = whittleStateAt(state, scope, scope.missing0, []);
  const sides = SIDES.filter((s) => openOf(ctx, after, s) > 0);
  const junkAfter = after.affixes.filter((a) => isJunk(a) && a.side !== "any" && sides.includes(a.side)).length;
  const odds = addOdds(ctx, after, { sides, floor: null, catalyst: null, quality: 0, junkAfter }, [scope.target.idx]);
  return (odds.p.get(scope.target.idx) ?? 0) > 0 ? odds.estimate(scope.target.idx) : null;
}

/** Null when the chain can't be modelled (a write it can't win back would go, too many states, never absorbing). */
function inScope<T>(f: () => T): T | null {
  try {
    return f();
  } catch (e: unknown) {
    if (e instanceof WhittleOutOfScopeError) return null;
    throw e;
  }
}

/** The first half of a whittle Move: its graph and the expected uses at the prior — all its tighter search bound needs. */
interface WhittlePrep {
  e: Estimate;
  g: WhittleGraph;
  /** Expected uses at the prior, by material id (matsOf). */
  point: Record<string, number>;
}

const matsOf = (g: WhittleGraph) => [mat("omenWhittling"), ...SIDES.filter((s) => g.erasures.has(s)).map((s) => mat(sideOmen(s, "Erasure").key)), mat("chaos")];

function prepare(state: PlanState, ctx: PlanCtx, scope: WhittleScope): WhittlePrep | null {
  const e = firstOdds(ctx, state, scope);
  if (!e) return null;
  const g = inScope(() => buildWhittleGraph(state, ctx, scope));
  if (!g || !g.whittles) return null;
  const point = inScope(() => solveChain(chainAt(g, 1), g.start.id, matsOf(g).map((m) => m.id)));
  return point ? { e, g, point } : null;
}

function whyText(scope: WhittleScope, chain: WhittleGraph): string {
  const keptLevel = Math.min(...scope.chain.slice(0, -1).map((c) => c.level), ...scope.fixed.map((f) => f.level));
  const base = `Whittling makes the Chaos remove the lowest-level mod — the throwaway, while it sits below your kept mods (the lowest is modifier level ${keptLevel}) — and the Chaos then adds one random mod. Hover the Chaos Orb with the omen active before each click: the yellow mods are the ones that may go.`;
  if (!chain.undoes) return base;
  return `${base} A new throwaway at level ${keptLevel} or above can make the next Whittle take a kept mod instead (tied mods: any yellow one may go); winning it back is in the cost.`;
}

function erasureStep(side: AffixSide): StepText {
  const omen = mat(sideOmen(side, "Erasure").key);
  return step({
    do: `Throwaway is the only removable ${side} → ${omen.label} + Chaos Orb instead.`,
    why: `The omen makes the Chaos remove a ${side}, and the throwaway is the only one that can go — a sure removal that never risks a kept mod, and it also clears a throwaway that rolled above your kept mods' level (Whittling never would).`,
    sources: sources("kb-omens", "kb-currency"),
    mats: [omen, mat("chaos")],
  });
}

/** The Move from its prepared half: the band ends' solves, the guide text and the legality checks. */
function finish(state: PlanState, ctx: PlanCtx, scope: WhittleScope, prep: WhittlePrep): Move | null {
  const { e, g: point, point: p } = prep;
  const ids = matsOf(point).map((m) => m.id);
  const ends = inScope(() => [2, 0.5].map((scale) => solveChain(chainAt(point, scale), point.start.id, ids)));
  if (!ends) return null;
  const [lo, hi] = ends;
  const omen = mat("omenWhittling");
  // a click only the dear end of the band reaches (hits ×½) is not part of the plan the player reads
  const used = (id: string): boolean => p[id]! > 1e-9;
  if (!used(omen.id)) return null;
  const erasureSides = SIDES.filter((s) => point.erasures.has(s) && used(mat(sideOmen(s, "Erasure").key).id));
  const mats = matsOf(point).filter((m) => used(m.id));
  const t = scope.target;
  return makeMove(ctx, {
    methodId: "whittle-loop",
    title: targetText(t.text),
    next: whittleStateAt(state, scope, 0, []),
    steps: [
      step({
        do: `${omen.label} + Chaos Orb until ${targetText(t.text)}.`,
        why: whyText(scope, point),
        sources: sources("kb-omens", "kb-currency", ...(point.ties ? (["owner-test-2026-10-02"] as SourceId[]) : [])),
        mats: [omen, mat("chaos")],
        check: `${targetText(t.text)} (or a better tier) is on the item, and every mod you kept is still there.`,
      }),
      ...erasureSides.map(erasureStep),
    ],
    uses: mats.map((m) => useOf(m, { point: p[m.id]!, low: lo![m.id]!, high: hi![m.id]! })),
    odds: e,
    grade: point.ties ? "ss" : "vp",
    facts: point.ties ? [TIE_FACT] : [],
    adds: true,
    checks: [{ state, rules: ["omen-whittling"] }, ...erasureSides.map((s) => ({ state: point.erasures.get(s)!, rules: [sideOmen(s, "Erasure").rule] }))],
    undoRisk: point.undoes,
  });
}

/** One edge per missing natural target the loop may reach from this item; the chain is built only on demand. */
export function whittleEdges(state: PlanState, ctx: PlanCtx): LazyEdge[] {
  // an over-cap jewel refuses some Chaos clicks outright ("no space"): not modelled here
  if (state.rarity !== "Rare" || isOverCap(ctx, state)) return [];
  const out: LazyEdge[] = [];
  for (const t of ctx.targets) {
    const scope = whittleScope(state, ctx, t);
    if (!scope) continue;
    const next = whittleStateAt(state, scope, 0, []);
    // two steps: the cheap level-1 bound, then (when that comes up) the graph and its prior solve,
    // which bound the cost far tighter; most loops on a dearer route than the plan stop there
    const refine = (): LazyEdge | null => {
      const prep = prepare(state, ctx, scope);
      return prep ? { methodId: "whittle-loop", next, bound: whittlePreparedBound(state, ctx, scope, prep.point), build: () => finish(state, ctx, scope, prep) } : null;
    };
    out.push({ methodId: "whittle-loop", next, bound: whittleBound(state, ctx, scope), build: () => whittleMove(state, ctx, scope), refine });
  }
  return out;
}

function whittleMove(state: PlanState, ctx: PlanCtx, scope: WhittleScope): Move | null {
  const prep = prepare(state, ctx, scope);
  return prep ? finish(state, ctx, scope, prep) : null;
}

/** One move per missing natural target the loop can reach from this item. */
export function whittleLoop(state: PlanState, ctx: PlanCtx): Move[] {
  return whittleEdges(state, ctx).flatMap((e) => e.build() ?? []);
}
