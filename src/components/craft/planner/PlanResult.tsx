"use client";

import { useState } from "react";
import { Ban, Hammer, RefreshCw } from "lucide-react";
import type { AlternativeView, PlanResponse } from "../../../lib/tools/craftPlannerContract";
import { Button } from "../../ui/Button";
import { flattenGuide } from "../../../core/craftRetry";
import { readStored } from "../GuideRunner";
import { planSessionId, type QtyOverrides } from "./plannerModel";
import { IssueLine } from "./IssueLine";
import type { PlanState } from "./plannerClient";
import { PlanSession, PLAN_SESSION_KEY } from "./PlanSession";
import { PlanSummary } from "./PlanSummary";
import { PlanTimeline, TimelineSkeleton } from "./PlanTimeline";

type Ask = { value: number | null; onChange: (v: number | null) => void };

/**
 * Everything under the input item: nothing yet, the bench being planned, the plan with its sticky
 * summary, or why there is no plan (refused targets, rates missing, a failed request — said loudly).
 */

interface Props {
  state: PlanState;
  /** The current input differs from the request this result answers. */
  stale: boolean;
  baseArt: string | null;
  onReplan: () => void;
  /** Apply a cheaper target set from the summary and re-plan. */
  onAlternative: (alt: AlternativeView) => void;
  /** The player's price for a bought base. */
  ask: Ask;
}

/** The step a saved run of this plan stopped at (1-based), for the "Resume" label. */
function savedStep(sessionId: string, plan: PlanResponse): number | null {
  const s = readStored(PLAN_SESSION_KEY, sessionId, flattenGuide(plan.guide).length);
  return s?.kind === "step" ? s.idx + 1 : null;
}

interface ViewProps {
  plan: PlanResponse;
  baseArt: string | null;
  sessionId: string;
  onAlternative: ((alt: AlternativeView) => void) | null;
  ask: Ask;
}

function PlanView({ plan, baseArt, sessionId, onAlternative, ask }: ViewProps) {
  const [over, setOver] = useState<QtyOverrides>({});
  const [running, setRunning] = useState(false);
  const resume = running ? null : savedStep(sessionId, plan);
  const onQty = (id: string, n: number | null) =>
    setOver((cur) => {
      const next = { ...cur };
      if (n == null) delete next[id];
      else next[id] = n;
      return next;
    });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* summary first in the DOM: on a phone the cost and "Run this plan" come before the long bench */}
      <div className="lg:order-2">
        {/* below the sticky shell header; a bill taller than the screen scrolls inside the summary */}
        <div className="lg:sticky lg:top-[calc(var(--shell-h,0px)+1rem)] lg:max-h-[calc(100vh-var(--shell-h,0px)-2rem)] lg:overflow-y-auto">
          <PlanSummary plan={plan} over={over} onQty={onQty} onRun={() => setRunning(true)} runLabel={resume ? `Resume the plan (step ${resume})` : "Run this plan"} onAlternative={onAlternative} ask={ask} />
        </div>
      </div>
      <div className="min-w-0 lg:order-1">
        <PlanTimeline plan={plan} baseArt={baseArt} />
      </div>
      {running && <PlanSession plan={plan} sessionId={sessionId} onClose={() => setRunning(false)} />}
    </div>
  );
}

/** Reasons about one slot are drawn on that slot; the rest are listed here. */
function Rejected({ error, issues }: { error: string; issues: PlanResponse["feasibility"] }) {
  const general = issues.filter((i) => i.target == null);
  const onSlots = issues.length - general.length;
  return (
    <section role="alert" className="space-y-2 rounded-lg border border-red-500/40 bg-red-950/20 p-4">
      <p className="flex items-center gap-2 font-semibold text-red-200">
        <Ban aria-hidden className="h-4 w-4" /> No plan: {error}
      </p>
      {onSlots > 0 && <p className="text-sm text-red-200/90">The marked slots on the item say why.</p>}
      {general.map((i) => (
        <IssueLine key={i.rule + i.message} issue={i} />
      ))}
    </section>
  );
}

function Failed({ status, error }: { status: number | null; error: string }) {
  const text = status === 401 ? "Your session ended — sign in again to plan." : `The planner failed${status ? ` (${status})` : ""}: ${error}`;
  return (
    <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/20 p-4 text-sm text-red-200">
      {text}
    </p>
  );
}

export function PlanResult({ state, stale, baseArt, onReplan, onAlternative, ask }: Props) {
  if (state.kind === "idle") {
    return (
      <p className="flex items-center gap-3 rounded-lg border border-dashed border-neutral-700 px-4 py-6 text-sm text-neutral-400">
        <Hammer aria-hidden className="h-5 w-5 text-neutral-500" />
        Fill the slots with the mods you want and press Plan it — the bench lays out every step, its odds and its cost here.
      </p>
    );
  }
  if (state.kind === "loading") return <TimelineSkeleton />;
  return (
    <div className="space-y-3">
      {stale && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          You changed the item since this plan.
          <Button size="sm" onClick={onReplan}>
            <RefreshCw aria-hidden className="h-3.5 w-3.5" /> plan it again
          </Button>
        </p>
      )}
      {state.kind === "plan" && (
        <PlanView
          key={planSessionId(state.req, state.data.guide)}
          plan={state.data}
          baseArt={baseArt}
          sessionId={planSessionId(state.req, state.data.guide)}
          // a chip edits the CURRENT item: only while it is still the item this plan answers
          onAlternative={stale ? null : onAlternative}
          ask={ask}
        />
      )}
      {state.kind === "rejected" && <Rejected error={state.data.error} issues={state.data.feasibility} />}
      {state.kind === "error" && <Failed status={state.status} error={state.error} />}
    </div>
  );
}
