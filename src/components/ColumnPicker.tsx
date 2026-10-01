"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./ui/Button";
import { useDismiss } from "./ui/useDismiss";

interface Props<K extends string> {
  /** Toggleable columns in display order, with their header labels. */
  options: readonly { key: K; label: string }[];
  visible: readonly K[];
  onChange: (next: K[]) => void;
  /** "Default columns" restores this set. */
  defaults: readonly K[];
}

/** "Columns ▾": a checkbox menu that shows or hides a table's optional columns. */
export function ColumnPicker<K extends string>({ options, visible, onChange, defaults }: Props<K>) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  const ref = useRef<HTMLDivElement>(null);
  // a press outside the menu or Escape closes it — the two ways people expect a menu to go away
  useDismiss(open, close, [ref]);
  const shown = new Set(visible);
  // keep the table's column order whatever order the boxes were ticked in
  const toggle = (key: K) => onChange(options.map((o) => o.key).filter((k) => (k === key ? !shown.has(k) : shown.has(k))));
  return (
    <div ref={ref} className="relative">
      <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
        Columns <ChevronDown aria-hidden className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div id={menuId} className="absolute right-0 top-full z-20 mt-1 w-48 space-y-1 rounded-md border border-line bg-neutral-900 p-2 shadow-lg">
          {options.map((o) => (
            <label key={o.key} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-neutral-200 hover:bg-neutral-800">
              <input type="checkbox" checked={shown.has(o.key)} onChange={() => toggle(o.key)} />
              {o.label}
            </label>
          ))}
          <button type="button" onClick={() => onChange([...defaults])} className="mt-1 w-full rounded px-1 py-0.5 text-left text-xs text-neutral-400 hover:text-neutral-100">
            Default columns
          </button>
        </div>
      )}
    </div>
  );
}
