"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface DrawerProps {
  /** Accessible name and visible heading text of the panel. */
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab cycle inside the panel; a modal must not leak focus to the page behind it. */
function trapTab(e: KeyboardEvent, panel: HTMLElement): void {
  const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Escape closes, Tab stays inside, the page behind does not scroll, and focus returns to the opener on close. */
function useModalBehaviour(mounted: boolean, panel: RefObject<HTMLDivElement | null>, close: RefObject<HTMLButtonElement | null>, onClose: () => void): void {
  useEffect(() => {
    // the panel exists only after the portal mounts; before that there is nothing to focus
    if (!mounted) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Tab" && panel.current) trapTab(e, panel.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [mounted, panel, close, onClose]);
}

/**
 * A modal side panel: docked to the right on desktop, the whole screen on a phone. Rendered
 * into <body> so no transformed ancestor can clip it, and only after mount (no server render).
 */
export function Drawer({ title, onClose, children }: DrawerProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useModalBehaviour(mounted, panel, close, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full flex-col overflow-hidden border-line bg-neutral-950 shadow-2xl md:max-w-2xl md:border-l"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-lg font-semibold text-neutral-100">
            {title}
          </h2>
          <button ref={close} type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
