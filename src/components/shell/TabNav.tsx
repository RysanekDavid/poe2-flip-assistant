"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { AlertsTabBadge } from "../alerts/AlertsTab";
import { defaultToolFor, visibleTabs, type NavMode } from "../../lib/navMode";
import { tabMeta, tabRouteHref, type TabId, type TabMeta } from "./tabRegistry";
import { useNavMode } from "./NavModeProvider";
import { TabArt } from "./TabArt";
import { TAB_ICONS } from "./tabIcons";
import { useTabRoute } from "./useTabRoute";

// Inactive art stays near full strength: at 60% the dark metal PNGs sank into the header.
const dimClass = (active: boolean): string => (active ? "opacity-100" : "opacity-85 group-hover:opacity-100");

function TabGlyph({ id, active }: { id: TabId; active: boolean }) {
  return <TabArt src={TAB_ICONS[id]} className={`h-7 w-7 object-contain transition-opacity ${dimClass(active)}`} priority={id === "flips"} />;
}

/** Plain left-click goes through go() (dedupes history); modified clicks keep open-in-new-tab. */
export function tabClickHandler(go: (tab: TabId) => void): (e: MouseEvent<HTMLAnchorElement>, id: TabId) => void {
  return (e, id) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    go(id);
  };
}

interface TabLinkProps {
  meta: TabMeta;
  mode: NavMode;
  active: boolean;
  onClick: (e: MouseEvent<HTMLAnchorElement>, id: TabId) => void;
}

function TabLink({ meta, mode, active, onClick }: TabLinkProps) {
  return (
    <Link
      href={tabRouteHref({ tab: meta.id, tool: defaultToolFor(mode, meta.id) })}
      scroll={false}
      prefetch={false}
      onClick={(e) => onClick(e, meta.id)}
      title={meta.hint}
      aria-current={active ? "page" : undefined}
      className={`group relative -mb-px flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-2.5 py-1.5 text-sm font-medium transition-colors ${
        active ? "border-amber-400 text-neutral-100" : "border-transparent text-neutral-400 hover:text-neutral-200"
      }`}
    >
      <TabGlyph id={meta.id} active={active} />
      {meta.label}
      {meta.id === "alerts" && <AlertsTabBadge />}
    </Link>
  );
}

/**
 * Primary navigation, filtered to the user's nav mode. Coach sits apart on the right in both modes:
 * it is a secondary helper, not a work area.
 */
export function TabNav() {
  const { tab, go } = useTabRoute();
  const { mode } = useNavMode();
  const onClick = tabClickHandler(go);
  const coach = tabMeta("coach");
  return (
    // below md the strip bleeds to the screen edges (-mx-4 against the header's px-4) so it scrolls edge to edge
    <nav aria-label="Sections" className="-mx-4 flex items-end gap-0.5 px-4 max-md:overflow-x-auto max-md:overflow-y-hidden md:mx-0 md:px-0" data-tour="tabs">
      {visibleTabs(mode)
        .filter((t) => t.id !== "coach")
        .map((t) => (
          <TabLink key={t.id} meta={t} mode={mode} active={tab === t.id} onClick={onClick} />
        ))}
      <Link
        href={tabRouteHref({ tab: "coach", tool: null })}
        scroll={false}
        prefetch={false}
        onClick={(e) => onClick(e, "coach")}
        title={coach.hint}
        aria-current={tab === "coach" ? "page" : undefined}
        className={`group mb-1 ml-auto flex shrink-0 items-center gap-2 rounded-md border px-3 py-1 text-sm font-medium transition-colors ${
          tab === "coach"
            ? "border-amber-400/40 bg-amber-950/25 text-amber-100"
            : "border-neutral-800 bg-neutral-900/45 text-neutral-400 hover:border-amber-400/25 hover:text-neutral-200"
        }`}
      >
        {/* the owl breathes a slow amber glow so the helper reads as present; still for reduced motion */}
        <TabArt
          src={TAB_ICONS.coach}
          className={`h-7 w-7 object-contain transition-opacity motion-safe:animate-breathe ${dimClass(tab === "coach")}`}
        />
        {coach.label}
      </Link>
    </nav>
  );
}
