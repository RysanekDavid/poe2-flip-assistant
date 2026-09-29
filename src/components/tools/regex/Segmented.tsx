"use client";

import { useRef, type KeyboardEvent } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Classes applied while this option is selected (colour + border). */
  activeClass?: string;
  title?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group (e.g. the mod text). */
  label: string;
  compact?: boolean;
}

const DEFAULT_ACTIVE = "border-amber-400/60 bg-amber-400/15 text-amber-100";

/**
 * Radio group rendered as joined buttons. Keyboard: Tab enters on the selected option, arrow
 * keys (and Home/End) move AND select, as the WAI-ARIA radio pattern expects.
 */
export function Segmented<T extends string>({ options, value, onChange, label, compact = false }: SegmentedProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (to: number) => {
    const next = options[(to + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    refs.current[(to + options.length) % options.length]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step !== undefined) move(selectedIndex + step);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(options.length - 1);
    else return;
    e.preventDefault();
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="inline-flex shrink-0 overflow-hidden rounded-md border border-neutral-700">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`border-l border-neutral-700 font-medium first:border-l-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-300 ${compact ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm"} ${
              on ? (o.activeClass ?? DEFAULT_ACTIVE) : "bg-neutral-900/60 text-neutral-400 hover:text-neutral-100"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
