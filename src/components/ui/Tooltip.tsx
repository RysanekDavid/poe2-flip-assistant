"use client";

import { cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from "react";
import { Info } from "lucide-react";

type Side = "top" | "bottom";

interface TooltipProps {
  tip: ReactNode;
  children: ReactNode;
  side?: Side;
}

const SIDE_CLASS: Record<Side, string> = {
  top: "bottom-full mb-1.5",
  bottom: "top-full mt-1.5",
};

type DescribedProps = { "aria-describedby"?: string };

const FOCUSABLE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);

/** Focusable host elements and components (Button, Toggle…) take aria-describedby directly. */
function isFocusableElement(node: ReactNode): node is ReactElement<DescribedProps> {
  if (!isValidElement(node)) return false;
  return typeof node.type !== "string" || FOCUSABLE_TAGS.has(node.type);
}

/**
 * Hover + keyboard-focus tooltip without a positioning library. The bubble stays in the DOM (only
 * visually hidden) so aria-describedby always resolves for screen readers. A focusable child (or a
 * component, assumed to render one) receives aria-describedby itself; plain text or spans get a
 * focusable wrapper so keyboard users can still reach the tip.
 */
export function Tooltip({ tip, children, side = "top" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = isFocusableElement(children) ? (
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
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {trigger}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-xs -translate-x-1/2 whitespace-normal rounded-md border border-line bg-neutral-900 px-2 py-1 text-left text-xs font-normal normal-case tracking-normal text-neutral-200 shadow-lg ${SIDE_CLASS[side]} ${open ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        {tip}
      </span>
    </span>
  );
}

/** The ⓘ affordance used by table headers and page legends: an icon-only, focusable tooltip trigger. */
export function InfoTip({ tip, label = "More info", side }: { tip: ReactNode; label?: string; side?: Side }) {
  return (
    <Tooltip tip={tip} side={side}>
      <button type="button" aria-label={label} className="inline-flex rounded text-neutral-500 hover:text-neutral-300">
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Tooltip>
  );
}
