"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { fuzzyRank } from "../../lib/fuzzy";

interface SearchComboProps<T> {
  options: readonly T[];
  /** searchable text for an option (every typed word must appear in this) */
  toText: (t: T) => string;
  /** stable react key for an option */
  toKey: (t: T) => string;
  /** dropdown row content */
  renderRow: (t: T) => ReactNode;
  onPick: (t: T) => void;
  placeholder?: string;
  minChars?: number;
  limit?: number;
  /** options to hide (already chosen), by key */
  exclude?: ReadonlySet<string>;
  autoFocus?: boolean;
}

/**
 * Fuzzy, keyboard-driven autocomplete. Order-independent keyword match (PoE-style):
 * "increased chance hit" finds "#% increased Critical Hit Chance". Arrow keys move the
 * highlight, Enter picks, Escape closes. Generic so it drives both the base picker and
 * the mod picker with one implementation.
 */
export function SearchCombo<T>({
  options,
  toText,
  toKey,
  renderRow,
  onPick,
  placeholder,
  minChars = 2,
  limit = 25,
  exclude,
  autoFocus,
}: SearchComboProps<T>) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const pool = useMemo(
    () => (exclude ? options.filter((o) => !exclude.has(toKey(o))) : options),
    [options, exclude, toKey],
  );

  const hits = useMemo(() => {
    if (q.trim().length < minChars) return [];
    return fuzzyRank(q, pool, toText, limit);
  }, [q, pool, toText, minChars, limit]);

  const pick = (t: T) => {
    onPick(t);
    setQ("");
    setHi(0);
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = hits[Math.min(hi, hits.length - 1)];
      if (t) pick(t);
    } else if (e.key === "Escape") {
      setQ("");
      setHi(0);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
        }}
        onKeyDown={onKey}
        placeholder={placeholder}
        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:border-neutral-600 focus:outline-none"
      />
      {hits.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 shadow-2xl">
          {hits.map((t, i) => (
            <li key={toKey(t)}>
              <button
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(t)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                  i === hi ? "bg-neutral-800" : "hover:bg-neutral-800/60"
                }`}
              >
                {renderRow(t)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
