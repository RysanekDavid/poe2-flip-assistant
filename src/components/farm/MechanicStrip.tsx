"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { compact } from "../../lib/format";
import type { MechanicRow } from "../../lib/farmContract";
import { ItemArt } from "../ui/ItemArt";
import { Tooltip } from "../ui/Tooltip";

const TOP = 6;

function driversTip(m: MechanicRow) {
  return (
    <span className="grid gap-0.5">
      <span className="font-medium text-neutral-100">{m.hint || m.label}</span>
      {m.drivers.map((d) => (
        <span key={d.item} className="flex justify-between gap-3 tabular-nums">
          <span>{d.item}</span>
          <span className={d.change7d >= 0 ? "text-good" : "text-bad"}>
            {d.change7d >= 0 ? "+" : ""}
            {d.change7d.toFixed(0)}%
          </span>
        </span>
      ))}
      <span className="text-neutral-400">
        {m.itemCount} items · basket {compact(m.basketValueDiv)} div
      </span>
    </span>
  );
}

/** One mechanic: art, name, 7d basket move. A flame marks HOT; direction (not heat) sets the colour. */
function MechanicChip({ m }: { m: MechanicRow }) {
  return (
    <Tooltip tip={driversTip(m)} side="bottom">
      <span className="flex h-10 items-center gap-2 rounded-md border border-line bg-neutral-900/60 px-2.5">
        <ItemArt src={m.icon} size={6} />
        <span className="text-sm font-medium text-neutral-100">{m.label}</span>
        {m.signal === "HOT" && <Flame aria-label="hot" className="h-4 w-4 text-amber-400" />}
        <span className={`text-sm font-semibold tabular-nums ${m.wAvgChange7d >= 0 ? "text-good" : "text-bad"}`}>
          {m.wAvgChange7d >= 0 ? "+" : ""}
          {m.wAvgChange7d.toFixed(0)}%
        </span>
      </span>
    </Tooltip>
  );
}

/** Mechanic baskets by 7d heat — the top six as art chips, the rest behind one toggle. */
export function MechanicStrip({ mechanics }: { mechanics: MechanicRow[] }) {
  const [all, setAll] = useState(false);
  if (mechanics.length === 0) {
    return <p className="text-sm text-neutral-400">No mechanic heat yet — it appears after the first price poll.</p>;
  }
  const shown = all ? mechanics : mechanics.slice(0, TOP);
  return (
    <section data-tour="farm" aria-label="Mechanics by 7-day basket heat" className="flex flex-wrap items-center gap-2">
      {shown.map((m) => (
        <MechanicChip key={m.category} m={m} />
      ))}
      {mechanics.length > TOP && (
        <button type="button" onClick={() => setAll((v) => !v)} className="rounded px-1 text-sm text-neutral-400 hover:text-neutral-100">
          {all ? `top ${TOP}` : `all ${mechanics.length}`}
        </button>
      )}
    </section>
  );
}
