import { RULES_PATCH, RULES_REVERIFY_AFTER, rulesStale } from "../../../lib/tools/craftMovesContract";
import type { PlanRequest, PlanResponse } from "../../../lib/tools/craftPlannerContract";
import type { CraftCatalog } from "../craftmoves/catalog";
import { NoPlanError, searchPlan, SearchCappedError } from "./search";
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

export interface PlanDeps {
  cat: CraftCatalog;
  /** ninja id → Divine per unit (only positive, finite prices). */
  prices: ReadonlyMap<string, number>;
  exaltPerDivine: number | null;
  league: string;
  now: Date;
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

function search(ctx: PlanCtx, issues: FeasibilityIssue[]): ReturnType<typeof searchPlan> {
  try {
    return searchPlan(ctx);
  } catch (e: unknown) {
    if (e instanceof NoPlanError || e instanceof SearchCappedError) throw new PlanRejectedError(e.message, issues);
    throw e;
  }
}

/** Throws UnknownPlannerBaseError (404) and PlanRejectedError (422, with the graded reasons). */
export function planCraft(req: PlanRequest, deps: PlanDeps): PlanResponse {
  const { ctx, issues } = buildCtx(req, deps);
  if (!isFeasible(issues)) throw new PlanRejectedError("these targets can't all be on one item", issues);
  const found = search(ctx, issues);
  const out = unrollPlan(found.moves, ctx, deps.exaltPerDivine);
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
    patch: { rules: RULES_PATCH, data: deps.cat.gameDataPatch, repoe: deps.cat.repoeVersion, reverifyAfter: RULES_REVERIFY_AFTER },
    rulesStale: rulesStale(deps.now),
    expanded: found.expanded,
  };
}
