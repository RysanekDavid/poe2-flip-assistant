"use client";

import { useState } from "react";
import { TopBar } from "../components/TopBar";
import { BalancePanel } from "../components/BalancePanel";
import { DiscoverTable } from "../components/DiscoverTable";
import { SpreadTable } from "../components/SpreadTable";
import { CraftPlanner } from "../components/CraftPlanner";
import { DemandBoard } from "../components/DemandBoard";
import { HuntPanel } from "../components/HuntPanel";
import { AutoSnipeBar } from "../components/AutoSnipeBar";
import { SnipeTargets } from "../components/SnipeTargets";
import { FlipDetailCard } from "../components/FlipDetailCard";
import { AlertTicker } from "../components/AlertTicker";
import { FarmAdvisor } from "../components/FarmAdvisor";
import { PositionsPanel } from "../components/PositionsPanel";
import { FlipLog } from "../components/FlipLog";
import { PriceChart } from "../components/PriceChart";
import { Onboarding } from "../components/Onboarding";
import { MarketStatus } from "../components/MarketStatus";
import { SettingsPanel } from "../components/SettingsPanel";
import { EmptySection } from "../components/ui/EmptySection";

const TABS = [
  { id: "exchange", label: "Currency Exchange", hint: "in-game Ange currency flip" },
  { id: "market", label: "Web Market", hint: "trade site · uniques · snipe" },
  { id: "craft", label: "Craft", hint: "base → mods → resell" },
  { id: "wealth", label: "Wealth", hint: "net worth · realized profit" },
  { id: "settings", label: "Settings", hint: "your trade2 connection (POESESSID)" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function DashboardPage() {
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = useState<TabId>("exchange");

  // selecting from either table scrolls the shared detail+chart block into view
  const selectItem = (item: { id: string; name: string }) => {
    setSelected(item);
    requestAnimationFrame(() =>
      document.getElementById("flip-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  return (
    <main className="mx-auto max-w-screen-2xl space-y-4 p-6">
      <Onboarding />
      <header className="sticky top-0 z-40 -mx-6 -mt-6 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">PoE2 Flip Assistant</h1>
            <MarketStatus />
          </div>
          <TopBar />
        </div>

        {/* domain tabs — keep the in-game currency flip and the web-trade market separate */}
        <nav className="flex gap-1 px-6" data-tour="tabs">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                title={t.hint}
                className={`relative -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-sky-500 text-neutral-100"
                    : "border-transparent text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      {tab === "exchange" && (
        <>
          {/* live alert strip — fires browser notifications when a watched spread/trend clears threshold */}
          <AlertTicker />
          {/* "what to farm now" — ranks in-game activities by how hard their drop basket is pumping */}
          <FarmAdvisor />
          {/* whole market — search + watch/unwatch + "top flips only"; replaces the old watchlist editor */}
          <DiscoverTable selectedId={selected?.id} onSelect={selectItem} />
          <SpreadTable selectedId={selected?.id} onSelect={selectItem} />
          {selected ? (
            // compact flip plan beside its price chart
            <div id="flip-detail" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FlipDetailCard selectedId={selected.id} />
              <PriceChart itemId={selected.id} itemName={selected.name} />
            </div>
          ) : (
            <EmptySection
              title="Flip Plan"
              hint="click a row in Top Flips or the Watchlist — full plan, market compare and price chart open here"
            />
          )}
          {/* BUY now → SELL later loop: open positions mark-to-market until you close them */}
          <PositionsPanel />
          {/* log it straight from the Flip Plan's "log flip" — this is the read-only ledger */}
          <FlipLog />
        </>
      )}

      {tab === "market" && (
        <>
          <DemandBoard />
          <AutoSnipeBar />
          <SnipeTargets />
          <HuntPanel />
        </>
      )}

      {tab === "craft" && <CraftPlanner />}

      {tab === "wealth" && <BalancePanel />}

      {tab === "settings" && <SettingsPanel />}
    </main>
  );
}
