import type { AlternativeView, PlanRequest, PlanStepView, TargetChangeView } from "../../../lib/tools/craftPlannerContract";
import { UNPRICED_RANK_DIV } from "./search";
import type { PlanCtx, ResolvedTarget } from "./types";
import type { Unrolled } from "./unroll";

/**
 * Cheaper versions of a request whose plan has an impractical step: lower the minimum tier of the
 * targets that step lands, one tier at a time (all of them together, or one alone), or drop one.
 * Every alternative is planned by the SAME planner (no shortcut odds), so picking one reproduces
 * exactly the cost shown on its chip.
 */

export const MAX_ALTERNATIVES = 3;
/** Full re-plans spent per request (each is a whole search): bounds the extra latency. */
export const ALTERNATIVE_BUDGET = 10;
/** A target is lowered at most this many tiers below what the player asked for. */
export const MAX_RELAX = 4;

export interface Costed {
  ctx: PlanCtx;
  out: Unrolled;
}

/** Plan a request; null when there is no plan for it (refused targets, no method, search cap). */
export type Evaluate = (req: PlanRequest) => Costed | null;

/** Ranking cost of a plan: priced lines at their price, an unpriced one at the search's stand-in. */
export function planScore(out: Pick<Unrolled, "bill">): number {
  return out.bill.reduce((sum, l) => sum + l.qty.point * (l.unitDiv ?? UNPRICED_RANK_DIV), 0);
}

const isImpractical = (out: Unrolled): boolean => out.steps.some((s) => s.impractical != null);

/** The family's tiers, lowest level first (the order the picker numbers them in). */
function tiersOf(ctx: PlanCtx, t: ResolvedTarget): Array<{ modId: string; level: number }> {
  return Object.entries(ctx.combo[t.side][t.family] ?? {})
    .map(([modId, level]) => ({ modId, level }))
    .sort((a, b) => a.level - b.level || a.modId.localeCompare(b.modId));
}

function tierRef(ctx: PlanCtx, t: ResolvedTarget, modId: string): TargetChangeView["from"] {
  const tiers = tiersOf(ctx, t);
  const i = tiers.findIndex((x) => x.modId === modId);
  const mod = ctx.cat.mods[modId];
  if (i < 0 || !mod) throw new Error(`planner bug: ${modId} is not a tier of ${t.family}`);
  return { modId, text: mod.text, level: tiers[i]!.level, k: i + 1, n: tiers.length };
}

/** The tier `depth` below the target's minimum, or null when the family has none that low. */
function relaxed(ctx: PlanCtx, t: ResolvedTarget, depth: number): TargetChangeView | null {
  const tiers = tiersOf(ctx, t);
  const to = tiers[tiers.findIndex((x) => x.modId === t.modId) - depth];
  if (!to) return null;
  return { kind: "relax", target: t.idx, side: t.side, family: t.family, from: tierRef(ctx, t, t.modId), to: tierRef(ctx, t, to.modId) };
}

const landed = (s: PlanStepView | undefined): Set<number> =>
  new Set((s?.after.affixes ?? []).flatMap((a) => (a.target != null && !a.unrevealed ? [a.target] : [])));

/** Natural targets an impractical step lands — the ones whose odds make the step explode. */
function focusTargets(ctx: PlanCtx, steps: readonly PlanStepView[]): ResolvedTarget[] {
  const out = new Set<number>();
  steps.forEach((s, i) => {
    if (!s.impractical) return;
    const before = landed(steps[i - 1]);
    for (const idx of landed(s)) if (!before.has(idx)) out.add(idx);
  });
  return [...out].sort((a, b) => a - b).map((i) => ctx.targets[i]!).filter((t) => t.source === "natural");
}

function applyChanges(req: PlanRequest, changes: readonly TargetChangeView[]): PlanRequest["targets"] {
  const to = new Map(changes.flatMap((c) => (c.kind === "relax" ? [[c.target, c.to.modId] as const] : [])));
  const gone = new Set(changes.filter((c) => c.kind === "drop").map((c) => c.target));
  return req.targets.flatMap((t, i) => (gone.has(i) ? [] : [{ ...t, minModId: to.get(i) ?? t.minModId }]));
}

interface Found {
  key: string;
  score: number;
  alt: AlternativeView;
}

/** Realistic first, then cheaper; the key keeps equal plans in a stable order. */
const better = (a: Found, b: Found): number => Number(a.alt.impractical) - Number(b.alt.impractical) || a.score - b.score || a.key.localeCompare(b.key);

/** Plans candidate changes within the budget and keeps the best one per key. */
class Explorer {
  private budget = ALTERNATIVE_BUDGET;
  readonly best = new Map<string, Found>();
  constructor(
    private readonly req: PlanRequest,
    private readonly evaluate: Evaluate,
  ) {}

  get spent(): boolean {
    return this.budget <= 0;
  }

  /** The candidate's result: realistic, still impractical, or null when it has no plan / no budget. */
  attempt(key: string, changes: readonly TargetChangeView[]): Found | null {
    if (this.spent) return null;
    this.budget -= 1;
    const targets = applyChanges(this.req, changes);
    const got = this.evaluate({ ...this.req, targets });
    if (!got) return null;
    const totals = { div: got.out.totals.div, basis: got.out.totals.basis };
    const found: Found = { key, score: planScore(got.out), alt: { changes: [...changes], targets, totals, impractical: isImpractical(got.out) } };
    const prev = this.best.get(key);
    if (!prev || better(found, prev) < 0) this.best.set(key, found);
    return found;
  }
}

/** Lower every focus target together, one tier per round, until the plan is realistic. */
function relaxAll(x: Explorer, ctx: PlanCtx, focus: readonly ResolvedTarget[]): void {
  if (focus.length < 2) return;
  for (let depth = 1; depth <= MAX_RELAX; depth++) {
    const changes = focus.flatMap((t) => relaxed(ctx, t, depth) ?? []);
    if (changes.length === 0) return;
    const found = x.attempt("all", changes);
    if (!found || !found.alt.impractical) return;
  }
}

/** Lower one target at a time (breadth-first, so every target gets its first tier before any gets a second). */
function relaxEach(x: Explorer, ctx: PlanCtx, focus: readonly ResolvedTarget[]): void {
  const open = new Set(focus.map((t) => t.idx));
  for (let depth = 1; depth <= MAX_RELAX && !x.spent; depth++) {
    for (const t of focus) {
      if (!open.has(t.idx)) continue;
      const change = relaxed(ctx, t, depth);
      const found = change ? x.attempt(`relax:${t.idx}`, [change]) : null;
      // the smallest drop in tier that makes the plan realistic is the one worth offering
      if (!found || !found.alt.impractical) open.delete(t.idx);
    }
  }
}

export function suggestAlternatives(req: PlanRequest, base: Costed, evaluate: Evaluate): AlternativeView[] {
  const { ctx } = base;
  const focus = focusTargets(ctx, base.out.steps);
  const x = new Explorer(req, evaluate);
  relaxAll(x, ctx, focus);
  if (req.targets.length > 1) {
    for (const t of focus) x.attempt(`drop:${t.idx}`, [{ kind: "drop", target: t.idx, side: t.side, family: t.family, from: tierRef(ctx, t, t.modId) }]);
  }
  relaxEach(x, ctx, focus);
  const baseScore = planScore(base.out);
  return [...x.best.values()].filter((f) => f.score < baseScore).sort(better).slice(0, MAX_ALTERNATIVES).map((f) => f.alt);
}
