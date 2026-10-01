"use client";

import { loseCaveats } from "../../core/tools/bossEv/rowText";
import type { BossRow } from "../../lib/farmContract";
import { fmtOneIn, fmtPct } from "./farmView";

/*
 * The board's Risk cell: how likely one kill fails to pay for its entry. Native titles only (no
 * Tooltip tab stops per row), as in bossCells.tsx.
 */

function loseWhyNot(r: BossRow): string {
  if (r.unmodelledEntry) return `the entry leaves out ${r.unmodelledEntry.label} — cannot tell what a kill must cover`;
  if (r.entryComplete) return "no drop that could cover the entry has a sourced rate";
  return "entry partly unpriced — cannot tell what a kill must cover";
}

/** P(lose) as a number and a thin bar; caveats turn it dotted-underlined with the reasons in the title. */
function LoseValue({ r }: { r: BossRow }) {
  if (r.pLosingRun == null) {
    return (
      <span className="text-neutral-500" title={loseWhyNot(r)}>
        —
      </span>
    );
  }
  const caveats = loseCaveats(r);
  const title = ["chance one kill does not pay for its entry (independent rolls)", ...caveats.map((c) => `* ${c}`)].join("\n");
  const pct = Math.min(100, Math.max(0, r.pLosingRun * 100));
  return (
    <span className="inline-flex items-center gap-2" title={title}>
      <span className={`tabular-nums text-neutral-200 ${caveats.length > 0 ? "underline decoration-neutral-500 decoration-dotted underline-offset-2" : ""}`}>
        {fmtPct(r.pLosingRun)}
      </span>
      <span aria-hidden className="h-1 w-10 overflow-hidden rounded-full bg-neutral-800">
        <span className="block h-full rounded-full bg-bad/70" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/** P(lose) on top, how often the chase drops underneath. */
export function RiskCell({ r }: { r: BossRow }) {
  return (
    <span className="grid justify-items-end gap-0.5">
      <LoseValue r={r} />
      <span className="text-xs text-neutral-500" title="kills per rare (< 1 in 10) drop of any kind, from the sourced rates">
        {r.chaseOneIn == null ? "no rated chase" : `chase ${fmtOneIn(r.chaseOneIn)}`}
      </span>
    </span>
  );
}
