"use client";

import { ExternalLink, Info } from "lucide-react";
import type { PlanStepView } from "../../../lib/tools/craftPlannerContract";
import { HoverCard } from "../../ui/HoverCard";

type Instruction = PlanStepView["instructions"][number];

/**
 * The ⓘ beside a step: the full reasoning, then where it comes from as readable labels (a poe2db
 * page links out). A HoverCard, not a Tooltip, so the links are reachable by keyboard and touch.
 */
export function WhyCard({ ins, label }: { ins: Instruction; label: string }) {
  return (
    <HoverCard
      triggerClassName="inline-flex rounded align-middle text-neutral-500 hover:text-neutral-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-neutral-400"
      trigger={
        <>
          <span className="sr-only">{label}</span>
          <Info aria-hidden className="h-3.5 w-3.5" />
        </>
      }
    >
      {(titleId) => (
        <div className="space-y-2">
          <p id={titleId} className="font-semibold text-neutral-50">
            Why
          </p>
          <p className="leading-6 text-neutral-200">{ins.why}</p>
          {ins.sources.length > 0 && (
            <ul aria-label="sources" className="space-y-1 border-t border-line pt-2 text-xs text-neutral-400">
              {ins.sources.map((s) => (
                <li key={s.label}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-amber-200">
                      {s.label} <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    s.label
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </HoverCard>
  );
}
