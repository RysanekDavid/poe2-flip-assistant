"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { MAX_DIV_PER_RUN, MAX_MINUTES_PER_RUN, type MechanicRow } from "../../lib/farmContract";
import { Button } from "../ui/Button";
import { ItemArt } from "../ui/ItemArt";
import { deleteSpeed, putSpeed, useRowSaves } from "./farmSpeedApi";
import { fmtDivHour } from "./farmView";
import { SpeedInput } from "./SpeedInput";

interface Props {
  /** DOM id, so the chip that opens this editor can point at it (aria-controls). */
  id: string;
  m: MechanicRow;
  exPerDiv: number | null;
  onSaved: () => void;
  onClose: () => void;
}

type Pace = { minutes: number | null; div: number | null };

/**
 * The viewer's pace on one mechanic: minutes per map and their own Div per map. Both fields share
 * one latest-value ref, so committing one field right after the other still saves both — the
 * server row is a full replacement. The ref re-reads the row after every reload, so a PUT never
 * carries a stale value. Minutes are the stored key fact: without them nothing is saved.
 */
export function MechanicSpeedEditor({ id, m, exPerDiv, onSaved, onClose }: Props) {
  const saves = useRowSaves(onSaved);
  const save = saves.status(m.category);
  const latest = useRef<Pace>({ minutes: m.yourMinutes, div: m.yourDivPerRun });
  useEffect(() => {
    latest.current = { minutes: m.yourMinutes, div: m.yourDivPerRun };
  }, [m.yourMinutes, m.yourDivPerRun]);
  const [note, setNote] = useState<string | null>(null);
  const saved = m.yourMinutes != null;

  const commit = (patch: Partial<Pace>): void => {
    latest.current = { ...latest.current, ...patch };
    const { minutes, div } = latest.current;
    if (minutes != null) {
      setNote(null);
      saves.run(m.category, () => putSpeed({ kind: "mechanic", key: m.category, minutesPerRun: minutes, divPerRun: div }));
      return;
    }
    setNote(div != null ? "add your minutes per map — a Div/hour needs both, and nothing is saved without them" : null);
    if (saved) saves.run(m.category, () => deleteSpeed({ kind: "mechanic", key: m.category }));
  };

  return (
    <div id={id} role="group" aria-label={`Your ${m.label} pace`} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-neutral-900/60 px-3 py-2">
      <span className="flex items-center gap-2 text-sm font-medium text-neutral-100">
        <ItemArt src={m.icon} size={6} />
        {m.label} — your maps
      </span>
      <SpeedInput value={m.yourMinutes} onCommit={(v) => commit({ minutes: v })} label={`Your minutes per ${m.label} map`} unit="min / map" max={MAX_MINUTES_PER_RUN} />
      <SpeedInput
        value={m.yourDivPerRun}
        onCommit={(v) => commit({ div: v })}
        label={`Your Div per ${m.label} map`}
        unit="div / map"
        max={MAX_DIV_PER_RUN}
        allowZero
        title="what one of your maps of this mechanic yields, in Divine — your own estimate"
      />
      <span className="text-sm font-semibold tabular-nums text-accent" aria-live="polite">
        {m.divPerHour != null ? fmtDivHour(m.divPerHour, exPerDiv) : <span className="font-normal text-neutral-500">— div/h</span>}
      </span>
      {save.pending > 0 && <span className="text-xs text-neutral-400">saving…</span>}
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close pace editor" className="ml-auto">
        <X aria-hidden className="h-4 w-4" />
      </Button>
      <p className="basis-full text-xs text-neutral-400">
        Your own numbers, private to you: the market cannot tell what your maps of a mechanic yield. Enter or click away saves; empty clears.
      </p>
      {note && <p className="basis-full text-xs text-amber-300">{note}</p>}
      {save.error && (
        <p role="alert" className="basis-full text-sm text-bad">
          Pace not saved — {save.error}
        </p>
      )}
    </div>
  );
}
