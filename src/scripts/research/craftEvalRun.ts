/*
 * craft:eval, one golden entry: run the planner like the planner UI would (one start, or a clean
 * and a bought start compared by the UI's own rule, or by material totals when the source gives no
 * base price), then score the chosen plan against the entry's benchmark (goldenScore.ts). Planner refusals and timeouts are scoreboard results; any other
 * throw is a bug or a data defect and propagates with the entry id.
 */
import { cheaperPlan } from "../../components/craft/planner/plannerStartModel";
import type { PlanRequest, PlanResponse } from "../../lib/tools/craftPlannerContract";
import type { GoldenBand, GoldenEntry } from "../../core/research/craftMining/goldenSchema";
import { benchmarkDiv, creatorCost, jaccard, passes, plannerCost, ratioOf, topDriver, type CompareRule, type ScoreEntry } from "../../core/research/craftMining/goldenScore";
import { planTags } from "../../core/research/craftMining/goldenTags";
import { planCraft, PlanRejectedError, PlanTimeoutError, type PlanBudget, type PlanDeps } from "../../core/tools/planner/plan";

type ScoreError = NonNullable<ScoreEntry["error"]>;
type Outcome = { kind: "plan"; plan: PlanResponse } | { kind: "error"; error: ScoreError };

/** CPU time, not wall clock: parallel agents and a busy laptop must not turn a plan into a timeout. */
const cpuMs = (): number => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};

export const evalBudget = (searchMs: number, alternativesMs: number): PlanBudget => ({ searchMs, alternativesMs, now: cpuMs });

function runPlanner(req: PlanRequest, deps: PlanDeps): Outcome {
  try {
    return { kind: "plan", plan: planCraft(req, deps) };
  } catch (e: unknown) {
    if (e instanceof PlanTimeoutError) return { kind: "error", error: { kind: "timeout", message: `${e.message} (${Math.round(e.elapsedMs)} ms CPU)` } };
    if (e instanceof PlanRejectedError) {
      const impossible = e.issues.filter((i) => i.severity === "impossible").map((i) => i.message);
      if (impossible.length > 0) return { kind: "error", error: { kind: "rejected", message: `${e.message}: ${impossible.join("; ")}` } };
      return { kind: "error", error: { kind: "no-plan", message: e.message } };
    }
    throw e;
  }
}

/** The plan's cost with its bought bases at the creator's base price; null without a priced plan. */
function costOf(outcome: Outcome, baseDiv: GoldenEntry["creator"]["baseDiv"]): GoldenBand | null {
  if (outcome.kind === "error" || !outcome.plan.totals.div) return null;
  return plannerCost(outcome.plan.totals.div, outcome.plan.start, baseDiv);
}

type Compared = Pick<PlanResponse, "totals" | "start">;

/**
 * Which of two planned starts a compare entry scores. With the creator's base price: the UI's badge
 * rule (cheaperPlan). Without one, the clean plan: a bought plan's total omits its base, and that
 * base can carry the very work (a fracture phase) the creator paid for, so it would look falsely cheap.
 */
export function pickCompared(clean: Compared, bought: Compared, baseDiv: GoldenBand | null): { pick: "clean" | "bought"; rule: CompareRule } {
  if (baseDiv) return { pick: cheaperPlan(clean, bought, baseDiv.point) === "bought" ? "bought" : "clean", rule: "with-base" };
  // An unpriced total cannot be scored; errorOf reports it if it is the one left.
  return { pick: clean.totals.div || !bought.totals.div ? "clean" : "bought", rule: "no-base-clean" };
}

/** "compare": plan a clean and a bought start and score the one pickCompared chooses. */
function plannedFor(entry: GoldenEntry, deps: PlanDeps): { chosen: Outcome; compared: ScoreEntry["compared"] } {
  if (entry.startMode === "request") return { chosen: runPlanner(entry.planRequest, deps), compared: null };
  const clean = runPlanner({ ...entry.planRequest, start: undefined }, deps);
  const bought = runPlanner({ ...entry.planRequest, start: { kind: "bought", carried: null, askDiv: null } }, deps);
  const costs = { clean: costOf(clean, entry.creator.baseDiv), bought: costOf(bought, entry.creator.baseDiv) };
  if (clean.kind === "error" && bought.kind === "error") return { chosen: clean, compared: { ...costs, rule: "no-plan" } };
  if (clean.kind === "error") return { chosen: bought, compared: { ...costs, rule: "one-plan" } };
  if (bought.kind === "error") return { chosen: clean, compared: { ...costs, rule: "one-plan" } };
  const { pick, rule } = pickCompared(clean.plan, bought.plan, entry.creator.baseDiv);
  return { chosen: pick === "bought" ? bought : clean, compared: { ...costs, rule } };
}

function errorOf(outcome: Outcome, creatorUnpriced: readonly string[]): ScoreError | null {
  if (outcome.kind === "error") return outcome.error;
  if (!outcome.plan.totals.div) return { kind: "unpriced", message: `planner materials unpriced in the snapshot: ${outcome.plan.unpriced.join(", ")}` };
  if (creatorUnpriced.length > 0) return { kind: "unpriced", message: `creator materials unpriced in the snapshot: ${creatorUnpriced.join(", ")}` };
  return null;
}

export function scoreEntry(entry: GoldenEntry, deps: PlanDeps): ScoreEntry {
  let planned: ReturnType<typeof plannedFor>;
  try {
    planned = plannedFor(entry, deps);
  } catch (e: unknown) {
    throw new Error(`craft:eval ${entry.id}: the planner threw`, { cause: e });
  }
  const outcome = planned.chosen;
  const creator = creatorCost(entry.creator, deps.prices);
  const plan = outcome.kind === "plan" ? outcome.plan : null;
  const plannerDiv = costOf(outcome, entry.creator.baseDiv);
  const ratio = ratioOf(plannerDiv, benchmarkDiv(entry, creator.div));
  const plannerTags = plan ? planTags(plan.steps) : [];
  const creatorTags = [...entry.creator.tags].sort();
  return {
    id: entry.id,
    archetype: entry.archetype,
    start: plan ? plan.start.kind : null,
    benchmark: { kind: entry.benchmark, reason: entry.benchmarkReason ?? null },
    creatorDiv: creator.div,
    statedDiv: entry.creator.statedTotalDiv,
    plannerDiv,
    compared: planned.compared,
    ratio,
    pass: passes(ratio),
    tags: { planner: plannerTags, creator: creatorTags, jaccard: jaccard(plannerTags, creatorTags) },
    topDriver: plan ? topDriver(plan.bill) : null,
    impractical: plan ? plan.steps.some((s) => s.impractical != null) : false,
    marketDiv: entry.market?.priceDiv.point ?? null,
    error: errorOf(outcome, creator.unpriced),
  };
}
