"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { parseSpeedDraft } from "../../core/farm/farmSpeed";
import type { RowSave } from "./farmSpeedApi";

interface Props {
  /** The saved value; an unfocused field follows it after every reload. */
  value: number | null;
  /** Called only when the typed value parses AND differs from the saved one; null = cleared. */
  onCommit: (value: number | null) => void;
  label: string;
  /** Shown after the field; omit it when the placeholder or the cell already names the unit. */
  unit?: string;
  /** Hint inside an empty field (default "—"). */
  placeholder?: string;
  max: number;
  /** Div per map may be 0 (a dry map); minutes may not. */
  allowZero?: boolean;
  title?: string;
  /** The row's save state: "saving…" while queued or in flight, "not saved" (reason in the tooltip) after a failure. */
  save?: RowSave;
}

const text = (v: number | null): string => (v == null ? "" : String(v));

function Status({ id, invalid, max, allowZero, save }: { id: string; invalid: boolean; max: number; allowZero: boolean; save?: RowSave }) {
  if (invalid) {
    return (
      <span id={id} className="text-xs text-bad">
        {allowZero ? "0" : ">0"}–{max}
      </span>
    );
  }
  if (save && save.pending > 0) return <span className="text-xs text-neutral-400">saving…</span>;
  if (save?.error) {
    return (
      <span id={id} className="text-xs text-bad" title={save.error}>
        not saved
      </span>
    );
  }
  return null;
}

/**
 * A compact number field that saves on Enter or blur — no separate Save button inside a table row.
 * Enter blurs, so the one commit path is blur and a value is never sent twice. Invalid input stays
 * in the field, red, with a visible range, and is not sent. The field is never remounted by a
 * reload (that would drop focus); it re-reads `value` only while it is not being edited.
 */
export function SpeedInput({ value, onCommit, label, unit, placeholder = "—", max, allowZero = false, title, save }: Props) {
  const [draft, setDraft] = useState(text(value));
  const focused = useRef(false);
  const statusId = useId();
  useEffect(() => {
    if (!focused.current) setDraft(text(value));
  }, [value]);
  const parsed = parseSpeedDraft(draft, max, allowZero);
  const failed = !parsed.ok || save?.error != null;
  const commit = (): void => {
    focused.current = false;
    if (parsed.ok && parsed.value !== value) onCommit(parsed.value);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") setDraft(text(value));
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={!parsed.ok}
        aria-describedby={failed ? statusId : undefined}
        title={parsed.ok ? title : `enter a number${allowZero ? "" : " above 0"}, at most ${max}`}
        value={draft}
        placeholder={placeholder}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        className={`h-7 ${placeholder === "—" ? "w-14" : "w-16"} rounded-md border bg-neutral-950 px-1.5 text-right text-xs tabular-nums text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-amber-400 ${failed ? "border-bad" : "border-neutral-700"}`}
      />
      {unit && <span className="text-xs text-neutral-400">{unit}</span>}
      <Status id={statusId} invalid={!parsed.ok} max={max} allowZero={allowZero} save={save} />
    </span>
  );
}
