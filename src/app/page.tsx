"use client";

import { useState } from "react";
import Image from "next/image";
import iconExchange from "../assets/Currency_exchange.png";
import iconMarket from "../assets/Web_market.png";
import iconCraft from "../assets/Craft.png";
import iconWealth from "../assets/Wealth.png";
import iconCoach from "../assets/Coach.png";
import iconSettings from "../assets/settings.png";
import { TopBar } from "../components/TopBar";
import { BalancePanel } from "../components/BalancePanel";
import { DiscoverTable } from "../components/DiscoverTable";
import { SpreadTable } from "../components/SpreadTable";
import { CraftMarginPanel } from "../components/CraftMarginPanel";
import { CraftTopPicks } from "../components/CraftTopPicks";
import { CraftPnlPanel } from "../components/CraftPnlPanel";
import { MaterialsPanel } from "../components/MaterialsPanel";
import { CraftMarginsProvider } from "../components/craft/CraftMarginsContext";
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
import { LeagueBanner } from "../components/LeagueBanner";
import { LeagueSelect } from "../components/LeagueSelect";
import { MarketStatus } from "../components/MarketStatus";
import { SettingsPanel } from "../components/SettingsPanel";
import { CoachPanel } from "../components/coach/CoachPanel";
import { EmptySection } from "../components/ui/EmptySection";

const TABS = [
  { id: "exchange", label: "Currency Exchange", hint: "in-game Ange currency flip", icon: iconExchange },
  { id: "market", label: "Web Market", hint: "trade site · uniques · snipe", icon: iconMarket },
  { id: "craft", label: "Craft", hint: "recipes · sessions · P&L", icon: iconCraft },
  { id: "wealth", label: "Wealth", hint: "net worth · realized profit", icon: iconWealth },
  { id: "settings", label: "Settings", hint: "your trade2 connection (POESESSID)", icon: iconSettings },
] as const;
type TabId = (typeof TABS)[number]["id"] | "coach";

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
      {/* stale-league warning — every price below is wrong if this fires */}
      <LeagueBanner />
      <header className="sticky top-0 z-40 -mx-6 -mt-6 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">PoE2 Flip Assistant</h1>
            {/* league picker sits with the rates it controls — per account, switchable anytime */}
            <div className="flex flex-wrap items-center gap-1.5">
              <MarketStatus />
              <LeagueSelect />
            </div>
          </div>
          <TopBar />
        </div>

        {/* domain tabs — keep the in-game currency flip and the web-trade market separate */}
        <nav className="flex items-end gap-1 px-6" data-tour="tabs">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                title={t.hint}
                className={`relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-neutral-200 text-neutral-100"
                    : "border-transparent text-neutral-500 hover:text-neutral-300"
                }`}
              >
                <Image
                  src={t.icon}
                  alt=""
                  className={`h-9 w-9 object-contain transition-opacity ${active ? "opacity-100" : "opacity-60"}`}
                  priority={t.id === "exchange"}
                />
                {t.label}
              </button>
            );
          })}
          <button
            onClick={() => setTab("coach")}
            title="market · craft · ověřené zdroje"
            className={`mb-1 ml-auto flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === "coach"
                ? "border-amber-500/35 bg-amber-950/25 text-amber-100"
                : "border-neutral-800 bg-neutral-900/45 text-neutral-400 hover:border-amber-500/25 hover:text-neutral-200"
            }`}
          >
            <Image
              src={iconCoach}
              alt=""
              className={`h-9 w-9 object-contain transition-opacity ${tab === "coach" ? "opacity-100" : "opacity-65"}`}
            />
            Coach
          </button>
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

      {tab === "craft" && (
        // one shared /api/craft/margins poller for top picks + the four domain windows
        <CraftMarginsProvider>
          {/* what pays TODAY, across all domains */}
          <CraftTopPicks />
          {/* one crafting window per item domain — the procedures differ per class */}
          <CraftMarginPanel domain="jewel" showRefresh />
          <CraftMarginPanel domain="weapon" />
          <CraftMarginPanel domain="jewellery" />
          <CraftMarginPanel domain="armour" />
          {/* real attempts logged against the model (hit rate + net) */}
          <CraftPnlPanel />
          {/* live prices for the recipe inputs */}
          <MaterialsPanel />
        </CraftMarginsProvider>
      )}

      {tab === "wealth" && <BalancePanel />}

      {/* Keep the chat mounted while switching tabs so the active conversation is not lost. */}
      <CoachPanel active={tab === "coach"} />

      {tab === "settings" && <SettingsPanel />}
    </main>
  );
}
