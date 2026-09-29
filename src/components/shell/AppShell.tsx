"use client";

import { useEffect, useRef, type RefObject } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TopBar } from "../TopBar";
import { Onboarding } from "../Onboarding";
import { LeagueBanner } from "../LeagueBanner";
import { LeagueSelect } from "../LeagueSelect";
import { MarketStatus } from "../MarketStatus";
import { AlertsProvider } from "../alerts/AlertsContext";
import { AlertsTab } from "../alerts/AlertsTab";
import { CoachPanel } from "../coach/CoachPanel";
import { TabNav } from "./TabNav";
import { CredBanner } from "./CredBanner";
import { useTabRoute } from "./useTabRoute";
import { tabRouteHref, type TabId, type TabRoute } from "./tabRegistry";
import { ExchangeTab } from "./tabs/ExchangeTab";
import { MarketTab } from "./tabs/MarketTab";
import { FarmTab } from "./tabs/FarmTab";
import { CraftTab } from "./tabs/CraftTab";
import { WealthTab } from "./tabs/WealthTab";
import { RegexTab } from "./tabs/RegexTab";
import { PatchesTab } from "./tabs/PatchesTab";
import { LearnTab } from "./tabs/LearnTab";
import { SettingsTab } from "./tabs/SettingsTab";

/**
 * Publishes the sticky header's height as --shell-h so sticky table heads and scroll targets sit
 * just under it instead of hiding their first row behind it (the header height changes when its
 * rows wrap at narrow widths).
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

/**
 * A mistyped or outdated link must not silently show another page: warn, then replace (not push)
 * with the canonical URL so Back skips the broken entry. Lives here only — one shell, one rewrite.
 */
function useCanonicalRoute(route: TabRoute, rejected: readonly string[]): void {
  const router = useRouter();
  const pathname = usePathname();
  const problem = rejected.join(", ");
  const href = tabRouteHref(route);
  useEffect(() => {
    if (problem === "") return;
    console.warn(`[tabs] ignoring unknown ${problem} — showing ${href}`);
    router.replace(`${pathname}${href}`, { scroll: false });
  }, [problem, href, pathname, router]);
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
    case "patches":
      return <PatchesTab />;
    case "learn":
      return <LearnTab />;
    case "alerts":
      return <AlertsTab />;
    case "settings":
      return <SettingsTab />;
  }
}

export function AppShell() {
  const { tab, tool, rejected } = useTabRoute();
  useCanonicalRoute({ tab, tool }, rejected);
  const headerRef = useRef<HTMLElement>(null);
  useShellHeightVar(headerRef);

  return (
    // one alert poll for the TopBar badge, its popover, the Alerts tab and the Exchange ticker
    <AlertsProvider>
      <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-4 p-6">
        <Onboarding />
        {/* stale-league warning — every price below is wrong if this fires */}
        <LeagueBanner />
        <CredBanner />
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
