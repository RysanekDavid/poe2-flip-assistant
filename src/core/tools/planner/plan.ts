import { RULES_PATCH, RULES_REVERIFY_AFTER, rulesStale } from "../../../lib/tools/craftMovesContract";
import type { PlanRequest, PlanResponse } from "../../../lib/tools/craftPlannerContract";
import type { CraftCatalog } from "../craftmoves/catalog";
import { suggestAlternatives, type Costed, type Suggested } from "./alternatives";
import { NoPlanError, searchPlan, SearchCappedError, SearchTimeoutError, SEARCH_CAP, type Deadline, type SearchResult } from "./search";
import { isFeasible, resolveBase, resolveTargets, type FeasibilityIssue } from "./targets";
import type { PlanCtx } from "./types";
import { unrollPlan } from "./unroll";

/**
 * The pure planner: request + catalog + live prices → plan. No I/O (load.ts wires the DB), so the
 * golden tests drive it with fixture prices and get byte-identical output for the same input.
 */

export class PlanRejectedError extends Error {
  constructor(
    message: string,
    readonly issues: FeasibilityIssue[],
  ) {
    super(message);
    this.name = "PlanRejectedError";
  }
}

/** The search took longer than the server allows (503: the planner shares the web server's thread). */
export class PlanTimeoutError extends Error {
  constructor(readonly elapsedMs: number) {
    super("Working this plan out took too long, so the planner stopped. Try fewer targets, or a lower minimum tier on the mods you want.");
    this.name = "PlanTimeoutError";
  }
}

/**
 * Wall-clock limits. The planner is synchronous on the web server's only thread, so a slow plan
 * stalls every other request: the main search fails loudly past `searchMs`, and the cheaper-target
 * search stops at `alternativesMs` with what it found (alternativesTruncated).
 */
export interface PlanBudget {
  searchMs: number;
  alternativesMs: number;
  now: () => number;
}

/** What the server route uses. */
export const SERVER_PLAN_BUDGET: PlanBudget = { searchMs: 3000, alternativesMs: 1200, now: () => performance.now() };

export interface PlanDeps {
  cat: CraftCatalog;
  /** ninja id → Divine per unit (only positive, finite prices). */
  prices: ReadonlyMap<string, number>;
  exaltPerDivine: number | null;
  league: string;
  now: Date;
  /** Material id → art URL; materials without art are simply left out. */
  iconOf?: (materialId: string) => string | null;
  /** Wall-clock limits; absent = none (tests and offline scripts want byte-identical output). */
  budget?: PlanBudget;
}

const deadlineIn = (budget: PlanBudget | undefined, ms: (b: PlanBudget) => number): Deadline | null => (budget ? { at: budget.now() + ms(budget), now: budget.now } : null);

function iconsFor(ids: Iterable<string>, iconOf: PlanDeps["iconOf"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!iconOf) return out;
  for (const id of ids) {
    const icon = iconOf(id);
    if (icon) out[id] = icon;
  }
  return out;
}

export function buildCtx(req: PlanRequest, deps: PlanDeps): { ctx: PlanCtx; issues: FeasibilityIssue[] } {
  const { base, combo } = resolveBase(deps.cat, req.itemClass, req.base, req.ilvl);
  const { targets, issues } = resolveTargets(deps.cat, combo, base, req.targets, req.quality);
  const ctx: PlanCtx = {
    cat: deps.cat,
    combo,
    base,
    targets,
    priceOf: (id) => deps.prices.get(id) ?? null,
    includeUnverified: req.includeUnverified,
    quality: req.quality,
  };
  return { ctx, issues };
}

function search(ctx: PlanCtx, issues: FeasibilityIssue[], deadline: Deadline | null): ReturnType<typeof searchPlan> {
  try {
    return searchPlan(ctx, () => 0, SEARCH_CAP, deadline);
  } catch (e: unknown) {
    if (e instanceof NoPlanError || e instanceof SearchCappedError) throw new PlanRejectedError(e.message, issues);
    throw e;
  }
}

/** Every material the plan names: the bill, each step, the session wizard's per-step mats, the catalyst. */
function planMaterialIds(out: ReturnType<typeof unrollPlan>, req: PlanRequest): Set<string> {
  return new Set([
    ...out.bill.map((l) => l.id),
    ...out.steps.flatMap((s) => s.materials.map((m) => m.id)),
    ...out.guide.phases.flatMap((p) => p.steps.flatMap((s) => (s.mats ?? []).map((m) => m.id))),
    ...(req.quality ? [req.quality.catalyst] : []),
  ]);
}

interface Planned extends Costed {
  issues: FeasibilityIssue[];
  found: SearchResult;
}

function planCore(req: PlanRequest, deps: PlanDeps, deadline: Deadline | null): Planned {
  const { ctx, issues } = buildCtx(req, deps);
  if (!isFeasible(issues)) throw new PlanRejectedError("these targets can't all be on one item", issues);
  const found = search(ctx, issues, deadline);
  return { ctx, issues, found, out: unrollPlan(found.moves, ctx, deps.exaltPerDivine) };
}

/** Cheaper target sets, only when some step is past the sanity limit; a candidate with no plan is just not offered. */
function alternativesFor(req: PlanRequest, deps: PlanDeps, planned: Planned): Suggested {
  if (!planned.out.steps.some((s) => s.impractical)) return { alternatives: [], truncated: false };
  // one deadline for the whole cheaper-target search: each candidate's search stops at it too
  const deadline = deadlineIn(deps.budget, (b) => b.alternativesMs);
  const evaluate = (r: PlanRequest) => {
    try {
      return planCore(r, deps, deadline);
    } catch (e: unknown) {
      if (e instanceof PlanRejectedError) return null;
      throw e;
    }
  };
  return suggestAlternatives(req, planned, evaluate, deadline);
}

/** The main plan; past the budget it fails loudly instead of holding the server. */
function planMain(req: PlanRequest, deps: PlanDeps): Planned {
  try {
    return planCore(req, deps, deadlineIn(deps.budget, (b) => b.searchMs));
  } catch (e: unknown) {
    if (e instanceof SearchTimeoutError) throw new PlanTimeoutError(e.elapsedMs);
    throw e;
  }
}

/** Throws UnknownPlannerBaseError (404), PlanRejectedError (422, with the graded reasons) and PlanTimeoutError (503). */
export function planCraft(req: PlanRequest, deps: PlanDeps): PlanResponse {
  const planned = planMain(req, deps);
  const { ctx, issues, found, out } = planned;
  const alt = alternativesFor(req, deps, planned);
  return {
    kind: "plan",
    league: deps.league,
    base: { name: ctx.base.name, itemClass: req.itemClass, ilvl: ctx.base.ilvl },
    targets: ctx.targets.map((t) => ({ idx: t.idx, modId: t.modId, text: t.text, side: t.side, level: t.level, source: t.source, fractured: t.fractured })),
    feasibility: issues,
    steps: out.steps,
    guide: out.guide,
    bill: out.bill,
    totals: out.totals,
    unpriced: out.unpriced,
    exaltPerDivine: deps.exaltPerDivine != null && deps.exaltPerDivine > 0 ? deps.exaltPerDivine : null,
    icons: iconsFor(planMaterialIds(out, req), deps.iconOf),
    patch: { rules: RULES_PATCH, data: deps.cat.gameDataPatch, repoe: deps.cat.repoeVersion, reverifyAfter: RULES_REVERIFY_AFTER },
    rulesStale: rulesStale(deps.now),
    expanded: found.expanded,
    alternatives: alt.alternatives,
    alternativesTruncated: alt.truncated,
  };
}
