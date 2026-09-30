"use client";

import { useEffect, useRef, type RefObject } from "react";
import { TopBar } from "../TopBar";
import { LeagueSelect } from "../LeagueSelect";
import { MarketStatus } from "../MarketStatus";
import { defaultTabFor, defaultToolFor } from "../../lib/navMode";
import { Brand } from "./Brand";
import { TabNav, tabClickHandler } from "./TabNav";
import { SubTabBar } from "./SubTabBar";
import { useNavMode } from "./NavModeProvider";
import { useTabRoute } from "./useTabRoute";
import { tabRouteHref } from "./tabRegistry";

/**
 * Publishes the sticky header's height as --shell-h so sticky table heads and scroll targets sit
 * just under it instead of hiding their first row behind it (the header height changes when its
 * rows wrap at narrow widths).
 */
function useShellHeightVar(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) throw new Error("ShellHeader: header ref not attached");
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--shell-h", `${el.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

/** The brand is the way home: the default tab of the user's nav mode, through go() like a tab click. */
function HomeBrand() {
  const { go } = useTabRoute();
  const { mode } = useNavMode();
  const home = defaultTabFor(mode);
  const onClick = tabClickHandler(go);
  return <Brand size="header" href={tabRouteHref({ tab: home, tool: defaultToolFor(mode, home) })} onClick={(e) => onClick(e, home)} />;
}

/**
 * Sticky app header. From md up the brand is a block spanning both rows (status strip + tabs) with
 * a divider to its right; below md it shrinks to a compact inline mark beside the status strip and
 * the tabs take the full width. ShellFallback mirrors this grid so the first paint does not jump.
 */
export function ShellHeader() {
  const headerRef = useRef<HTMLElement>(null);
  useShellHeightVar(headerRef);
  return (
    <header ref={headerRef} className="sticky top-0 z-40 -mx-6 -mt-6 border-b border-line bg-neutral-950/85 backdrop-blur">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 px-4 md:gap-x-5 md:px-6 md:pt-1">
        <h1 className="col-start-1 row-start-1 md:row-span-2 md:mb-2 md:self-end md:border-r md:border-line md:pr-[18px]">
          <HomeBrand />
        </h1>
        <div className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
          {/* league picker sits with the rates it controls — per account, switchable anytime */}
          <div className="flex flex-wrap items-center gap-1.5">
            <MarketStatus />
            <LeagueSelect />
          </div>
          <TopBar />
        </div>
        <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-2">
          <TabNav />
        </div>
      </div>
      <SubTabBar />
    </header>
  );
}
