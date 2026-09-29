"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
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
import { SubTabBar, subTabId, subTabPanelId, useSubTabs } from "./SubTabBar";
import { CredBanner } from "./CredBanner";
import { NavModeProvider, useNavMode } from "./NavModeProvider";
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
 * A mistyped, outdated or mode-hidden link must not silently show another page: warn, then replace
 * (not push) with the canonical URL so Back skips the broken entry. The page itself already renders
 * the fallback route (useTabRoute resolves it), so there is no blank frame while the URL catches up.
 * Lives here only — one shell, one rewrite.
 */
function useCanonicalRoute(route: TabRoute, rejected: readonly string[], hidden: readonly string[]): void {
  const router = useRouter();
  const pathname = usePathname();
  const { mode } = useNavMode();
  const unknown = rejected.join(", ");
  const hiddenText = hidden.join(", ");
  const href = tabRouteHref(route);
  useEffect(() => {
    if (unknown === "" && hiddenText === "") return;
    if (unknown !== "") console.warn(`[tabs] ignoring unknown ${unknown} — showing ${href}`);
    if (hiddenText !== "") {
      console.warn(`[tabs] ${hiddenText} is hidden in ${mode} mode (Settings › Mode) — showing ${href}`);
    }
    router.replace(`${pathname}${href}`, { scroll: false });
  }, [unknown, hiddenText, mode, href, pathname, router]);
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

/** With a sub-tab bar on screen, the page is its tabpanel; without one it needs no wrapper. */
function ToolPanel({ children }: { children: ReactNode }) {
  const { tab, tool, tools } = useSubTabs();
  if (!tools || tool === null) return <>{children}</>;
  return (
    <div role="tabpanel" id={subTabPanelId(tab)} aria-labelledby={subTabId(tab, tool)} className="space-y-4">
      {children}
    </div>
  );
}

/** The dashboard. NavModeProvider sits outside everything else: the nav mode decides which tabs exist. */
export function AppShell() {
  return (
    <NavModeProvider>
      <ShellBody />
    </NavModeProvider>
  );
}

function ShellBody() {
  const { tab, tool, rejected, hidden } = useTabRoute();
  const { mode } = useNavMode();
  useCanonicalRoute({ tab, tool }, rejected, hidden);
  const headerRef = useRef<HTMLElement>(null);
  useShellHeightVar(headerRef);

  return (
    // one alert poll for the TopBar badge, its popover, the Alerts tab and the Exchange ticker
    <AlertsProvider>
      <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-4 p-6">
        <Onboarding />
        {/* stale-league warning — every price below is wrong if this fires */}
        <LeagueBanner />
        {/* POESESSID health: beginner mode hides the trade connection it would send them to */}
        {mode === "advanced" && <CredBanner />}
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
          <SubTabBar />
        </header>
        {tab !== "coach" && (
          <ToolPanel>
            <ActiveTab tab={tab} />
          </ToolPanel>
        )}
        <CoachPanel active={tab === "coach"} />
      </main>
    </AlertsProvider>
  );
}
