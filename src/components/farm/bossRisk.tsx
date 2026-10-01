"use client";

import { loseCaveats } from "../../core/tools/bossEv/rowText";
import { MAX_MINUTES_PER_RUN, type BossRow } from "../../lib/farmContract";
import { BOUND_PREFIX } from "./bossCells";
import type { RowSave } from "./farmSpeedApi";
import { fmtDivHour, fmtOneIn, fmtPct } from "./farmView";
import { SpeedInput } from "./SpeedInput";

/*
 * The board's right-hand cells: how risky one kill is, and what the viewer makes per hour at their
 * own pace. Native titles only (no Tooltip tab stops per row), as in bossCells.tsx.
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

/** The viewer's net per hour; its bound follows the net's (a per-kill lower bound is a per-hour one). */
function DivHourValue({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  if (r.yourMinutes == null) return null;
  if (r.divPerHourBound === "unknown" || r.divPerHour == null) {
    return (
      <span className="text-neutral-400" title="net per kill unknown (entry partly unpriced and some drops unrated) — no honest Div/hour">
        → ?
      </span>
    );
  }
  const bound = r.divPerHourBound ?? "exact";
  const unsure = bound === "lower" && r.divPerHour < 0;
  const tone = unsure ? "text-neutral-300" : r.divPerHour < 0 ? "text-bad" : "text-accent";
  const why = unsure ? "lower bound — unrated drops may cover it, not a sure loss" : bound === "upper" ? "upper bound — part of the entry is unpriced" : bound === "lower" ? "lower bound — some drops are left out" : "";
  return (
    <span className={`whitespace-nowrap font-semibold tabular-nums ${tone}`} title={`net per kill × 60 ÷ ${r.yourMinutes} min${why ? ` — ${why}` : ""}`}>
      <span className="font-normal text-neutral-500">→ </span>
      {BOUND_PREFIX[bound]}
      {fmtDivHour(r.divPerHour, exPerDiv, true)}
    </span>
  );
}

interface PaceProps {
  r: BossRow;
  exPerDiv: number | null;
  onCommit: (minutes: number | null) => void;
  save: RowSave;
}

/** Your minutes per kill and, once entered, the Div/hour they give — input and result in one cell. */
export function PaceCell({ r, exPerDiv, onCommit, save }: PaceProps) {
  const set = r.yourMinutes != null;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <SpeedInput
        value={r.yourMinutes}
        onCommit={onCommit}
        label={`Your minutes per ${r.name} kill`}
        unit={set ? "min" : undefined}
        placeholder="min/kill"
        max={MAX_MINUTES_PER_RUN}
        save={save}
        title="your minutes per kill — the whole cycle, entry to loot picked up. Enter or click away saves, empty clears."
      />
      <DivHourValue r={r} exPerDiv={exPerDiv} />
    </span>
  );
}
