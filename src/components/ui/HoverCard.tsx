"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const CARD_WIDTH = 320;
const GAP = 6;
const EDGE = 8;
// Long enough to cross the gap from trigger to card without the card closing under the pointer.
const CLOSE_DELAY_MS = 150;

interface Position {
  top: number;
  left: number;
  above: boolean;
}

/** Below the trigger when it fits, else above; always inside the viewport horizontally. */
function placeCard(trigger: DOMRect, cardHeight: number): Position {
  const below = trigger.bottom + GAP;
  const above = window.innerHeight - below < cardHeight + EDGE && trigger.top - GAP - cardHeight > EDGE;
  // clientWidth excludes the page scrollbar; innerWidth would tuck the card under it.
  const viewport = document.documentElement.clientWidth;
  const left = Math.min(Math.max(EDGE, trigger.left), viewport - CARD_WIDTH - EDGE);
  return { top: above ? trigger.top - GAP - cardHeight : below, left: Math.max(EDGE, left), above };
}

function usePlacement(open: boolean, triggerRef: RefObject<HTMLElement | null>, cardRef: RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<Position | null>(null);
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPosition(placeCard(trigger.getBoundingClientRect(), cardRef.current?.offsetHeight ?? 0));
  }, [triggerRef, cardRef]);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    // A second pass once the card has measured its own height.
    const frame = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);
  return position;
}

/** Hover opens with a short close grace; click/tap pins (touch has no hover); outside click or Escape closes. */
function useHoverCardState(triggerRef: RefObject<HTMLElement | null>, cardRef: RefObject<HTMLElement | null>) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const enter = useCallback(() => {
    cancelClose();
    setHovered(true);
  }, [cancelClose]);
  const leave = useCallback(() => {
    cancelClose();
    timer.current = setTimeout(() => setHovered(false), CLOSE_DELAY_MS);
  }, [cancelClose]);
  const close = useCallback(() => {
    cancelClose();
    setHovered(false);
    setPinned(false);
  }, [cancelClose]);
  const open = hovered || pinned;
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !cardRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, triggerRef, cardRef]);
  useEffect(() => cancelClose, [cancelClose]);
  return { open, enter, leave, togglePin: () => setPinned((value) => !value) };
}

interface HoverCardProps {
  /** Inline trigger content; it is rendered inside a <button>, so keep it phrasing content. */
  trigger: ReactNode;
  /** Accessible name of the card ("Divine Orb details"). */
  label: string;
  triggerClassName: string;
  children: ReactNode;
}

/**
 * An interactive popover card for inline triggers. Unlike Tooltip it may hold links, and it is
 * portalled with fixed positioning so a scroll or `overflow-hidden` ancestor (chat bubbles) never
 * clips it.
 */
export function HoverCard({ trigger, label, triggerClassName, children }: HoverCardProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const state = useHoverCardState(triggerRef, cardRef);
  const position = usePlacement(state.open, triggerRef, cardRef);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={state.open}
        aria-controls={state.open ? id : undefined}
        onMouseEnter={state.enter}
        onMouseLeave={state.leave}
        onFocus={state.enter}
        onBlur={state.leave}
        onClick={state.togglePin}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {state.open &&
        createPortal(
          <div
            ref={cardRef}
            id={id}
            role="dialog"
            aria-label={label}
            onMouseEnter={state.enter}
            onMouseLeave={state.leave}
            style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, width: CARD_WIDTH }}
            className="fixed z-50 rounded-lg border border-line bg-neutral-900 p-3 text-left text-sm font-normal normal-case not-italic tracking-normal text-neutral-200 shadow-xl shadow-black/40"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
