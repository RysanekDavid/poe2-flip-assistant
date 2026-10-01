"use client";

import { ShieldCheck } from "lucide-react";
import type { Durability } from "../../../core/strategies/schema";
import { ClaimBadge } from "../../ui/ClaimBadge";
import { Tooltip } from "../../ui/Tooltip";

/** The card's one-glance answer to "will this still work next week": the mechanic, and what ends it, on hover. */
export function DurabilityTip({ durability }: { durability: Durability }) {
  const tip = `Works because: ${durability.why_it_works} Ends when: ${durability.breaks_when.join("; ")}.`;
  return (
    <Tooltip tip={tip} align="start">
      <span tabIndex={0} aria-label={`Why it keeps working: ${tip}`} className="inline-flex cursor-help align-middle text-neutral-400 hover:text-neutral-200">
        <ShieldCheck aria-hidden className="h-4 w-4" />
      </span>
    </Tooltip>
  );
}

/** The drawer section: the mechanic behind the strategy, cited, and the nerfs or prices that would end it. */
export function DurabilityNote({ durability }: { durability: Durability }) {
  return (
    <div className="grid gap-1.5 text-sm text-neutral-300">
      <p>
        {durability.why_it_works} <ClaimBadge claim={durability.claim} />
      </p>
      <p className="text-xs uppercase tracking-wide text-neutral-400">Stops working when</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {durability.breaks_when.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
