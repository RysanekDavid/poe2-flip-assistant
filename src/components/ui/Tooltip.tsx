"use client";

import { cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from "react";
import { Info } from "lucide-react";

type Side = "top" | "bottom";
/** Horizontal anchor: "end" keeps a bubble from a right-edge trigger inside the viewport. */
export type TooltipAlign = "start" | "center" | "end";

interface TooltipProps {
  tip: ReactNode;
  children: ReactNode;
  side?: Side;
  align?: TooltipAlign;
}

const SIDE_CLASS: Record<Side, string> = {
  top: "bottom-full mb-1.5",
  bottom: "top-full mt-1.5",
};

const ALIGN_CLASS: Record<TooltipAlign, string> = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

type DescribedProps = { "aria-describedby"?: string };

const FOCUSABLE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);

/**
 * Only a focusable HOST element takes aria-describedby directly. Components and Fragments are
 * opaque (props may never reach a focusable node), so they get the focusable wrapper instead.
 */
function isFocusableHost(node: ReactNode): node is ReactElement<DescribedProps> {
  if (!isValidElement<{ tabIndex?: unknown }>(node) || typeof node.type !== "string") return false;
  return FOCUSABLE_TAGS.has(node.type) || typeof node.props.tabIndex === "number";
}

/**
 * Hover + keyboard-focus tooltip without a positioning library. The bubble stays in the DOM but is
 * display:none while closed — a merely invisible bubble still widens the page near the right edge
 * — and aria-describedby keeps resolving, since a description may reference hidden content. A
 * focusable host child (<button>, <a>, tabIndex set) receives aria-describedby itself; anything else
 * gets a focusable wrapper so keyboard users can still reach the tip. Pass host elements to avoid a
 * double tab stop.
 */
export function Tooltip({ tip, children, side = "top", align = "center" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = isFocusableHost(children) ? (
    cloneElement(children, { "aria-describedby": id })
  ) : (
    <span tabIndex={0} aria-describedby={id} className="cursor-help">
      {children}
    </span>
  );
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        // an open tip takes this Escape (a Drawer around it checks defaultPrevented); a closed one passes it on
        if (e.key === "Escape" && open) {
          e.preventDefault();
          setOpen(false);
        }
      }}
    >
      {trigger}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute z-50 w-max max-w-xs whitespace-normal rounded-md border border-line bg-neutral-900 px-2 py-1 text-left text-xs font-normal normal-case tracking-normal text-neutral-200 shadow-lg ${SIDE_CLASS[side]} ${ALIGN_CLASS[align]} ${open ? "block" : "hidden"}`}
      >
        {tip}
      </span>
    </span>
  );
}

/** The ⓘ affordance used by table headers and page legends: an icon-only, focusable tooltip trigger. */
export function InfoTip({ tip, label = "More info", side, align }: { tip: ReactNode; label?: string; side?: Side; align?: TooltipAlign }) {
  return (
    <Tooltip tip={tip} side={side} align={align}>
      <button type="button" aria-label={label} className="inline-flex rounded text-neutral-500 hover:text-neutral-300">
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Tooltip>
  );
}
