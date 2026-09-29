"use client";

import type { MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertsTabBadge } from "../alerts/AlertsTab";
import { TABS, defaultToolOf, tabMeta, tabRouteHref, type TabId, type TabMeta } from "./tabRegistry";
import { TAB_ICONS } from "./tabIcons";
import { useTabRoute } from "./useTabRoute";

function TabGlyph({ id, active }: { id: TabId; active: boolean }) {
  const dim = active ? "opacity-100" : "opacity-60 group-hover:opacity-90";
  return <Image src={TAB_ICONS[id]} alt="" className={`h-7 w-7 object-contain transition-opacity ${dim}`} priority={id === "exchange"} />;
}

/** Plain left-click goes through go() (dedupes history); modified clicks keep open-in-new-tab. */
function tabClickHandler(go: (tab: TabId) => void): (e: MouseEvent<HTMLAnchorElement>, id: TabId) => void {
  return (e, id) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    go(id);
  };
}

function TabLink({ meta, active, onClick }: { meta: TabMeta; active: boolean; onClick: (e: MouseEvent<HTMLAnchorElement>, id: TabId) => void }) {
  return (
    <Link
      href={tabRouteHref({ tab: meta.id, tool: defaultToolOf(meta.id) })}
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

/** Primary navigation. Coach sits apart on the right: it is a secondary helper, not a work area. */
export function TabNav() {
  const { tab, go } = useTabRoute();
  const onClick = tabClickHandler(go);
  const coach = tabMeta("coach");
  return (
    <nav aria-label="Sections" className="flex items-end gap-0.5 px-6" data-tour="tabs">
      {TABS.filter((t) => t.id !== "coach").map((t) => (
        <TabLink key={t.id} meta={t} active={tab === t.id} onClick={onClick} />
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
        <TabGlyph id="coach" active={tab === "coach"} />
        {coach.label}
      </Link>
    </nav>
  );
}
