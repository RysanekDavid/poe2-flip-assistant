"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseModeRoute } from "../../lib/navMode";
import { tabRouteHref, type TabId, type TabRoute } from "./tabRegistry";
import { useNavMode } from "./NavModeProvider";

export interface TabRouteApi extends TabRoute {
  /** URL params that did not parse (e.g. "tab=bogus"); AppShell alone warns and rewrites them. */
  rejected: readonly string[];
  /** URL params hidden in the user's nav mode (e.g. "tab=exchange" for a beginner); AppShell redirects. */
  hidden: readonly string[];
  /** Navigate to a tab (and optionally one of its tools). Pushes history so Back returns here. */
  go: (tab: TabId, tool?: string) => void;
}

/**
 * The active tab lives in the URL (?tab=&tool=) so tabs deep-link and browser Back works. The route
 * returned is what the user's nav mode renders: a hidden tab or tool resolves to the mode's
 * fallback here, so every consumer (nav, chips, tab bodies) agrees on what is on screen.
 * Must render under <Suspense> (useSearchParams) and under NavModeProvider.
 */
export function useTabRoute(): TabRouteApi {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { mode } = useNavMode();
  const rawTab = params.get("tab");
  const rawTool = params.get("tool");
  const parsed = useMemo(() => parseModeRoute(mode, rawTab, rawTool), [mode, rawTab, rawTool]);

  const go = useCallback(
    (tab: TabId, tool?: string) => {
      const next = parseModeRoute(mode, tab, tool ?? null);
      if (next.rejected.length > 0) throw new Error(`go(): unknown route ${next.rejected.join(", ")}`);
      const href = tabRouteHref(next);
      // A link inside a visible page may still point at a hidden one; land on the fallback, loudly.
      if (next.hidden.length > 0) console.warn(`[tabs] ${next.hidden.join(", ")} is hidden in ${mode} mode — opening ${href}`);
      // Re-selecting the open tab must not stack duplicate Back entries. Compared against the live
      // location (not this render's params) so a long-lived caller such as the tour never goes stale.
      if (window.location.search === href) return;
      router.push(`${pathname}${href}`, { scroll: false });
    },
    [mode, pathname, router],
  );

  return { tab: parsed.tab, tool: parsed.tool, rejected: parsed.rejected, hidden: parsed.hidden, go };
}
