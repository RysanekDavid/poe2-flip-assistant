"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes a popover on Escape or on a press outside every element in `inside` (the panel and its
 * trigger). A document listener rather than a fixed overlay: the header's backdrop blur makes a
 * "fixed" overlay header-sized. When the popover closes while focus was inside it (or was dropped
 * to <body> as it unmounted), focus goes back to `returnTo` so keyboard users keep their place.
 */
export function useDismiss(
  open: boolean,
  close: () => void,
  inside: ReadonlyArray<RefObject<HTMLElement | null>>,
  returnTo?: RefObject<HTMLElement | null>,
): void {
  // read through a ref so a new array literal each render does not re-run the effect
  const insideRef = useRef(inside);
  insideRef.current = inside;
  useEffect(() => {
    if (!open) return;
    const contains = (node: Node): boolean => insideRef.current.some((r) => r.current?.contains(node) ?? false);
    const onDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && !contains(e.target)) close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      const active = document.activeElement;
      if (returnTo?.current && (active === null || active === document.body || contains(active))) returnTo.current.focus();
    };
  }, [open, close, returnTo]);
}
