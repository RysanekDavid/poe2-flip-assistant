"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Loader2, Map as MapIcon } from "lucide-react";
import { assertOk, describeError } from "../../lib/clientWarn";
import { progressResponseSchema, type ProgressResponse } from "../../lib/learnContract";
import type { AtlasStep } from "../../core/learn/schema";
import { ClaimBadge } from "../ui/ClaimBadge";
import { EmptyState } from "../ui/EmptyState";
import { useLearnGet } from "./useLearnApi";

/** Where a finished step sends the player next: farm strategies filtered to a league-start budget. */
export const LEAGUE_START_STRATEGIES_HREF = "?tab=farm&tool=strategies&budget=league_start";

async function postStep(stepId: string, done: boolean): Promise<ProgressResponse> {
  const res = await fetch("/api/learn/progress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ step_id: stepId, done }),
  });
  return progressResponseSchema.parse(await assertOk(res, "POST /api/learn/progress").json());
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Atlas steps done" className="h-2 w-48 overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full rounded-full bg-amber-400/80 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm tabular-nums text-neutral-300">
        {done}/{total}
      </span>
    </div>
  );
}

interface StepRowProps {
  step: AtlasStep;
  index: number;
  done: boolean;
  next: boolean;
  busy: boolean;
  onToggle: (done: boolean) => void;
}

function StepRow({ step, index, done, next, busy, onToggle }: StepRowProps) {
  const frame = next ? "border-amber-400/50 bg-amber-950/10" : "border-line bg-surface/40";
  return (
    <li className={`flex gap-3 rounded-lg border p-3 ${frame}`}>
      <input
        type="checkbox"
        checked={done}
        disabled={busy}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={`Done: ${step.title}`}
        className="mt-1 h-4 w-4 shrink-0 accent-amber-400"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-neutral-500">{index + 1}</span>
          <span className={`font-medium ${done ? "text-neutral-400 line-through" : "text-neutral-100"}`}>{step.title}</span>
          {next && <span className="rounded border border-amber-400/40 px-1.5 text-xs text-amber-200">Next</span>}
          <ClaimBadge claim={step.claim} />
        </div>
        <p className="text-sm leading-5 text-neutral-300">{step.detail}</p>
        {step.warnings.map((w) => (
          <p key={w.text} className="flex flex-wrap items-center gap-1.5 text-sm text-amber-200/90">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" /> {w.text}
            {w.claim && <ClaimBadge claim={w.claim} />}
          </p>
        ))}
        {step.strategy_ids.length > 0 && (
          <Link href={LEAGUE_START_STRATEGIES_HREF} scroll={false} className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-amber-200">
            Farm strategies for this <ArrowRight aria-hidden className="h-3 w-3" />
          </Link>
        )}
      </div>
    </li>
  );
}

function Checklist({ initial }: { initial: ProgressResponse }) {
  const [progress, setProgress] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneIds = new Set(progress.done.map((d) => d.step_id));
  const steps = progress.checklist.steps;
  const nextId = steps.find((s) => !doneIds.has(s.id))?.id ?? null;
  const toggle = (stepId: string, done: boolean) => {
    setBusy(stepId);
    setError(null);
    postStep(stepId, done)
      .then(setProgress)
      .catch((e: unknown) => {
        console.error("[learn] atlas progress save failed", e);
        setError(`could not save: ${describeError(e)}`);
      })
      .finally(() => setBusy(null));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProgressBar done={steps.filter((s) => doneIds.has(s.id)).length} total={steps.length} />
        <Link href={LEAGUE_START_STRATEGIES_HREF} scroll={false} className="inline-flex items-center gap-1 text-sm text-amber-200 hover:text-amber-100">
          What to farm at league start <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
      <p className="text-xs text-neutral-400">Route: {progress.checklist.route_source} · patch {progress.checklist.patch.verified_against}</p>
      {error && <p className="text-sm text-bad">{error}</p>}
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <StepRow key={step.id} step={step} index={index} done={doneIds.has(step.id)} next={step.id === nextId} busy={busy !== null} onToggle={(done) => toggle(step.id, done)} />
        ))}
      </ol>
    </div>
  );
}

/** Learn › Atlas checklist: the endgame unlock route step by step, ticked off per account. */
export function AtlasChecklist() {
  const progress = useLearnGet("/api/learn/progress", progressResponseSchema);
  if (progress.kind === "error") return <EmptyState icon={<MapIcon className="h-5 w-5" />} title="Checklist unavailable" sentence={progress.message} />;
  if (progress.kind !== "ok") return <EmptyState icon={<Loader2 className="h-5 w-5 animate-spin" />} sentence="Loading your atlas checklist…" />;
  // Checklist owns the state from here on (each tick returns the whole progress).
  return <Checklist initial={progress.data} />;
}
