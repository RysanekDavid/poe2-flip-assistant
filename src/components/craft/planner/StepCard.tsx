"use client";

import { useState } from "react";
import { ChevronDown, FlaskConical, RotateCcw, Skull } from "lucide-react";
import type { ItemStateView, PlanResponse, PlanStepView } from "../../../lib/tools/craftPlannerContract";
import { ClaimBadge } from "../../ui/ClaimBadge";
import { ItemArt } from "../../ui/ItemArt";
import { InfoTip, Tooltip } from "../../ui/Tooltip";
import { claimOf } from "./IssueLine";
import { bandText, OddsChip } from "./OddsChip";
import { StepItemPreview } from "./StepItemPreview";

/**
 * One bench step: the materials as large art, the action written as a target, the why in one line
 * (the full reasoning behind ⓘ), the odds with their basis, the failure branch as a jump back to
 * a step, and — on demand — the item as it looks after the step.
 */

type Instruction = PlanStepView["instructions"][number];

export interface StepCardProps {
  step: PlanStepView;
  plan: PlanResponse;
  before: ItemStateView | null;
  baseArt: string | null;
  /** 1-based step number of a phase title (retry targets name phases). */
  stepNo: (phase: string) => number | null;
}

const firstSentence = (s: string): string => s.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? s;

const roundQty = (n: number): string => (n >= 10 ? Math.round(n).toLocaleString("en") : String(Math.round(n * 10) / 10));

/** Expected count; a material only a miss needs (point ≈ 0) shows its range instead of "×0". */
export const qtyText = (q: { point: number; low: number; high: number }): string =>
  q.point < 0.05 ? `×${roundQty(q.low)}–${roundQty(q.high)}` : `×${roundQty(q.point)}`;

