"use client";

import { useEffect, useRef, type RefObject } from "react";
import { TopBar } from "../TopBar";
import { Onboarding } from "../Onboarding";
import { LeagueBanner } from "../LeagueBanner";
import { LeagueSelect } from "../LeagueSelect";
import { MarketStatus } from "../MarketStatus";
import { AlertsProvider } from "../alerts/AlertsContext";
import { AlertsTab } from "../alerts/AlertsTab";
import { CoachPanel } from "../coach/CoachPanel";
import { TabNav } from "./TabNav";
import { useTabRoute } from "./useTabRoute";
import type { TabId } from "./tabRegistry";
import { ExchangeTab } from "./tabs/ExchangeTab";
import { MarketTab } from "./tabs/MarketTab";
import { FarmTab } from "./tabs/FarmTab";
import { CraftTab } from "./tabs/CraftTab";
import { WealthTab } from "./tabs/WealthTab";
import { RegexTab } from "./tabs/RegexTab";
import { SettingsTab } from "./tabs/SettingsTab";

/**
 * Publishes the sticky header's height as --shell-h so sticky table heads and scroll targets sit
 * just under it instead of hiding their first row behind it (the header height changes with the
 * league banner and wrapping at narrow widths).
 */
function useShellHeightVar(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) throw new Error("AppShell: header ref not attached");
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--shell-h", `${el.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

/** Coach is kept mounted (below) so an open conversation survives tab switches. */
function ActiveTab({ tab }: { tab: Exclude<TabId, "coach"> }) {
  switch (tab) {
    case "exchange":
      return <ExchangeTab />;
    case "market":
      return <MarketTab />;
    case "farm":
      return <FarmTab />;
    case "craft":
      return <CraftTab />;
    case "wealth":
      return <WealthTab />;
    case "regex":
      return <RegexTab />;
    case "alerts":
      return <AlertsTab />;
    case "settings":
      return <SettingsTab />;
  }
}

export function AppShell() {
  const { tab } = useTabRoute();
  const headerRef = useRef<HTMLElement>(null);
  useShellHeightVar(headerRef);

  return (
    // one alert poll for the TopBar badge, its popover, the Alerts tab and the Exchange ticker
    <AlertsProvider>
      <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-4 p-6">
        <Onboarding />
        {/* stale-league warning — every price below is wrong if this fires */}
        <LeagueBanner />
        <header ref={headerRef} className="sticky top-0 z-40 -mx-6 -mt-6 border-b border-line bg-neutral-950/85 backdrop-blur">
          <div className="flex items-center justify-between px-6 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h1 className="text-xl font-bold">PoE2 Flip Assistant</h1>
              {/* league picker sits with the rates it controls — per account, switchable anytime */}
              <div className="flex flex-wrap items-center gap-1.5">
                <MarketStatus />
                <LeagueSelect />
              </div>
            </div>
            <TopBar />
          </div>
          <TabNav />
        </header>
        {tab !== "coach" && <ActiveTab tab={tab} />}
        <CoachPanel active={tab === "coach"} />
      </main>
    </AlertsProvider>
  );
}
