"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { StrategyView } from "../../../lib/strategiesContract";
import { ItemArt } from "../../ui/ItemArt";
import { DurabilityTip } from "./Durability";
import { StrategyMeters } from "./StrategyBits";

/** A button inside the clickable card: opens the drawer once, not again via the card's own click. */
export function OpenButton({ id, onOpen, className, children }: { id: string; onOpen: (id: string) => void; className: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(id);
      }}
      className={className}
    >
      {children}
    </button>
  );
}

function ArtHeader({ art, label, headline }: { art: string | null; label: string; headline: ReactNode }) {
  return (
    <div className="relative h-20 overflow-hidden bg-neutral-900">
      {art && <img src={art} alt="" aria-hidden className="absolute right-20 top-1/2 h-28 w-28 -translate-y-1/2 object-contain opacity-50" />}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-neutral-950/10 via-neutral-950/30 to-neutral-950" />
      <div className="relative flex items-start justify-between gap-2 p-3">
        <span className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full border border-line bg-neutral-950/80 pl-1 pr-2.5 text-xs text-neutral-200">
          <ItemArt src={art} size={5} />
          <span className="truncate">{label}</span>
        </span>
        {headline}
      </div>
    </div>
  );
}

interface CardFrameProps {
  id: string;
  title: string;
  art: string | null;
  /** Header chip text: the mechanics, or what kind of method it is. */
  label: string;
  /** Right side of the header: the farm trend, or a method's live EV. */
  headline: ReactNode;
  meters: Pick<StrategyView, "budget" | "ratings" | "durability">;
  /** Left side of the footer: what to bring, how it sells. */
  footer: ReactNode;
  /** Extra footer actions before the open button (e.g. the Regex link). */
  actions?: ReactNode;
  cta: string;
  onOpen: (id: string) => void;
  children: ReactNode;
}

/** The one strategy card every kind shares: art header, title, a kind-specific body, the three rating bars and a footer. */
export function CardFrame({ id, title, art, label, headline, meters, footer, actions, cta, onOpen, children }: CardFrameProps) {
  return (
    <article
      aria-label={title}
      onClick={() => onOpen(id)}
      className="flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-line bg-neutral-950 transition-colors hover:border-neutral-500"
    >
      <ArtHeader art={art} label={label} headline={headline} />
      <div className="-mt-3 flex flex-1 flex-col gap-3 px-3 pb-3">
        <h3 className="relative text-base font-semibold leading-snug text-neutral-100">
          <OpenButton id={id} onOpen={onOpen} className="text-left hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
            {title}
          </OpenButton>{" "}
          <span onClick={(e) => e.stopPropagation()}>
            <DurabilityTip durability={meters.durability} />
          </span>
        </h3>
        {children}
        <div onClick={(e) => e.stopPropagation()}>
          <StrategyMeters strategy={meters} />
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
          {footer}
          <span className="flex items-center gap-1.5">
            {actions}
            <OpenButton id={id} onOpen={onOpen} className="inline-flex h-7 items-center gap-0.5 rounded-md px-2 text-xs font-semibold text-neutral-100 hover:bg-neutral-800">
              {cta} <ChevronRight aria-hidden className="h-3.5 w-3.5" />
            </OpenButton>
          </span>
        </div>
      </div>
    </article>
  );
}
