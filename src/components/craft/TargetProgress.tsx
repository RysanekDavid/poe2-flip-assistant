"use client";

import { useMemo } from "react";
import type { WeightedTarget } from "../../core/craftMeta";
import type { ModTier } from "../../core/craftTargets";

/**
 * Interactive next-mod guide (purpose 2 of the Craft Helper): compares the mods currently in
 * the planner (picked by hand or pasted off a real item) against the active target's desired
 * set and says what to craft next — first missing core, then ideal, then luxury.
 */

const TIER_ORDER: Record<ModTier, number> = { core: 0, ideal: 1, luxury: 2 };
const TIER_CLS: Record<ModTier, string> = {
  core: "text-emerald-400",
  ideal: "text-sky-400",
  luxury: "text-amber-400",
};

export function TargetProgress({
  target,
  chosenIds,
  onAdd,
  onClear,
}: {
  target: WeightedTarget;
  chosenIds: Set<string>;
  onAdd: (id: string, text: string, min?: number) => void;
  onClear: () => void;
}) {
  const rows = useMemo(
    () =>
      target.resolvedMods
        .filter((m) => m.id !== null)
        .map((m) => ({ ...m, id: m.id!, have: chosenIds.has(m.id!) }))
        .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || Number(b.have) - Number(a.have)),
    [target, chosenIds],
  );
  const next = rows.find((r) => !r.have);
  const haveCount = rows.filter((r) => r.have).length;

  return (
    <div className="rounded-lg border border-sky-900 bg-sky-950/20 p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-neutral-100">target: {target.label}</span>
        <span className="text-xs text-neutral-500">
          {haveCount}/{rows.length} mods
        </span>
        <button onClick={onClear} className="ml-auto text-xs text-neutral-600 hover:text-bad">
          clear target ✕
        </button>
      </div>

      {next ? (
        <p className="mb-2 text-sm">
          <span className="text-neutral-500">next best mod: </span>
          <span className={`font-semibold ${TIER_CLS[next.tier]}`}>
            {next.text.replace(/^#\s*/, "")}
            {next.min != null && ` ≥${next.min}`}
          </span>
          {next.note && <span className="ml-2 text-xs text-neutral-500">({next.note})</span>}
        </p>
      ) : (
        <p className="mb-2 text-sm font-semibold text-good">full desired set — price it and sell.</p>
      )}

      <ul className="flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <li key={r.id}>
            {r.have ? (
              <span className={`inline-flex items-center gap-1 rounded bg-neutral-800/60 px-2 py-0.5 text-xs ${TIER_CLS[r.tier]}`} title={r.note}>
                ✓ {r.text.replace(/^#\s*/, "")}
              </span>
            ) : (
              <button
                onClick={() => onAdd(r.id, r.text, r.min)}
                className={`inline-flex items-center gap-1 rounded border border-dashed border-neutral-700 px-2 py-0.5 text-xs opacity-70 transition hover:opacity-100 ${TIER_CLS[r.tier]}`}
                title={`${r.note ? `${r.note} — ` : ""}click to add to the search`}
              >
                + {r.text.replace(/^#\s*/, "")}
                {r.min != null && <span className="text-neutral-500">≥{r.min}</span>}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
