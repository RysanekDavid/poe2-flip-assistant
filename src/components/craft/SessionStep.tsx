"use client";

import { Check, ChevronLeft, AlertTriangle, ClipboardCheck, FlaskConical } from "lucide-react";
import type { GuideStep } from "../../core/craftRecipes";
import type { MatInfoFn } from "./craftView";

/** Screens of an inline craft session. */
export type Screen = { kind: "shop" } | { kind: "step"; idx: number; failed: boolean } | { kind: "outcome"; brick: boolean };

/** The materials you slam in this step, front and center with live price + art. */
function StepMats({ step, matInfo }: { step: GuideStep; matInfo: MatInfoFn }) {
  if (!step.mats || step.mats.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start justify-center gap-4">
      {step.mats.map((m) => {
        const { price, icon } = matInfo(m.id);
        return (
          <div key={m.id} className="flex w-24 flex-col items-center gap-1 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950">
              {icon ? (
                // eslint-disable-next-line @next/next/no-img-element -- poecdn item art
                <img src={icon} alt="" className="max-h-14 max-w-14 object-contain" />
              ) : (
                <span className="text-2xl text-neutral-700">?</span>
              )}
            </div>
            <span className="text-xs leading-tight text-neutral-300">{m.label}</span>
            {price && <span className="text-[11px] text-neutral-500">{price}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Pick targets, wallet warning, unverified badge and item-state check for one step. */
function StepNotes({ step }: { step: GuideStep }) {
  return (
    <>
      {step.unverified && (
        <p className="flex items-start gap-2 rounded-md border border-fuchsia-900/60 bg-fuchsia-950/30 p-3 text-sm text-fuchsia-200">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="mr-1.5 rounded bg-fuchsia-800/70 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">unverified</span>
            {step.unverified} Test it on a cheap base before spending real currency.
          </span>
        </p>
      )}
      {step.pick && (
        <div className="rounded-md border border-emerald-900/50 bg-emerald-950/20 p-3">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-emerald-400">look for (best first)</p>
          <div className="flex flex-wrap justify-center gap-2">
            {step.pick.map((p, i) => (
              <span key={p} className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1.5 text-sm text-emerald-200">
                <span className="mr-1.5 font-semibold text-emerald-500">{i + 1}.</span>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
      {step.warning && (
        <p className="flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {step.warning}
        </p>
      )}
      {step.check && (
        <p className="flex items-start justify-center gap-2 rounded-md border border-sky-900/50 bg-sky-950/20 p-2.5 text-sm text-sky-300">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">the item should now show: </span>
            {step.check}
          </span>
        </p>
      )}
    </>
  );
}

interface StepNavProps {
  step: GuideStep;
  idx: number;
  last: boolean;
  failed: boolean;
  go: (s: Screen) => void;
}

/** Done / back / failed controls, or the failure branch once "it failed" was pressed. */
function StepNav({ step, idx, last, failed, go }: StepNavProps) {
  const next: Screen = last ? { kind: "outcome", brick: false } : { kind: "step", idx: idx + 1, failed: false };
  if (failed && step.onFail) {
    return (
      <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-300">
        <p className="mb-2 font-medium">it failed — now what:</p>
        <p>{step.onFail}</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => go(next)} className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800">
            continue anyway →
          </button>
          <button onClick={() => go({ kind: "outcome", brick: true })} className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40">
            abort attempt (brick)
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 pt-1">
      <button
        onClick={() => go(idx === 0 ? { kind: "shop" } : { kind: "step", idx: idx - 1, failed: false })}
        className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800"
      >
        <ChevronLeft className="h-4 w-4" /> back
      </button>
      <button
        onClick={() => go(next)}
        className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600"
      >
        <Check className="h-4 w-4" /> {last ? "done — finish" : "done → next"}
      </button>
      {step.onFail && (
        <button onClick={() => go({ kind: "step", idx, failed: true })} className="rounded-md border border-amber-800/60 px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-950/30">
          ✗ it failed
        </button>
      )}
    </div>
  );
}

/** One big step at a time: what to slam, what to do, what to look for, what to check. */
export function StepScreen(props: { step: GuideStep; idx: number; total: number; failed: boolean; matInfo: MatInfoFn; go: (s: Screen) => void }) {
  const { step, idx, total, failed, matInfo, go } = props;
  return (
    <div className="space-y-4 p-4">
      <div className="text-center text-xs uppercase tracking-wide text-neutral-500">
        step {idx + 1} / {total}
      </div>
      <StepMats step={step} matInfo={matInfo} />
      <p className="text-center text-lg font-medium text-neutral-100">{step.do}</p>
      {step.why && <p className="text-center text-sm text-neutral-500">{step.why}</p>}
      <StepNotes step={step} />
      <StepNav step={step} idx={idx} last={idx === total - 1} failed={failed} go={go} />
    </div>
  );
}
