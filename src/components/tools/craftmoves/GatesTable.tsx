"use client";

import { useState } from "react";
import type { FamilyGateView } from "../../../lib/tools/craftMovesContract";

/** "+(41-45)% to Cold Resistance" → readable family label (the best tier's own text). */
const labelOf = (g: FamilyGateView): string => g.best.text.split("\n").join(" / ");

function FloorChips({ g }: { g: FamilyGateView }) {
  return (
    <span className="flex flex-wrap gap-1">
      {g.floors.map((f) => {
        const title = f.softFloor
          ? `${f.currency}: every reachable tier is below ${f.floor} — the soft floor still rolls the top reachable tier`
          : `${f.currency}: cannot roll tiers below modifier level ${f.floor} (${f.cutTiers} of ${g.reachable} reachable tiers cut)`;
        return (
          <span
            key={f.currency}
            title={title}
            className={`rounded px-1 text-[10px] tabular-nums ${f.softFloor ? "bg-amber-950/60 text-amber-400" : f.cutTiers > 0 ? "bg-neutral-800 text-neutral-300" : "text-neutral-600"}`}
          >
            {f.currency.split(" ")[0]} ≥{f.floor}: {f.softFloor ? "soft" : `−${f.cutTiers}`}
          </span>
        );
      })}
    </span>
  );
}

function GateRow({ g }: { g: FamilyGateView }) {
  const top = g.topReachable;
  const capped = top != null && top.rank < g.tiers;
  return (
    <tr className={g.present ? "bg-neutral-900/60" : undefined}>
      <td className="px-2 py-1 text-[10px] uppercase text-neutral-500">{g.side[0]}</td>
      <td className="px-2 py-1 text-neutral-300" title={g.family}>
        {labelOf(g)}
        {g.present && <span className="ml-1 text-[10px] text-amber-400" title="on the item now">●</span>}
        {g.kbRow && (
          <span className="ml-1 rounded border border-emerald-900 px-1 text-[9px] text-emerald-400" title={`cross-checked against KB §3: ${g.kbRow}`}>
            KB
          </span>
        )}
      </td>
      <td className={`px-2 py-1 text-right tabular-nums ${capped ? "text-amber-400" : "text-neutral-300"}`} title={top ? top.text : "no tier reachable"}>
        {top ? `T${top.rank}/${g.tiers}` : "—"}
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-neutral-500" title={`best tier: ${g.best.text}`}>
        {capped ? `ilvl ${g.best.level}` : "✓"}
      </td>
      <td className="px-2 py-1">
        <FloorChips g={g} />
      </td>
    </tr>
  );
}

/** Per-family tier gates: what this item level reaches, and what each verified floor cuts. */
export function GatesTable({ gates, ilvl }: { gates: FamilyGateView[]; ilvl: number | null }) {
  const [all, setAll] = useState(false);
  if (gates.length === 0) return null;
  const present = gates.filter((g) => g.present);
  const shown = all || present.length === 0 ? gates : present;
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-200" title="tiers count upward in-game: the highest number is the best tier">
          Tier gates at ilvl {ilvl ?? "?"}
        </h3>
        {present.length > 0 && (
          <button onClick={() => setAll((v) => !v)} className="text-xs text-neutral-500 hover:text-neutral-300">
            {all ? "only this item's mods" : `all ${gates.length} families`}
          </button>
        )}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-2 py-1 font-medium" />
              <th className="px-2 py-1 font-medium">family</th>
              <th className="px-2 py-1 text-right font-medium" title="best tier reachable at this item level">top</th>
              <th className="px-2 py-1 text-right font-medium" title="item level the best tier needs">best needs</th>
              <th className="px-2 py-1 font-medium" title="tiers each verified currency floor cuts (KB §1)">floors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60">
            {shown.map((g) => <GateRow key={`${g.side}:${g.family}`} g={g} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
