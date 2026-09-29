"use client";

import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SearchCode, Settings2, X } from "lucide-react";
import { MaxCharsInput, validMaxChars } from "./controls";
import { Popover, TOOL_BUTTON } from "./Popover";

/** Gear menu: the rarely changed stash-search limit, out of the filter cards. Red while invalid. */
export function SettingsMenu({ maxChars, onMaxChars }: { maxChars: number; onMaxChars: (n: number) => void }) {
  const invalid = validMaxChars(maxChars) === null;
  return (
    <Popover
      label={invalid ? "string settings — max characters is out of range" : "string settings"}
      title="max characters per string"
      trigger={<Settings2 aria-hidden className={`h-3.5 w-3.5 ${invalid ? "text-bad" : ""}`} />}
    >
      <MaxCharsInput value={maxChars} onChange={onMaxChars} />
    </Popover>
  );
}

/** Opens the explain drawer (how the string is built + test it against an item). */
export function ExplainToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-label="explain the string"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      title="how the string is built, and test it against an item"
      className={`${TOOL_BUTTON} ${open ? "border-neutral-500 text-neutral-100" : ""}`}
    >
      <SearchCode aria-hidden className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Explain</span>
    </button>
  );
}

/**
 * Drawer state for a panel: opening it pre-fills the explain box with the current string and
 * scrolls the drawer into view (it sits below the mod list, far from the band's button).
 */
export function useExplainDrawer(current: string | undefined) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  const scrollPending = useRef(false);
  useEffect(() => {
    if (!open || !scrollPending.current) return;
    scrollPending.current = false;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open]);
  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (current) setText(current);
    scrollPending.current = true;
    setOpen(true);
  };
  return { open, toggle, close: () => setOpen(false), ref, id, text, setText };
}

/** One titled block inside the explain drawer. */
export function DrawerSection({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
        {title}
        {right}
      </h4>
      {children}
    </section>
  );
}

/** Bottom drawer for the internals; rendered only while open so the page stays short. */
export const ExplainDrawer = forwardRef<HTMLElement, { id: string; open: boolean; onClose: () => void; children: ReactNode }>(function ExplainDrawer(
  { id, open, onClose, children },
  ref,
) {
  return (
    <section ref={ref} id={id} aria-label="explain the search string" hidden={!open} className="scroll-mt-[calc(var(--shell-h,0px)+12rem)] rounded-lg border border-line bg-surface/60 p-4">
      {open && (
        <>
          <header className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Explain the string</h3>
            <button type="button" onClick={onClose} aria-label="close explain" className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100">
              <X aria-hidden className="h-4 w-4" />
            </button>
          </header>
          <div className="flex flex-col gap-4">{children}</div>
        </>
      )}
    </section>
  );
});
