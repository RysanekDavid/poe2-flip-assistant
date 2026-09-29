"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { compact } from "../../lib/format";
import type { MechanicRow } from "../../lib/farmContract";
import { fmtDiv } from "../../core/tools/bossEv/headline";
import { ItemArt } from "../ui/ItemArt";
import { Tooltip } from "../ui/Tooltip";
import { fmtDivHour } from "./farmView";
import { MechanicSpeedEditor } from "./MechanicSpeedEditor";

const TOP = 6;

function paceLine(m: MechanicRow, exPerDiv: number | null) {
  if (m.divPerHour != null && m.yourMinutes != null && m.yourDivPerRun != null) {
    return (
      <span className="text-accent">
        your Div/h {fmtDivHour(m.divPerHour, exPerDiv)} = {fmtDiv(m.yourDivPerRun, exPerDiv ?? 0)} per map × 60 ÷ {m.yourMinutes} min per map
      </span>
    );
  }
  const missing = m.yourMinutes == null ? "your minutes and Div per map" : "your Div per map";
  return <span className="text-neutral-400">Click to enter {missing} — the market cannot know what your maps yield, so Div/hour needs your own numbers.</span>;
}

function driversTip(m: MechanicRow, exPerDiv: number | null) {
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
      {paceLine(m, exPerDiv)}
    </span>
  );
}

interface ChipProps {
  m: MechanicRow;
  exPerDiv: number | null;
  open: boolean;
  onToggle: () => void;
}

/** One mechanic: art, name, 7d basket move, and the viewer's Div/h once both their inputs exist. */
function MechanicChip({ m, exPerDiv, open, onToggle }: ChipProps) {
  return (
    <Tooltip tip={driversTip(m, exPerDiv)} side="bottom">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex h-10 items-center gap-2 rounded-md border bg-neutral-900/60 px-2.5 hover:border-neutral-500 ${open ? "border-amber-400/70" : "border-line"}`}
      >
        <ItemArt src={m.icon} size={6} />
        <span className="text-sm font-medium text-neutral-100">{m.label}</span>
        {m.signal === "HOT" && <Flame aria-label="hot" className="h-4 w-4 text-amber-400" />}
        <span className={`text-sm font-semibold tabular-nums ${m.wAvgChange7d >= 0 ? "text-good" : "text-bad"}`}>
          {m.wAvgChange7d >= 0 ? "+" : ""}
          {m.wAvgChange7d.toFixed(0)}%
        </span>
        {m.divPerHour != null && <span className="border-l border-line pl-2 text-sm font-semibold tabular-nums text-accent">{fmtDivHour(m.divPerHour, exPerDiv)}</span>}
      </button>
    </Tooltip>
  );
}

interface Props {
  mechanics: MechanicRow[];
  exPerDiv: number | null;
  /** After a pace is saved or cleared: reload, so Div/hour comes from the server. */
  onSpeedSaved: () => void;
}

/** Mechanic baskets by 7d heat — the top six as art chips, the rest behind one toggle; a chip opens its pace editor. */
export function MechanicStrip({ mechanics, exPerDiv, onSpeedSaved }: Props) {
  const [all, setAll] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (mechanics.length === 0) {
    return <p className="text-sm text-neutral-400">No mechanic heat yet — it appears after the first price poll.</p>;
  }
  const shown = all ? mechanics : mechanics.slice(0, TOP);
  const open = mechanics.find((m) => m.category === openKey) ?? null;
  return (
    <section data-tour="farm" aria-label="Mechanics by 7-day basket heat" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {shown.map((m) => (
          <MechanicChip key={m.category} m={m} exPerDiv={exPerDiv} open={m.category === openKey} onToggle={() => setOpenKey((k) => (k === m.category ? null : m.category))} />
        ))}
        {mechanics.length > TOP && (
          <button type="button" onClick={() => setAll((v) => !v)} className="rounded px-1 text-sm text-neutral-400 hover:text-neutral-100">
            {all ? `top ${TOP}` : `all ${mechanics.length}`}
          </button>
        )}
      </div>
      {open && <MechanicSpeedEditor key={open.category} m={open} exPerDiv={exPerDiv} onSaved={onSpeedSaved} onClose={() => setOpenKey(null)} />}
    </section>
  );
}
