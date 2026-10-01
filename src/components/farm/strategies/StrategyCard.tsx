"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import waystoneArt from "../../../assets/items/waystone.png";
import type { StrategyView, YieldView } from "../../../lib/strategiesContract";
import { fmtDivOrEx } from "../../../lib/format";
import { ItemArt } from "../../ui/ItemArt";
import { StatusBadge, StrategyMeters, TrendPill, WaystoneRegexLink } from "./StrategyBits";
import { strategyArt } from "./strategyArt";
import { MECHANIC_LABEL, WAYSTONE_LABEL } from "./strategiesView";
import { topDrops } from "./strategyCards";
import { tabletArtSrc } from "./tabletArtImages";

const ROLE_WORD: Record<YieldView["role"], string> = { primary: "main drop", secondary: "side drop", lottery: "lottery" };

/** A payout chip: art, name and today's price; an item off the exchange shows no price, never 0. */
function DropChip({ item, exPerDiv }: { item: YieldView; exPerDiv: number | null }) {
  const price = item.price;
  const title = price ? `${ROLE_WORD[item.role]} · poe.ninja exchange price` : `${ROLE_WORD[item.role]} · not on the currency exchange`;
  return (
    <span title={title} className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-line bg-neutral-900/80 pl-1 pr-2 text-xs text-neutral-200">
      <ItemArt src={item.icon_url} size={5} />
      <span className="truncate">{item.ref.name}</span>
      {price && (
        <span className="shrink-0 font-semibold tabular-nums text-neutral-100">
          {fmtDivOrEx(price.div, exPerDiv ?? 0)}
          <span className="sr-only"> (price)</span>
        </span>
      )}
    </span>
  );
}

function ArtHeader({ strategy }: { strategy: StrategyView }) {
  const art = strategyArt(strategy);
  return (
    <div className="relative h-20 overflow-hidden bg-neutral-900">
      {art && <img src={art} alt="" aria-hidden className="absolute right-20 top-1/2 h-28 w-28 -translate-y-1/2 object-contain opacity-50" />}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-neutral-950/10 via-neutral-950/30 to-neutral-950" />
      <div className="relative flex items-start justify-between gap-2 p-3">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-neutral-950/80 pl-1 pr-2.5 text-xs text-neutral-200">
          <ItemArt src={art} size={5} />
          {strategy.mechanics.map((m) => MECHANIC_LABEL[m]).join(" · ")}
        </span>
        <TrendPill trend={strategy.trend} />
      </div>
    </div>
  );
}

/** Tablets ×N and the waystone: what to bring, as art; the details live in the drawer. */
function SetupStrip({ strategy }: { strategy: StrategyView }) {
  const prefer = strategy.waystone.prefer.map((t) => WAYSTONE_LABEL[t]).join(" → ");
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-neutral-300">
      {strategy.tablets.map((tablet, i) => (
        <span key={`${i}|${tablet.type}|${tablet.unique ?? ""}`} title={tablet.unique ? `${tablet.unique} (${tablet.type})` : tablet.type} className="inline-flex items-center gap-0.5">
          <ItemArt src={tabletArtSrc(tablet)} size={5} alt={tablet.unique ?? tablet.type} />
          {tablet.count !== null && tablet.count > 1 && <span className="tabular-nums">×{tablet.count}</span>}
        </span>
      ))}
      {prefer !== "" && (
        <span title={`Waystone: roll for ${prefer}`} className="inline-flex">
          <ItemArt src={waystoneArt.src} size={5} alt={`Waystone: ${prefer}`} />
        </span>
      )}
      <StatusBadge strategy={strategy} />
    </span>
  );
}

/** A button inside the clickable card: opens the drawer once, not again via the card's own click. */
function OpenButton({ id, onOpen, className, children }: { id: string; onOpen: (id: string) => void; className: string; children: ReactNode }) {
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

interface CardProps {
  strategy: StrategyView;
  exPerDiv: number | null;
  onOpen: (id: string) => void;
}

/** One strategy at a glance: art, 7-day trend of its drops, two priced drops, three bars, its setup. */
export function StrategyCard({ strategy, exPerDiv, onOpen }: CardProps) {
  const { shown, more } = topDrops(strategy.yields);
  return (
    <article
      aria-label={strategy.title}
      onClick={() => onOpen(strategy.id)}
      className="flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-line bg-neutral-950 transition-colors hover:border-neutral-500"
    >
      <ArtHeader strategy={strategy} />
      <div className="-mt-3 flex flex-1 flex-col gap-3 px-3 pb-3">
        <h3 className="relative text-base font-semibold leading-snug text-neutral-100">
          <OpenButton id={strategy.id} onOpen={onOpen} className="text-left hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
            {strategy.title}
          </OpenButton>
        </h3>
        <div className="flex flex-wrap gap-1.5" aria-label="Main drops">
          {shown.map((item) => (
            <DropChip key={item.ref.id} item={item} exPerDiv={exPerDiv} />
          ))}
          {more > 0 && <span className="inline-flex h-7 items-center rounded-md border border-line px-2 text-xs text-neutral-400" title="more drops in the detail">+{more}</span>}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <StrategyMeters strategy={strategy} />
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
          <SetupStrip strategy={strategy} />
          <span className="flex items-center gap-1.5">
            <WaystoneRegexLink waystone={strategy.waystone} compact />
            <OpenButton id={strategy.id} onOpen={onOpen} className="inline-flex h-7 items-center gap-0.5 rounded-md px-2 text-xs font-semibold text-neutral-100 hover:bg-neutral-800">
              How to run it <ChevronRight aria-hidden className="h-3.5 w-3.5" />
            </OpenButton>
          </span>
        </div>
      </div>
    </article>
  );
}
