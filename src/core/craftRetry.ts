import type { CraftGuide, GuideStep, RetryRef } from "./craftRecipes";

/**
 * Resolves a step's `retryFrom` reference to the flat step index the craft session walks
 * (guide.phases.flatMap(p => p.steps)). Kept apart from craftRecipes.ts so the client wizard can
 * import it without pulling every recipe's data into the bundle.
 */

/** One step in session order, tagged with its phase and 1-based position inside that phase. */
export interface FlatGuideStep {
  phase: string;
  stepInPhase: number;
  phaseSteps: number;
  step: GuideStep;
}

/** A resolved retry jump: where it lands and the label the failure panel shows. */
export interface RetryTarget {
  idx: number;
  label: string;
}

export type RetryResolution = { ok: true; target: RetryTarget } | { ok: false; reason: string };

export function flattenGuide(guide: CraftGuide): FlatGuideStep[] {
  return guide.phases.flatMap((p) => p.steps.map((step, i) => ({ phase: p.title, stepInPhase: i + 1, phaseSteps: p.steps.length, step })));
}

function refLabel(ref: RetryRef): string {
  return `${ref.phase} (step ${ref.step ?? 1})`;
}

/**
 * Where the step at `fromIdx` sends the player after a failure. Null = the step has no retry
 * target. A reference that names a missing phase/step, or a step AFTER the failing one, is a data
 * bug — reported, never guessed around (assertGuideRetryRefs throws at RECIPES import;
 * testCraftRetry fails on it).
 */
export function resolveRetry(guide: CraftGuide, fromIdx: number): RetryResolution | null {
  const flat = flattenGuide(guide);
  const from = flat[fromIdx];
  if (!from) return { ok: false, reason: `step index ${fromIdx} is outside the guide (${flat.length} steps)` };
  const ref = from.step.retryFrom;
  if (!ref) return null;
  const want = ref.step ?? 1;
  const idx = flat.findIndex((s) => s.phase === ref.phase && s.stepInPhase === want);
  const target = flat[idx];
  if (!target) return { ok: false, reason: `retryFrom ${refLabel(ref)} matches no step` };
  // A retry repeats the failing step or an earlier one; jumping forward would skip unpaid work.
  if (idx > fromIdx) return { ok: false, reason: `retryFrom ${refLabel(ref)} is after the failing step` };
  const label = target.phaseSteps > 1 ? `${target.phase} · step ${target.stepInPhase}` : target.phase;
  return { ok: true, target: { idx, label } };
}

/**
 * Throws on the first retryFrom in `guide` that doesn't resolve, or on a repeated phase title
 * (a retry names its phase by title, so a duplicate would silently bind to the first one).
 */
export function assertGuideRetryRefs(key: string, guide: CraftGuide): void {
  const titles = guide.phases.map((p) => p.title);
  const dupe = titles.find((t, i) => titles.indexOf(t) !== i);
  if (dupe !== undefined) throw new Error(`craft recipe ${key}: phase title "${dupe}" appears twice`);
  flattenGuide(guide).forEach((_, idx) => {
    const res = resolveRetry(guide, idx);
    if (res && !res.ok) throw new Error(`craft recipe ${key}, step ${idx}: ${res.reason}`);
  });
}
