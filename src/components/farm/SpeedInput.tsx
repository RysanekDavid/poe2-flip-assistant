"use client";

import { useState, type KeyboardEvent } from "react";
import { parseSpeedDraft } from "../../core/farm/farmSpeed";

interface Props {
  /** The saved value; the field resets to it whenever the parent re-keys it after a reload. */
  value: number | null;
  /** Called only when the typed value parses AND differs from the saved one; null = cleared. */
  onCommit: (value: number | null) => void;
  label: string;
  unit: string;
  max: number;
  /** Div per map may be 0 (a dry map); minutes may not. */
  allowZero?: boolean;
  disabled?: boolean;
  title?: string;
}

/**
 * A compact number field that saves on Enter or blur — no separate Save button inside a table row.
 * Enter blurs, so the one commit path is blur and a value is never sent twice. Invalid input stays
 * in the field, red, and is not sent.
 */
export function SpeedInput({ value, onCommit, label, unit, max, allowZero = false, disabled = false, title }: Props) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const parsed = parseSpeedDraft(draft, max, allowZero);
  const commit = (): void => {
    if (parsed.ok && parsed.value !== value) onCommit(parsed.value);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") setDraft(value == null ? "" : String(value));
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={!parsed.ok}
        title={parsed.ok ? title : `enter a number${allowZero ? "" : " above 0"}, at most ${max}`}
        value={draft}
        disabled={disabled}
        placeholder="—"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        className={`h-7 w-14 rounded-md border bg-neutral-950 px-1.5 text-right text-xs tabular-nums text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-amber-400 disabled:opacity-50 ${parsed.ok ? "border-neutral-700" : "border-bad"}`}
      />
      <span className="text-xs text-neutral-400">{unit}</span>
    </span>
  );
}
