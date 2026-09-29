"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface PanelProps {
  title?: string;
  /** Header-right slot: a count, a StaleBadge, one small action. */
  right?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** The standard surface: rounded-lg, one border colour, p-4. Collapsible panels need a title. */
export function Panel({ title, right, collapsible = false, defaultOpen = true, children }: PanelProps) {
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen);
  if (collapsible && !title) throw new Error("Panel: a collapsible panel needs a title to toggle it by");
  const expanded = !collapsible || open;
  const heading = title && (
    collapsible ? (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded text-lg font-semibold text-neutral-100 hover:text-white"
      >
        <ChevronDown aria-hidden className={`h-4 w-4 text-neutral-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        {title}
      </button>
    ) : (
      <h3 className="text-lg font-semibold text-neutral-100">{title}</h3>
    )
  );
  return (
    <section className="rounded-lg border border-line bg-surface/60 p-4">
      {(heading || right) && (
        <header className={`flex flex-wrap items-center justify-between gap-2 ${expanded ? "mb-3" : ""}`}>
          {heading}
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      <div id={bodyId} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
