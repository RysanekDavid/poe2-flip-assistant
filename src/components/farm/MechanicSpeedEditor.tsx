"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { MAX_MINUTES_PER_RUN, type MechanicRow } from "../../lib/farmContract";
import { Button } from "../ui/Button";
import { ItemArt } from "../ui/ItemArt";
import { deleteSpeed, putSpeed, useSpeedSave } from "./farmSpeedApi";
import { fmtDivHour } from "./farmView";
import { SpeedInput } from "./SpeedInput";

// Far above any real map; only stops a typo (an extra zero or two) from reading as a yield.
const MAX_DIV_PER_MAP = 10_000;

interface Props {
  m: MechanicRow;
  exPerDiv: number | null;
  onSaved: () => void;
  onClose: () => void;
}

type Pace = { minutes: number | null; div: number | null };

/**
 * The viewer's pace on one mechanic: minutes per map and their own Div per map. Both fields share
 * one latest-value ref, so committing one field right after the other still saves both — the
 * server row is a full replacement. Minutes are the stored key fact: without them nothing is saved.
 */
export function MechanicSpeedEditor({ m, exPerDiv, onSaved, onClose }: Props) {
  const { error, pending, run } = useSpeedSave(onSaved);
  const latest = useRef<Pace>({ minutes: m.yourMinutes, div: m.yourDivPerRun });
  const [note, setNote] = useState<string | null>(null);
  const saved = m.yourMinutes != null;

  const commit = (patch: Partial<Pace>): void => {
    latest.current = { ...latest.current, ...patch };
    const { minutes, div } = latest.current;
    if (minutes != null) {
      setNote(null);
      run(() => putSpeed({ kind: "mechanic", key: m.category, minutesPerRun: minutes, divPerRun: div }));
      return;
    }
    setNote(div != null ? "add your minutes per map — a Div/hour needs both, and nothing is saved without them" : null);
    if (saved) run(() => deleteSpeed({ kind: "mechanic", key: m.category }));
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-neutral-900/60 px-3 py-2">
      <span className="flex items-center gap-2 text-sm font-medium text-neutral-100">
        <ItemArt src={m.icon} size={6} />
        {m.label} — your maps
      </span>
      <SpeedInput key={`min-${String(m.yourMinutes)}`} value={m.yourMinutes} onCommit={(v) => commit({ minutes: v })} label={`Your minutes per ${m.label} map`} unit="min / map" max={MAX_MINUTES_PER_RUN} />
      <SpeedInput
        key={`div-${String(m.yourDivPerRun)}`}
        value={m.yourDivPerRun}
        onCommit={(v) => commit({ div: v })}
        label={`Your Div per ${m.label} map`}
        unit="div / map"
        max={MAX_DIV_PER_MAP}
        allowZero
        title="what one of your maps of this mechanic yields, in Divine — your own estimate"
      />
      <span className="text-sm font-semibold tabular-nums text-accent" aria-live="polite">
        {m.divPerHour != null ? fmtDivHour(m.divPerHour, exPerDiv) : <span className="font-normal text-neutral-500">— div/h</span>}
      </span>
      {pending && <span className="text-xs text-neutral-400">saving…</span>}
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close pace editor" className="ml-auto">
        <X aria-hidden className="h-4 w-4" />
      </Button>
      <p className="basis-full text-xs text-neutral-400">
        Your own numbers, private to you: the market cannot tell what your maps of a mechanic yield. Enter or click away saves; empty clears.
      </p>
      {note && <p className="basis-full text-xs text-amber-300">{note}</p>}
      {error && (
        <p role="alert" className="basis-full text-sm text-bad">
          Pace not saved — {error}
        </p>
      )}
    </div>
  );
}
