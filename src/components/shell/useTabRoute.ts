"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseModeRoute } from "../../lib/navMode";
import { followRenames, redirectTool, tabRouteHref, type TabId, type TabRoute } from "./tabRegistry";
import { useNavMode } from "./NavModeProvider";

export interface TabRouteApi extends TabRoute {
  /** URL params that did not parse (e.g. "tab=bogus"); AppShell alone warns and rewrites them. */
  rejected: readonly string[];
  /** Rendered params outside the user's nav mode (e.g. "tab=flips" for a beginner); AppShell says where they live. */
  hidden: readonly string[];
  /** A renamed ?tab= or ?tool= that was followed to its new id (e.g. "tab=exchange"); AppShell rewrites the URL. */
  renamed: readonly string[];
  /** Navigate to a tab (and optionally one of its tools). Pushes history so Back returns here. */
  go: (tab: TabId, tool?: string) => void;
}

/**
 * The active tab lives in the URL (?tab=&tool=) so tabs deep-link and browser Back works. The route
 * returned is what the user's nav mode renders (parseModeRoute), so every consumer (nav, chips,
 * tab bodies) agrees on what is on screen.
 * Must render under <Suspense> (useSearchParams) and under NavModeProvider.
 */
export function useTabRoute(): TabRouteApi {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { mode } = useNavMode();
  const askedTab = params.get("tab");
  const askedTool = params.get("tool");
  const followed = useMemo(() => followRenames(askedTab, askedTool), [askedTab, askedTool]);
  const parsed = useMemo(() => parseModeRoute(mode, followed.tab, followed.tool), [mode, followed]);

  const go = useCallback(
    (tab: TabId, tool?: string) => {
      const next = parseModeRoute(mode, tab, redirectTool(tab, tool ?? null));
      if (next.rejected.length > 0) throw new Error(`go(): unknown route ${next.rejected.join(", ")}`);
      // A page outside the user's mode still opens; AppShell's banner says it is an advanced tool.
      const href = tabRouteHref(next);
      // Re-selecting the open tab must not stack duplicate Back entries. Compared against the live
      // location (not this render's params) so a long-lived caller such as the tour never goes stale.
      if (window.location.search === href) return;
      router.push(`${pathname}${href}`, { scroll: false });
    },
    [mode, pathname, router],
  );

  return { tab: parsed.tab, tool: parsed.tool, rejected: parsed.rejected, hidden: parsed.hidden, renamed: followed.renamed, go };
}
