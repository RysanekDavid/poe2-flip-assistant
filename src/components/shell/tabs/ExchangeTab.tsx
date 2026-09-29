"use client";

import { useState } from "react";
import { MousePointerClick } from "lucide-react";
import { AlertTicker } from "../../AlertTicker";
import { DiscoverTable } from "../../DiscoverTable";
import { SpreadTable } from "../../SpreadTable";
import { FlipDetailCard } from "../../FlipDetailCard";
import { PriceChart } from "../../PriceChart";
import { PositionsPanel } from "../../PositionsPanel";
import { FlipLog } from "../../FlipLog";
import { EmptyState } from "../../ui/EmptyState";
import { PageHeader } from "../../ui/PageHeader";

interface Selected {
  id: string;
  name: string;
}

/** In-game Currency Exchange: find a flip, plan it, track the position, log the result. */
export function ExchangeTab() {
  const [selected, setSelected] = useState<Selected | null>(null);

  // Selecting from either table scrolls the shared plan + chart block into view.
  const selectItem = (item: Selected) => {
    setSelected(item);
    requestAnimationFrame(() =>
      document.getElementById("flip-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  return (
    <>
      <PageHeader
        title="Currency Exchange"
        purpose="Flips on Ange's exchange right now — click a row for the flip plan and price chart."
      />
      {/* live alert strip — fires browser notifications when a watched spread/trend clears threshold */}
      <AlertTicker />
      <DiscoverTable selectedId={selected?.id} onSelect={selectItem} />
      <SpreadTable selectedId={selected?.id} onSelect={selectItem} />
      {selected ? (
        <div id="flip-detail" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FlipDetailCard selectedId={selected.id} />
          <PriceChart itemId={selected.id} itemName={selected.name} />
        </div>
      ) : (
        <EmptyState
          icon={<MousePointerClick className="h-5 w-5" />}
          title="Flip Plan"
          sentence="Click a row in Top Flips or the Watchlist — the plan, market compare and price chart open here."
        />
      )}
      {/* BUY now → SELL later loop: open positions mark-to-market until you close them */}
      <PositionsPanel />
      {/* logged from the Flip Plan's "log flip" — this is the read-only ledger */}
      <FlipLog />
    </>
  );
}
