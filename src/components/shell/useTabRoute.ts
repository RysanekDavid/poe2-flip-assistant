"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseTabRoute, tabRouteHref, type TabId, type TabRoute } from "./tabRegistry";

export interface TabRouteApi extends TabRoute {
  /** URL params that did not parse (e.g. "tab=bogus"); AppShell alone warns and rewrites them. */
  rejected: readonly string[];
  /** Navigate to a tab (and optionally one of its tools). Pushes history so Back returns here. */
  go: (tab: TabId, tool?: string) => void;
}

/**
 * The active tab lives in the URL (?tab=&tool=) so tabs deep-link and browser Back works.
 * Must render under <Suspense>: useSearchParams bails out of static prerendering otherwise.
 */
export function useTabRoute(): TabRouteApi {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const rawTab = params.get("tab");
  const rawTool = params.get("tool");
  const parsed = useMemo(() => parseTabRoute(rawTab, rawTool), [rawTab, rawTool]);

  const go = useCallback(
    (tab: TabId, tool?: string) => {
      const next = parseTabRoute(tab, tool ?? null);
      if (next.rejected.length > 0) throw new Error(`go(): unknown route ${next.rejected.join(", ")}`);
      const href = tabRouteHref(next);
      // Re-selecting the open tab must not stack duplicate Back entries. Compared against the live
      // location (not this render's params) so a long-lived caller such as the tour never goes stale.
      if (window.location.search === href) return;
      router.push(`${pathname}${href}`, { scroll: false });
    },
    [pathname, router],
  );

  return { tab: parsed.tab, tool: parsed.tool, rejected: parsed.rejected, go };
}
