import type { PlanResponse } from "../../../lib/tools/craftPlannerContract";
import { StepCard } from "./StepCard";

/** The plan as a vertical crafting bench: one card per step, linked by the rail, top to bottom. */
export function PlanTimeline({ plan, baseArt }: { plan: PlanResponse; baseArt: string | null }) {
  const byPhase = new Map(plan.steps.map((s) => [s.phase, s.index + 1]));
  const stepNo = (phase: string): number | null => byPhase.get(phase) ?? null;
  return (
    <section aria-label="the plan, step by step">
      <h3 className="mb-3 text-lg font-semibold text-neutral-100">
        The bench <span className="text-sm font-normal text-neutral-400">· {plan.steps.length} steps, top to bottom</span>
      </h3>
      <ol className="space-y-4">
        {plan.steps.map((step, i) => (
          <StepCard key={step.index} step={step} plan={plan} before={i > 0 ? plan.steps[i - 1]!.after : null} baseArt={baseArt} stepNo={stepNo} />
        ))}
      </ol>
    </section>
  );
}

/** Skeletons shaped like what they stand in for: the item tooltip and the bench. */
export function TooltipSkeleton() {
  return (
    <div aria-hidden className="overflow-hidden rounded-md border border-amber-900/50 bg-[#0c0a08]">
      <div className="flex items-center gap-3 border-b border-amber-900/50 bg-neutral-900/60 px-3 py-3">
        <span className="h-12 w-12 animate-pulse rounded bg-neutral-800" />
        <span className="h-5 flex-1 animate-pulse rounded bg-neutral-800" />
      </div>
      <div className="space-y-2 p-3">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="block h-6 animate-pulse rounded bg-neutral-800/60" />
        ))}
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div role="status" aria-label="planning…" className="space-y-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="relative pl-11 md:pl-14">
          <span className="absolute left-0 top-3 h-9 w-9 animate-pulse rounded-full bg-neutral-800 md:h-12 md:w-12" />
          <div className="flex gap-3 rounded-lg border border-line bg-surface/60 p-4">
            <span className="h-12 w-12 animate-pulse rounded-md bg-neutral-800" />
            <div className="flex-1 space-y-2">
              <span className="block h-4 w-3/4 animate-pulse rounded bg-neutral-800" />
              <span className="block h-3 w-1/2 animate-pulse rounded bg-neutral-800/70" />
              <span className="block h-5 w-40 animate-pulse rounded bg-neutral-800/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