function MatArt({ step, plan }: { step: PlanStepView; plan: PlanResponse }) {
  if (step.materials.length === 0) return <span aria-hidden className="h-12 w-12 shrink-0 rounded-md border border-neutral-800 bg-neutral-950" />;
  return (
    <ul aria-label="materials" className="flex shrink-0 flex-wrap gap-2">
      {step.materials.map((m) => {
        const band = m.qty.high - m.qty.low > 1e-9 ? ` (band ${roundQty(m.qty.low)}–${roundQty(m.qty.high)})` : "";
        return (
          <li key={m.id} title={`${m.label} ${qtyText(m.qty)}${band}`} className="flex w-14 flex-col items-center gap-0.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-md border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950">
              <ItemArt src={plan.icons[m.id] ?? null} size={12} alt={m.label} />
            </span>
            <span className="text-xs tabular-nums text-neutral-300">{qtyText(m.qty)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function RetryChip({ ins, stepNo, self }: { ins: Instruction; stepNo: StepCardProps["stepNo"]; self: number }) {
  if (!ins.retryTo) return null;
  const n = stepNo(ins.retryTo.phase);
  const text = n == null ? `↺ back to ${ins.retryTo.phase}` : n === self ? "↺ repeat this step" : `↺ back to step ${n}`;
  return (
    <Tooltip tip={ins.onFail ?? "a miss sends you back"} align="start">
      <button type="button" className="inline-flex items-center gap-1 rounded border border-sky-800/60 bg-sky-950/30 px-1.5 py-0.5 text-xs text-sky-200">
        <RotateCcw aria-hidden className="h-3 w-3" />
        <span className="sr-only">on a miss: </span>
        {text.replace("↺ ", "")}
      </button>
    </Tooltip>
  );
}

const LONG = 140;

/** The step's action; a long one (the base to buy names every target) folds to two lines. */
function Headline({ text }: { text: string }) {
  const [full, setFull] = useState(false);
  const long = text.length > LONG;
  return (
    <p className="text-base font-medium leading-6 text-neutral-100">
      <span className={long && !full ? "line-clamp-2" : undefined}>{text}</span>
      {long && (
        <button type="button" aria-expanded={full} onClick={() => setFull((v) => !v)} className="text-xs font-normal text-neutral-400 underline hover:text-neutral-200">
          {full ? "less" : "show all"}
        </button>
      )}
    </p>
  );
}

function Instructions({ step, stepNo, self }: { step: PlanStepView; stepNo: StepCardProps["stepNo"]; self: number }) {
  const [first, ...rest] = step.instructions;
  if (!first) return null;
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Headline text={first.do} />
      {first.why && (
        <p className="flex items-start gap-1.5 text-sm text-neutral-400">
          <span className="line-clamp-2 min-w-0 flex-1">{firstSentence(first.why)}</span>
          <InfoTip tip={first.why} label="why this step" align="end" />
        </p>
      )}
      {rest.length > 0 && (
        <ol className="space-y-1 border-l border-neutral-800 pl-3">
          {rest.map((ins) => (
            <li key={ins.do} className="text-sm text-neutral-300">
              <span>{ins.do}</span> {ins.why && <InfoTip tip={ins.why} label="why" align="end" />} <RetryChip ins={ins} stepNo={stepNo} self={self} />
            </li>
          ))}
        </ol>
      )}
      {first.retryTo && <RetryChip ins={first} stepNo={stepNo} self={self} />}
    </div>
  );
}

function Chips({ step, plan }: { step: PlanStepView; plan: PlanResponse }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <OddsChip odds={step.odds} />
      {step.cost.div && (
        <span title={`expected spend on this step (${step.cost.basis})`} className="rounded border border-neutral-700 px-1.5 py-0.5 text-xs tabular-nums text-neutral-300">
          {bandText(step.cost.div, plan.exaltPerDivine)}
        </span>
      )}
      {step.restartP != null && (
        <span title="a miss can't be repaired: start over on a new base — the bill counts the extra bases' work" className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-950/30 px-1.5 py-0.5 text-xs text-red-200">
          <Skull aria-hidden className="h-3 w-3" /> miss = new base
        </span>
      )}
      {step.grade !== "vp" && <ClaimBadge claim={claimOf(step.grade, `rules this step rests on: ${step.rules.join(", ")}`)} />}
      {step.unverified && (
        <Tooltip tip={`${step.unverified} Test it on a cheap base first.`} align="start">
          <button type="button" className="inline-flex items-center gap-1 rounded border border-fuchsia-800/60 bg-fuchsia-950/30 px-1.5 py-0.5 text-xs text-fuchsia-200">
            <FlaskConical aria-hidden className="h-3 w-3" /> unverified
          </button>
        </Tooltip>
      )}
    </div>
  );
}

export function StepCard({ step, plan, before, baseArt, stepNo }: StepCardProps) {
  const [showItem, setShowItem] = useState(false);
  const self = step.index + 1;
  return (
    <li className="relative pl-11 md:pl-14">
      <span aria-hidden className="absolute bottom-0 left-[1.1rem] top-0 w-px bg-gradient-to-b from-amber-700/60 to-neutral-800 md:left-[1.45rem]" />
      <span className="absolute left-0 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-amber-600/60 bg-gradient-to-b from-amber-900/60 to-neutral-950 text-sm font-semibold tabular-nums text-amber-100 shadow-[0_0_0_3px_theme(colors.bg)] md:h-12 md:w-12 md:text-base">
        {self}
      </span>
      <article aria-label={`step ${self}: ${step.phase}`} className="rounded-lg border border-line bg-surface/70 p-3 md:p-4">
        <p className="mb-2 truncate text-xs uppercase tracking-wide text-neutral-500" title={step.phase}>
          {step.phase}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <MatArt step={step} plan={plan} />
          <Instructions step={step} stepNo={stepNo} self={self} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Chips step={step} plan={plan} />
          <button type="button" aria-expanded={showItem} onClick={() => setShowItem((v) => !v)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-white/5 hover:text-neutral-200">
            item after <ChevronDown aria-hidden className={`h-3 w-3 transition-transform ${showItem ? "rotate-180" : ""}`} />
          </button>
        </div>
        {showItem && (
          <div className="mt-3 max-w-sm">
            <StepItemPreview after={step.after} before={before} plan={plan} art={baseArt} />
          </div>
        )}
      </article>
    </li>
  );
}
