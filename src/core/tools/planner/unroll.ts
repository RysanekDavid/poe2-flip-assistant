import type { BandView, PlanMaterialView, PlanStepView } from "../../../lib/tools/craftPlannerContract";
import { assertGuideRetryRefs } from "../../craftRetry";
import type { CraftGuide, GuideStep, RetryRef } from "../../craftRecipes";
import { combineBasis, mergeUses, scaleBand } from "./expectation";
import { targetText } from "./methodKit";
import type { Band, Basis, MaterialUse, Move, PlanCtx, StepText } from "./types";

/**
 * Plan (a list of macro moves) → the step views, the CraftGuide the session wizard already runs, and
 * the materials bill. A move whose miss restarts the plan (a fracture) multiplies every earlier
 * quantity by 1/p: you buy and rework that many bases on average.
 */

export interface Unrolled {
  steps: PlanStepView[];
  guide: CraftGuide;
  bill: PlanMaterialView[];
  totals: { div: BandView | null; exalt: BandView | null; basis: Basis };
  unpriced: string[];
}

/** scale[i] = Π 1/p over every restart move at or after i; an estimated p widens the band. */
function restartScales(moves: readonly Move[]): Band[] {
  const out: Band[] = moves.map(() => ({ point: 1, low: 1, high: 1 }));
  let k: Band = { point: 1, low: 1, high: 1 };
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]!;
    if (m.restartP != null) {
      const lo = m.odds.high ?? m.restartP;
      const hi = m.odds.low ?? m.restartP;
      k = { point: k.point / m.restartP, low: k.low / lo, high: k.high / hi };
    }
    out[i] = k;
  }
  return out;
}

const mulBand = (a: Band, b: Band): Band => ({ point: a.point * b.point, low: a.low * b.low, high: a.high * b.high });

const used = (u: MaterialUse): boolean => u.qty.high > 0;

function priceLine(u: MaterialUse, ctx: PlanCtx): PlanMaterialView {
  const unit = ctx.priceOf(u.mat.id);
  const usable = unit != null && Number.isFinite(unit) && unit > 0 ? unit : null;
  return { id: u.mat.id, label: u.mat.label, group: u.mat.group, qty: u.qty, unitDiv: usable, totalDiv: usable == null ? null : scaleBand(u.qty, usable) };
}

function sumTotals(lines: readonly PlanMaterialView[]): Band | null {
  if (lines.some((l) => l.totalDiv == null)) return null;
  return lines.reduce<Band>((acc, l) => ({ point: acc.point + l.totalDiv!.point, low: acc.low + l.totalDiv!.low, high: acc.high + l.totalDiv!.high }), { point: 0, low: 0, high: 0 });
}

/** Unique phase titles: a retry names its phase by title, so a repeat gets " (2)". */
function phaseTitles(moves: readonly Move[]): string[] {
  const seen = new Map<string, number>();
  return moves.map((m) => {
    const n = (seen.get(m.title) ?? 0) + 1;
    seen.set(m.title, n);
    return n === 1 ? m.title : `${m.title} (${n})`;
  });
}

function retryRef(s: StepText, title: string, first: string): RetryRef | null {
  if (s.retry === "self") return { phase: title, step: 1 };
  if (s.retry === "start") return { phase: first, step: 1 };
  return null;
}

function guideStep(s: StepText, ref: RetryRef | null, unverified: string | null): GuideStep {
  const g: GuideStep = { do: s.do, why: s.why };
  if (s.mats.length > 0) g.mats = [...s.mats];
  if (s.check) g.check = s.check;
  if (s.pick.length > 0) g.pick = [...s.pick];
  if (s.onFail) g.onFail = s.onFail;
  if (ref) g.retryFrom = ref;
  if (unverified) g.unverified = unverified;
  return g;
}

function stepView(move: Move, index: number, title: string, first: string, scale: Band, ctx: PlanCtx): PlanStepView {
  const materials = mergeUses(move.uses.map((u) => ({ mat: u.mat, qty: mulBand(u.qty, scale) })))
    .filter(used)
    .map((u) => priceLine(u, ctx));
  return {
    index,
    phase: title,
    method: move.methodId,
    instructions: move.steps.map((s) => ({ do: s.do, why: s.why, check: s.check, pick: [...s.pick], onFail: s.onFail, retryTo: retryRef(s, title, first) })),
    odds: move.odds,
    cost: { div: sumTotals(materials), basis: move.costBasis },
    restartP: move.restartP,
    materials,
    rules: [...move.ruleIds],
    grade: move.grade,
    unverified: move.unverified,
    after: {
      rarity: move.next.rarity,
      quality: move.next.quality,
      catalyst: move.next.catalyst,
      affixes: move.next.affixes.map((a) => ({ side: a.side, kind: a.kind, target: a.target, unrevealed: a.unrevealed })),
    },
  };
}

function guideHeader(moves: readonly Move[], ctx: PlanCtx): Pick<CraftGuide, "goal" | "shopping" | "marketCheck" | "brick"> {
  const goal = ctx.targets.map((t) => `${t.fractured ? "FRACTURED " : ""}${targetText(t.text)}`).join("; ");
  const restarts = moves.filter((m) => m.restartP != null);
  return {
    goal: `Rare ${ctx.base.name} (item level ${ctx.base.ilvl}+) with ${goal}${ctx.quality ? `; ${ctx.quality.pct}% catalyst quality` : ""}.`,
    shopping: moves[0]!.steps[0]!.do,
    marketCheck: "Price the finished item before you start: the bill is the expected spend without the base, and every add-a-mod figure is an estimate.",
    brick: restarts.length > 0
      ? `${restarts.map((r) => `${r.title} (1 in ${Math.round(1 / r.restartP!)} succeeds)`).join(", ")}: a miss can't be repaired — start over on a new base; the bill already counts the extra bases' work.`
      : "No step bricks the item: every miss has its retry inside the step.",
  };
}

export function unrollPlan(moves: readonly Move[], ctx: PlanCtx, exaltPerDivine: number | null): Unrolled {
  if (moves.length === 0) throw new Error("planner bug: empty plan");
  const titles = phaseTitles(moves);
  const scales = restartScales(moves);
  const steps = moves.map((m, i) => stepView(m, i, titles[i]!, titles[0]!, scales[i]!, ctx));
  const guide: CraftGuide = {
    ...guideHeader(moves, ctx),
    phases: moves.map((m, i) => ({
      title: titles[i]!,
      steps: m.steps.map((s, k) => guideStep(s, retryRef(s, titles[i]!, titles[0]!), k === 0 ? m.unverified : null)),
    })),
  };
  // a generated guide with a broken retry jump is a planner bug: fail here, not mid-craft
  assertGuideRetryRefs("craft-planner", guide);
  const bill = mergeUses(moves.flatMap((m, i) => m.uses.map((u) => ({ mat: u.mat, qty: mulBand(u.qty, scales[i]!) }))))
    .filter(used)
    .map((u) => priceLine(u, ctx));
  const div = sumTotals(bill);
  const exalt = div && exaltPerDivine && exaltPerDivine > 0 ? scaleBand(div, exaltPerDivine) : null;
  return {
    steps,
    guide,
    bill,
    totals: { div, exalt, basis: combineBasis(...moves.map((m) => m.costBasis)) },
    unpriced: bill.filter((l) => l.unitDiv == null).map((l) => l.label),
  };
}
