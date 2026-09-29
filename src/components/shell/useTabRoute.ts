"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseTabRoute, tabRouteHref, type TabId, type TabRoute } from "./tabRegistry";

export interface TabRouteApi extends TabRoute {
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

  // A mistyped or outdated link must not silently show another page: warn, then replace (not
  // push) with the canonical URL so Back skips the broken entry.
  const rejected = parsed.rejected.join(", ");
  useEffect(() => {
    if (rejected === "") return;
    console.warn(`[tabs] ignoring unknown ${rejected} — showing ${parsed.tab}${parsed.tool ? `/${parsed.tool}` : ""}`);
    router.replace(`${pathname}${tabRouteHref(parsed)}`, { scroll: false });
  }, [rejected, parsed, pathname, router]);

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

  return { tab: parsed.tab, tool: parsed.tool, go };
}
