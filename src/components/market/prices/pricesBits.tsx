"use client";

import type { ReactNode } from "react";

/** A filter toggle above a Prices table: bordered pill, amber when on (filters, not navigation). */
export function FilterChip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={`h-7 rounded-md border px-2.5 text-xs font-medium transition-colors ${
        on ? "border-amber-400/60 bg-amber-400/15 text-amber-100" : "border-neutral-700 bg-neutral-900/60 text-neutral-400 hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

export function SkeletonRows({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-1">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-11 animate-pulse rounded bg-neutral-800/60" />
      ))}
    </div>
  );
}
