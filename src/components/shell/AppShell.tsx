"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Onboarding } from "../Onboarding";
import { LeagueBanner } from "../LeagueBanner";
import { AlertsProvider } from "../alerts/AlertsContext";
import { AlertsTab } from "../alerts/AlertsTab";
import { CoachPanel } from "../coach/CoachPanel";
import { ShellHeader } from "./ShellHeader";
import { subTabId, subTabPanelId, useSubTabs } from "./SubTabBar";
import { CredBanner } from "./CredBanner";
import { NavModeProvider, useNavMode } from "./NavModeProvider";
import { useTabRoute } from "./useTabRoute";
import { tabRouteHref, type TabId, type TabRoute } from "./tabRegistry";
import { FlipsTab } from "./tabs/FlipsTab";
import { TradeTab } from "./tabs/TradeTab";
import { FarmTab } from "./tabs/FarmTab";
import { CraftTab } from "./tabs/CraftTab";
import { WealthTab } from "./tabs/WealthTab";
import { RegexTab } from "./tabs/RegexTab";
import { PatchesTab } from "./tabs/PatchesTab";
import { LearnTab } from "./tabs/LearnTab";
import { SettingsTab } from "./tabs/SettingsTab";

/**
 * A mistyped, outdated or mode-hidden link must not silently show another page: warn, then replace
 * (not push) with the canonical URL so Back skips the broken entry. The page itself already renders
 * the fallback route (useTabRoute resolves it), so there is no blank frame while the URL catches up.
 * Lives here only — one shell, one rewrite.
 */
function useCanonicalRoute(route: TabRoute, rejected: readonly string[], hidden: readonly string[], renamed: readonly string[]): void {
  const router = useRouter();
  const pathname = usePathname();
  const { mode } = useNavMode();
  const unknown = rejected.join(", ");
  const hiddenText = hidden.join(", ");
  // an old link to a renamed tab or tool is expected, not an error: rewrite it without a warning
  const renamedText = renamed.join(", ");
  const href = tabRouteHref(route);
  useEffect(() => {
    if (unknown === "" && hiddenText === "" && renamedText === "") return;
    if (unknown !== "") console.warn(`[tabs] ignoring unknown ${unknown} — showing ${href}`);
    if (hiddenText !== "") {
      console.warn(`[tabs] ${hiddenText} is hidden in ${mode} mode (Settings › Mode) — showing ${href}`);
    }
    router.replace(`${pathname}${href}`, { scroll: false });
  }, [unknown, hiddenText, renamedText, mode, href, pathname, router]);
}

/** Coach is kept mounted (below) so an open conversation survives tab switches. */
function ActiveTab({ tab }: { tab: Exclude<TabId, "coach"> }) {
  switch (tab) {
    case "flips":
      return <FlipsTab />;
    case "trade":
      return <TradeTab />;
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
  const { tab, tool, toolShown } = useSubTabs();
  // the panel is labelled by its sub-tab, so it needs one on screen
  if (!toolShown || tool === null) return <>{children}</>;
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
  const { tab, tool, rejected, hidden, renamed } = useTabRoute();
  const { mode } = useNavMode();
  useCanonicalRoute({ tab, tool }, rejected, hidden, renamed);

  return (
    // one alert poll for the TopBar badge, its popover, the Alerts tab and the Flips ticker
    <AlertsProvider>
      <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-4 p-6">
        {/* stale-league warning — every price below is wrong if this fires */}
        <LeagueBanner />
        {/* POESESSID health: beginner mode hides the trade connection it would send them to */}
        {mode === "advanced" && <CredBanner />}
        <ShellHeader />
        {tab !== "coach" && (
          <ToolPanel>
            <ActiveTab tab={tab} />
          </ToolPanel>
        )}
        <CoachPanel active={tab === "coach"} />
      </main>
      {/* outside <main>: its welcome is a fixed overlay, and main's space-y would give it (or, first, the header) a stray margin */}
      <Onboarding />
    </AlertsProvider>
  );
}
