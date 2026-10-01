"use client";

import waystoneArt from "../../../assets/items/waystone.png";
import type { StrategyView, YieldView } from "../../../lib/strategiesContract";
import { fmtDivOrEx } from "../../../lib/format";
import { ItemArt } from "../../ui/ItemArt";
import { CardFrame } from "./CardFrame";
import { StatusBadge, TrendPill, WaystoneRegexLink } from "./StrategyBits";
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

interface CardProps {
  strategy: StrategyView;
  exPerDiv: number | null;
  onOpen: (id: string) => void;
}

/** One farm strategy at a glance: art, 7-day trend of its drops, two priced drops, three bars, its setup. */
export function StrategyCard({ strategy, exPerDiv, onOpen }: CardProps) {
  const { shown, more } = topDrops(strategy.yields);
  return (
    <CardFrame
      id={strategy.id}
      title={strategy.title}
      art={strategyArt(strategy)}
      label={strategy.mechanics.map((m) => MECHANIC_LABEL[m]).join(" · ")}
      headline={<TrendPill trend={strategy.trend} />}
      meters={strategy}
      footer={<SetupStrip strategy={strategy} />}
      actions={<WaystoneRegexLink waystone={strategy.waystone} compact />}
      cta="How to run it"
      onOpen={onOpen}
    >
      <div className="flex flex-wrap gap-1.5" aria-label="Main drops">
        {shown.map((item) => (
          <DropChip key={item.ref.id} item={item} exPerDiv={exPerDiv} />
        ))}
        {more > 0 && <span className="inline-flex h-7 items-center rounded-md border border-line px-2 text-xs text-neutral-400" title="more drops in the detail">+{more}</span>}
      </div>
    </CardFrame>
  );
}
