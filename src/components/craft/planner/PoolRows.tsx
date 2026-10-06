"use client";

import { Minus, Plus, X } from "lucide-react";
import type { FeasibilityIssueView, PlannerPool } from "../../../lib/tools/craftPlannerContract";
import { IssueLine } from "./IssueLine";
import { findFamily, genericText, tierOf, type Side, type SidePool, type SlotPick } from "./plannerModel";
import { poolRowText } from "./plannerStartModel";
import { MOD_TONE, SideChip } from "./tooltipParts";

/**
 * A side in pool mode: `need` rows that each read "any of: …", then the pool itself — its
 * candidates as chips (each with its minimum tier), "+ add a mod" and the "need k of n" stepper.
 * Any combination of the candidates is fine; the planner picks whatever lands.
 */

interface Props {
  side: Side;
  pool: SidePool;
  data: PlannerPool;
  /** Most the side can hold (the base cap): the stepper stops there. */
  cap: number;
  issues: FeasibilityIssueView[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onNeed: (k: number) => void;
}

const STEP = "inline-flex h-6 w-6 items-center justify-center rounded border border-neutral-700 text-neutral-300 hover:border-amber-500/60 hover:text-amber-200 disabled:opacity-40";

function Chip({ c, data, onRemove }: { c: SlotPick; data: PlannerPool; onRemove: () => void }) {
  const fam = findFamily(data, c);
  const t = fam ? tierOf(fam, c.minModId) : null;
  const name = genericText((t?.tier.text ?? c.minModId).split("\n")[0] ?? c.minModId);
  return (
    <li className="inline-flex max-w-full items-center gap-1 rounded border border-indigo-400/40 bg-indigo-950/30 py-0.5 pl-1.5 pr-0.5 text-xs text-[#b4b4ff]">
      <span className="truncate" title={t ? `tier ${t.k} of ${t.n} or better · ${t.tier.text}` : c.minModId}>
        {name}
      </span>
      <span className="shrink-0 tabular-nums text-neutral-400">{t ? `${t.k}+` : "?"}</span>
      <button type="button" onClick={onRemove} aria-label={`remove ${name} from the pool`} className="rounded p-0.5 text-neutral-400 hover:bg-white/5 hover:text-neutral-100">
        <X aria-hidden className="h-3 w-3" />
      </button>
    </li>
  );
}

export function PoolRows({ side, pool, data, cap, issues, onAdd, onRemove, onNeed }: Props) {
  const n = pool.candidates.length;
  const row = n > 0 ? poolRowText(pool, (c) => findFamily(data, c)) : "any of: (add the mods you'd accept)";
  return (
    <div className="space-y-1">
      <ul aria-label={`${side} pool slots`} className="space-y-1">
        {Array.from({ length: pool.need }, (_, i) => (
          <li key={i} className="flex items-center gap-2 px-1 py-0.5">
            <SideChip side={side} tier="any" />
            <span className={`min-w-0 flex-1 truncate text-sm ${MOD_TONE.explicit}`} title={row}>
              {row}
            </span>
          </li>
        ))}
      </ul>
      <div className="space-y-1.5 rounded border border-indigo-400/25 bg-indigo-950/10 p-2">
        <ul aria-label={`${side} pool`} className="flex flex-wrap gap-1">
          {pool.candidates.map((c, i) => (
            <Chip key={c.family} c={c} data={data} onRemove={() => onRemove(i)} />
          ))}
          <li>
            <button type="button" onClick={onAdd} className="rounded border border-dashed border-neutral-600 px-1.5 py-0.5 text-xs text-neutral-300 hover:border-amber-500/60 hover:text-amber-200">
              + add a mod
            </button>
          </li>
        </ul>
        <div className="flex items-center gap-1.5 text-xs text-neutral-300">
          need
          <button type="button" aria-label="need one fewer" className={STEP} disabled={pool.need <= 1} onClick={() => onNeed(pool.need - 1)}>
            <Minus aria-hidden className="h-3 w-3" />
          </button>
          <span className="w-4 text-center tabular-nums text-neutral-100" aria-live="polite">
            {pool.need}
          </span>
          <button type="button" aria-label="need one more" className={STEP} disabled={pool.need >= Math.min(cap, Math.max(n, 1))} onClick={() => onNeed(pool.need + 1)}>
            <Plus aria-hidden className="h-3 w-3" />
          </button>
          of {n} <span className="text-neutral-400">· any combination is fine</span>
        </div>
      </div>
      {issues.map((issue) => (
        <IssueLine key={issue.rule + issue.message} issue={issue} compact />
      ))}
    </div>
  );
}
