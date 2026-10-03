import type { AffixSide } from "../craftmoves/catalog";
import { solveChain, useOf } from "./expectation";
import { makeMove, mat, sideOmen, step, targetText } from "./methodKit";
import { addOdds } from "./odds";
import { sources, type SourceId } from "./sources";
import { isJunk, isOverCap, openOf, SIDES } from "./state";
import type { Estimate, Move, PlanCtx, PlanState, StepText } from "./types";
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

/** The chain and its expected uses at the prior and both band ends, or null when it can't be modelled. */
function solved(state: PlanState, ctx: PlanCtx, scope: WhittleScope, ids: (g: WhittleGraph) => string[]): { g: WhittleGraph; uses: Array<Record<string, number>> } | null {
  try {
    const g = buildWhittleGraph(state, ctx, scope);
    if (!g.whittles) return null;
    return { g, uses: [1, 2, 0.5].map((scale) => solveChain(chainAt(g, scale), g.start.id, ids(g))) };
  } catch (e: unknown) {
    if (e instanceof WhittleOutOfScopeError) return null;
    throw e;
  }
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

function whittleMove(state: PlanState, ctx: PlanCtx, scope: WhittleScope): Move | null {
  const e = firstOdds(ctx, state, scope);
  const omen = mat("omenWhittling");
  const matsOf = (g: WhittleGraph) => [omen, ...SIDES.filter((s) => g.erasures.has(s)).map((s) => mat(sideOmen(s, "Erasure").key)), mat("chaos")];
  const out = e ? solved(state, ctx, scope, (g) => matsOf(g).map((m) => m.id)) : null;
  if (!e || !out) return null;
  const point = out.g;
  const [p, lo, hi] = out.uses;
  // a click only the dear end of the band reaches (hits ×½) is not part of the plan the player reads
  const used = (id: string): boolean => p![id]! > 1e-9;
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
    uses: mats.map((m) => useOf(m, { point: p![m.id]!, low: lo![m.id]!, high: hi![m.id]! })),
    odds: e,
    grade: point.ties ? "ss" : "vp",
    facts: point.ties ? [TIE_FACT] : [],
    adds: true,
    checks: [{ state, rules: ["omen-whittling"] }, ...erasureSides.map((s) => ({ state: point.erasures.get(s)!, rules: [sideOmen(s, "Erasure").rule] }))],
    undoRisk: point.undoes,
  });
}

/** One move per missing natural target the loop can reach from this item. */
export function whittleLoop(state: PlanState, ctx: PlanCtx): Move[] {
  // an over-cap jewel refuses some Chaos clicks outright ("no space"): not modelled here
  if (state.rarity !== "Rare" || isOverCap(ctx, state)) return [];
  const out: Move[] = [];
  for (const t of ctx.targets) {
    const scope = whittleScope(state, ctx, t);
    const move = scope ? whittleMove(state, ctx, scope) : null;
    if (move) out.push(move);
  }
  return out;
}
