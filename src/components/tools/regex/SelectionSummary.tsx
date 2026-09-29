"use client";

import { X } from "lucide-react";
import type { ModState } from "../../../lib/tools/regexPoolContract";

const BUCKETS: readonly { state: ModState; label: string; chip: string; head: string }[] = [
  { state: "avoid", label: "Avoid", chip: "border-bad/50 bg-bad/10 text-red-100", head: "text-red-200" },
  { state: "want", label: "Want", chip: "border-good/50 bg-good/10 text-green-100", head: "text-green-200" },
];

const CHIP_CHARS = 36;
const truncate = (s: string): string => (s.length > CHIP_CHARS ? `${s.slice(0, CHIP_CHARS - 1)}…` : s);

interface SummaryProps {
  mods: Readonly<Record<string, ModState>>;
  /** Display text per mod id; an id the pool no longer has (old share link) shows as itself. */
  labelOf: (modId: string) => string;
  onRemove: (modId: string) => void;
}

/** "Avoid (2)" / "Want (1)" with one removable chip per marked mod — the selection at a glance. */
export function SelectionSummary({ mods, labelOf, onRemove }: SummaryProps) {
  const entries = Object.entries(mods);
  return (
    <div className="flex flex-col gap-1.5" aria-label="selected mods">
      {BUCKETS.map((b) => {
        const ids = entries.filter(([, s]) => s === b.state).map(([id]) => id);
        return (
          <div key={b.state} className="flex items-start gap-3">
            <span className={`w-16 shrink-0 pt-1 text-xs font-semibold tabular-nums ${b.head}`}>
              {b.label} ({ids.length})
            </span>
            {ids.length === 0 ? (
              <span className="pt-1 text-xs text-neutral-500">none yet</span>
            ) : (
              <ul className="flex min-w-0 flex-wrap gap-1.5">
                {ids.map((id) => {
                  const label = labelOf(id);
                  return (
                    <li key={id} className={`inline-flex max-w-full items-center gap-1 rounded-md border py-1 pl-2 pr-1 text-xs ${b.chip}`}>
                      <span className="min-w-0 truncate" title={label}>{truncate(label)}</span>
                      <button type="button" onClick={() => onRemove(id)} aria-label={`remove "${label}" from ${b.label}`} className="rounded p-0.5 opacity-80 hover:bg-neutral-950/40 hover:opacity-100">
                        <X aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
