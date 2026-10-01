"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
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


type Refs = { trigger: RefObject<HTMLButtonElement | null>; card: RefObject<HTMLDivElement | null> };

/** Close; `restore` hands focus back to the trigger (Escape, Tab out of the card, re-activation). */
function useCloser(refs: Refs, cancelClose: () => void, setHovered: (v: boolean) => void, setPinned: (v: boolean) => void) {
  return useCallback(
    (restore: boolean) => {
      cancelClose();
      setHovered(false);
      setPinned(false);
      if (restore) refs.trigger.current?.focus();
    },
    [refs, cancelClose, setHovered, setPinned],
  );
}

/** Outside pointer closes quietly; Escape closes and restores focus if it was on the trigger or in the card. */
function useDismiss(open: boolean, refs: Refs, close: (restore: boolean) => void) {
  useEffect(() => {
    if (!open) return;
    const inside = (node: Node | null): boolean =>
      !!node && Boolean(refs.trigger.current?.contains(node) || refs.card.current?.contains(node));
    const onPointer = (event: PointerEvent) => {
      if (!inside(event.target as Node)) close(false);
    };
    // Capture phase + preventDefault: an open card takes this Escape, so a Drawer around it stays open.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(inside(document.activeElement));
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, refs, close]);
}

/**
 * Hover opens with a short close grace. Click/tap pins it (touch has no hover) and a second
 * activation closes it. Keyboard activation also moves focus into the card so its link is
 * reachable with Tab.
 */
function useHoverCardState(refs: Refs) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focusCard, setFocusCard] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const close = useCloser(refs, cancelClose, setHovered, setPinned);
  const open = hovered || pinned;
  useDismiss(open, refs, close);
  useEffect(() => cancelClose, [cancelClose]);
  useEffect(() => {
    if (!focusCard || !open) return;
    refs.card.current?.focus();
    setFocusCard(false);
  }, [focusCard, open, refs]);
  return {
    open,
    close,
    enter: () => {
      cancelClose();
      setHovered(true);
    },
    leave: () => {
      cancelClose();
      timer.current = setTimeout(() => setHovered(false), CLOSE_DELAY_MS);
    },
    // detail 0 = activated by Enter/Space, not a pointer.
    activate: (keyboard: boolean) => {
      if (pinned) return close(keyboard);
      setPinned(true);
      if (keyboard) setFocusCard(true);
    },
  };
}

/** Tab from the card's last stop, or Shift+Tab from its first, returns to the trigger and closes. */
function trapExit(event: ReactKeyboardEvent<HTMLDivElement>, close: (restore: boolean) => void): void {
  if (event.key !== "Tab") return;
  const card = event.currentTarget;
  const stops = [...card.querySelectorAll<HTMLElement>("a[href], button, [tabindex='0']")];
  const last = stops.at(-1);
  const leavingForward = !event.shiftKey && (document.activeElement === last || stops.length === 0);
  const leavingBack = event.shiftKey && (document.activeElement === card || document.activeElement === stops[0]);
  if (leavingForward || leavingBack) {
    event.preventDefault();
    close(true);
  }
}

interface HoverCardProps {
  /** Inline trigger content; it is rendered inside a <button>, so keep it phrasing content. */
  trigger: ReactNode;
  triggerClassName: string;
  /** Card body; put `id={titleId}` on the element that names the card (aria-labelledby). */
  children: (titleId: string) => ReactNode;
}

/**
 * An interactive popover card for inline triggers. Unlike Tooltip it may hold links, and it is
 * portalled with fixed positioning so a scroll or `overflow-hidden` ancestor (chat bubbles) never
 * clips it.
 */
export function HoverCard({ trigger, triggerClassName, children }: HoverCardProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const refs = useMemo<Refs>(() => ({ trigger: triggerRef, card: cardRef }), []);
  const state = useHoverCardState(refs);
  const position = usePlacement(state.open, triggerRef, cardRef);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={state.open}
        aria-haspopup="dialog"
        aria-controls={state.open ? id : undefined}
        onMouseEnter={state.enter}
        onMouseLeave={state.leave}
        onClick={(event) => state.activate(event.detail === 0)}
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
            aria-labelledby={titleId}
            tabIndex={-1}
            onMouseEnter={state.enter}
            onMouseLeave={state.leave}
            onKeyDown={(event) => trapExit(event, state.close)}
            style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, width: CARD_WIDTH }}
            className="fixed z-50 rounded-lg border border-line bg-neutral-900 p-3 text-left text-sm font-normal normal-case not-italic tracking-normal text-neutral-200 shadow-xl shadow-black/40 outline-none"
          >
            {children(titleId)}
          </div>,
          document.body,
        )}
    </>
  );
}
