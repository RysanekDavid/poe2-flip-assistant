"use client";

import { useState } from "react";
import { MousePointerClick } from "lucide-react";
import { AlertTicker } from "../../AlertTicker";
import { DiscoverTable } from "../../DiscoverTable";
import { TopFlipsLegend } from "../../DiscoverColumns";
import { SpreadTable } from "../../SpreadTable";
import { FlipDetailCard } from "../../flip/FlipDetailCard";
import type { FlipSelection } from "../../flip/flipTypes";
import { PriceChart } from "../../PriceChart";
import { PositionsPanel } from "../../PositionsPanel";
import { FlipLog } from "../../FlipLog";
import { EmptyState } from "../../ui/EmptyState";
import { PageHeader } from "../../ui/PageHeader";

/** In-game Currency Exchange: find a flip, plan it, track the position, log the result. */
export function ExchangeTab() {
  const [selected, setSelected] = useState<FlipSelection | null>(null);

  // The plan opens below Top Flips; bring it into view without jumping when it already is.
  const selectItem = (s: FlipSelection) => {
    setSelected(s);
    requestAnimationFrame(() =>
      document.getElementById("flip-plan")?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  return (
    <>
      <PageHeader
        title="Currency Exchange"
        purpose="Flips on Ange's exchange right now — click a row for its flip plan and price chart."
        legend={<TopFlipsLegend />}
      />
      <AlertTicker />
      <DiscoverTable selectedId={selected?.row.itemId} onSelect={selectItem} />
      <div id="flip-plan" className="scroll-mt-[var(--shell-h,0px)]">
        {selected ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FlipDetailCard selection={selected} />
            <PriceChart itemId={selected.row.itemId} itemName={selected.row.item} exPerDiv={selected.rates?.exaltPerDivine ?? null} />
          </div>
        ) : (
          <EmptyState
            icon={<MousePointerClick className="h-5 w-5" />}
            title="Flip plan"
            sentence="Click a row in Top Flips or the watchlist — the plan, your Ange prices and the price chart open here."
          />
        )}
      </div>
      <SpreadTable selectedId={selected?.row.itemId} onSelect={selectItem} />
      {/* BUY now → SELL later loop: open positions mark-to-market until you close them */}
      <PositionsPanel />
      {/* logged from the flip plan's "log flip" — this is the read-only ledger */}
      <FlipLog />
    </>
  );
}
