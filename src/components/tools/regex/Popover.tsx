"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Small square-ish control used across the band's tool row (Saved, Share, Explain, settings). */
export const TOOL_BUTTON =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 text-xs font-medium text-neutral-300 hover:border-neutral-500 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300";

interface PopoverProps {
  /** Accessible name of the trigger (it may be icon-only). */
  label: string;
  /** Visible trigger content: an icon, optionally a word. */
  trigger: ReactNode;
  title?: string;
  children: ReactNode;
}

/**
 * A trigger button with a panel under it. Closes on Escape (focus returns to the trigger) and on
 * a press outside; it is a disclosure, not a modal, so Tab moves on through the page as usual.
 */
export function Popover({ label, trigger, title, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={`${TOOL_BUTTON} ${open ? "border-neutral-500 text-neutral-100" : ""}`}
      >
        {trigger}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-full z-40 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-line bg-neutral-900 p-3 shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}
