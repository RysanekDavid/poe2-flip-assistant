"use client";

import { Fragment, type MouseEvent } from "react";
import Link from "next/link";
import { AlertsTabBadge } from "../alerts/AlertsTab";
import { defaultToolFor, visibleTabs, type NavMode } from "../../lib/navMode";
import { TAB_GROUP, tabMeta, tabRouteHref, type TabId, type TabMeta } from "./tabRegistry";
import { useNavMode } from "./NavModeProvider";
import { TabArt } from "./TabArt";
import { TAB_ICONS } from "./tabIcons";
import { useTabRoute } from "./useTabRoute";

/*
 * Variant A of the 2026-10 header review: the active tab is framed like the league picker (amber
 * border, dark gradient, amber inset underline) and labels are the owl's bone at 60% / 100%, so the
 * nav speaks the logo's palette instead of cold grey. The art carries a hard 1px drop so the dark
 * metal PNGs keep an edge on the translucent header; the active one adds a soft amber glow.
 */
// Keyboard focus is a dashed neutral outline set off the box: the app-wide amber outline would draw
// a second amber frame and read as a second selected tab.
const TAB_FOCUS = "focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300";
const TAB_BASE = `group mb-1.5 flex shrink-0 items-center gap-1.5 rounded-md border py-1 pl-1 pr-2.5 text-sm font-semibold transition-colors ${TAB_FOCUS}`;
const TAB_ACTIVE =
  "border-amber-500/40 bg-gradient-to-b from-amber-950/30 to-neutral-900/85 text-brand-bone shadow-[0_1px_2px_rgba(0,0,0,.4),inset_0_-2px_0_theme(colors.accent)]";
const TAB_IDLE = "border-transparent text-brand-bone/60 hover:border-neutral-800 hover:bg-neutral-900/60 hover:text-brand-bone/90";
const ART_IDLE =
  "[filter:saturate(.85)_drop-shadow(0_1px_0_rgba(0,0,0,.9))] group-hover:-translate-y-px group-hover:[filter:saturate(1)_drop-shadow(0_1px_0_rgba(0,0,0,.9))]";
const ART_ACTIVE = "[filter:saturate(1.05)_drop-shadow(0_0_6px_rgba(251,191,36,.35))_drop-shadow(0_1px_0_rgba(0,0,0,.9))]";

const tabClass = (active: boolean): string => `${TAB_BASE} ${active ? TAB_ACTIVE : TAB_IDLE}`;
const artClass = (active: boolean): string =>
  `h-8 w-8 object-contain transition-[filter,transform] duration-150 ${active ? ART_ACTIVE : ART_IDLE}`;

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
      className={tabClass(active)}
    >
      <TabArt src={TAB_ICONS[meta.id]} className={artClass(active)} priority={meta.id === "flips"} />
      {meta.label}
      {meta.id === "alerts" && <AlertsTabBadge />}
    </Link>
  );
}

/** A hairline between two tab groups; decorative, the labels already say what each tab is. */
function GroupRule() {
  return <span aria-hidden className="mx-1 my-2 w-px shrink-0 self-stretch bg-line" />;
}

function CoachLink({ active, onClick }: { active: boolean; onClick: TabLinkProps["onClick"] }) {
  const coach = tabMeta("coach");
  // Coach keeps a faint frame even when idle: it is the helper, not a work area, and stays apart
  const idle = "border-neutral-800 bg-neutral-900/45 text-brand-bone/60 hover:border-amber-500/25 hover:text-brand-bone/90";
  return (
    <Link
      href={tabRouteHref({ tab: "coach", tool: null })}
      scroll={false}
      prefetch={false}
      onClick={(e) => onClick(e, "coach")}
      title={coach.hint}
      aria-current={active ? "page" : undefined}
      className={`${TAB_BASE} ${active ? TAB_ACTIVE : idle}`}
    >
      {/* the owl breathes a slow amber glow so the helper reads as present; still for reduced motion */}
      <TabArt src={TAB_ICONS.coach} className={`${artClass(active)} motion-safe:animate-breathe`} />
      {coach.label}
    </Link>
  );
}

/**
 * Primary navigation, filtered to the user's nav mode, with a rule between job groups. Coach sits
 * apart on the right in both modes: it is a secondary helper, not a work area.
 */
export function TabNav() {
  const { tab, go } = useTabRoute();
  const { mode } = useNavMode();
  const onClick = tabClickHandler(go);
  const tabs = visibleTabs(mode).filter((t) => t.id !== "coach");
  // Beginner's five tabs are mostly one per group, so rules there would split every tab apart
  const ruled = mode === "advanced";
  return (
    // The strip scrolls sideways whenever it is wider than the header (phones, narrow desktops).
    // Below md it bleeds to the screen edges (-mx-4 against the header's px-4); pt-1.5/px-1.5 leave
    // room for the offset focus outline, which the scroll box would otherwise clip.
    <nav
      aria-label="Sections"
      className="-mx-4 flex items-end gap-0.5 overflow-x-auto overflow-y-hidden px-4 pt-1.5 md:-mx-1.5 md:px-1.5"
      data-tour="tabs"
    >
      {tabs.map((t, i) => {
        const prev = tabs[i - 1];
        return (
          <Fragment key={t.id}>
            {ruled && prev !== undefined && TAB_GROUP[prev.id] !== TAB_GROUP[t.id] && <GroupRule />}
            <TabLink meta={t} mode={mode} active={tab === t.id} onClick={onClick} />
          </Fragment>
        );
      })}
      {/* pushes Coach to the right edge, and keeps a gap before it once the strip scrolls */}
      <span aria-hidden className="ml-auto w-4 shrink-0" />
      <CoachLink active={tab === "coach"} onClick={onClick} />
    </nav>
  );
}
