"use client";

import type { RecipeDurability } from "../../core/craftProvenance/schema";
import { ClaimBadge } from "../ui/ClaimBadge";

/** Why the recipe keeps working and what would end it — the mechanic, not a creator's sale price. */
export function DurabilityNote({ d }: { d: RecipeDurability }) {
  return (
    <div className="space-y-1.5 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="uppercase tracking-wide text-neutral-500">Why it works</span>
        <ClaimBadge claim={d.claim} />
      </div>
      <p className="leading-5 text-neutral-300">{d.why_it_works}</p>
      <div className="uppercase tracking-wide text-neutral-500">Breaks when</div>
      <ul className="list-disc space-y-0.5 pl-4 text-neutral-400">
        {d.breaks_when.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}
