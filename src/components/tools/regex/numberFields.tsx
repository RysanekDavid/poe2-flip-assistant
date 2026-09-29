"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { VALUE_BOUNDS, parseNumberText, parseRangeText, type Bounds } from "./selectionOps";

const fmt = (n: number | null): string => (n === null ? "" : String(n));

const INPUT = "rounded-md border bg-neutral-950 px-2 text-right tabular-nums text-neutral-100 placeholder:text-neutral-500";
const size = (compact: boolean): string => (compact ? "h-7 w-16 text-xs" : "h-8 w-20 text-sm");
const border = (bad: boolean): string => (bad ? "border-bad" : "border-neutral-700");

/**
 * A single minimum. The text is the player's, never rewritten: a valid value is applied as they
 * type, an invalid one turns the field red with the reason and is not applied.
 */
export function NumberField({ label, value, onChange, bounds = VALUE_BOUNDS, placeholder = "any", compact = false }: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  bounds?: Bounds;
  placeholder?: string;
  compact?: boolean;
}) {
  const [text, setText] = useState(fmt(value));
  const [error, setError] = useState<string | null>(null);
  const applied = useRef(value);
  // an outside change (reset, preset, share link) replaces the text; the echo of our own edit does not
  useEffect(() => {
    if (value === applied.current) return;
    applied.current = value;
    setText(fmt(value));
    setError(null);
  }, [value]);
  const edit = (raw: string) => {
    setText(raw);
    const parsed = parseNumberText(raw, bounds);
    setError(parsed.ok ? null : parsed.error);
    if (!parsed.ok || parsed.value === value) return;
    applied.current = parsed.value;
    onChange(parsed.value);
  };
  return (
    <span className="inline-flex flex-col">
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={error !== null}
        title={error ?? undefined}
        placeholder={placeholder}
        value={text}
        onChange={(e) => edit(e.target.value)}
        className={`${INPUT} ${size(compact)} ${border(error !== null)}`}
      />
      {error && <span role="alert" className="max-w-[10rem] text-xs text-bad">{error}</span>}
    </span>
  );
}

interface RangeProps {
  label: string;
  min: number | null;
  max: number | null;
  /** Called on blur / Enter with a valid pair only. */
  onCommit: (min: number | null, max: number | null) => void;
  bounds?: Bounds;
  compact?: boolean;
}

/** Min–max pair, committed on blur or Enter; "min is above max" is shown, never auto-fixed. */
export function RangeFields({ label, min, max, onCommit, bounds = VALUE_BOUNDS, compact = false }: RangeProps) {
  const [minText, setMinText] = useState(fmt(min));
  const [maxText, setMaxText] = useState(fmt(max));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setMinText(fmt(min));
    setMaxText(fmt(max));
    setError(null);
  }, [min, max]);
  const commit = () => {
    const parsed = parseRangeText(minText, maxText, bounds);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    if (parsed.min !== min || parsed.max !== max) onCommit(parsed.min, parsed.max);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit();
  };
  const cls = `${INPUT} ${size(compact)} ${border(error !== null)}`;
  return (
    <span className="inline-flex flex-col">
      <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
        <input type="text" inputMode="numeric" aria-label={`${label} min`} aria-invalid={error !== null} placeholder="min" value={minText} onChange={(e) => setMinText(e.target.value)} onBlur={commit} onKeyDown={onKey} className={cls} />
        –
        <input type="text" inputMode="numeric" aria-label={`${label} max`} aria-invalid={error !== null} placeholder="max" value={maxText} onChange={(e) => setMaxText(e.target.value)} onBlur={commit} onKeyDown={onKey} className={cls} />
      </span>
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </span>
  );
}
