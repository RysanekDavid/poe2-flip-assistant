"use client";

import { useEffect, useState } from "react";

interface Props {
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  label: string;
  title?: string;
  className: string;
}

/**
 * A whole-number input you can clear while typing: every valid value commits at once, an empty or
 * out-of-range draft is flagged in place, and leaving the field puts the last valid value back.
 */
export function NumberField({ value, min, max, onCommit, label, title, className }: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const n = Number(draft);
  const valid = draft.trim() !== "" && Number.isInteger(n) && n >= min && n <= max;
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      aria-label={label}
      aria-invalid={!valid}
      title={title ?? `a whole number from ${min} to ${max}`}
      onChange={(e) => {
        setDraft(e.target.value);
        const next = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isInteger(next) && next >= min && next <= max) onCommit(next);
      }}
      onBlur={() => setDraft(String(value))}
      className={`${className} ${valid ? "" : "border-red-500/70"}`}
    />
  );
}
