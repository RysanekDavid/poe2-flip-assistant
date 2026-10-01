"use client";

import { useRef, type KeyboardEvent, type MouseEvent } from "react";
import Link from "next/link";
import { subTabsFor } from "../../lib/navMode";
import { ItemArt } from "../ui/ItemArt";
import { useNavMode } from "./NavModeProvider";
import { TabArt } from "./TabArt";
import { TAB_ICONS } from "./tabIcons";
import { tabMeta, tabRouteHref, type TabId, type ToolMeta } from "./tabRegistry";
import { toolIcon } from "./toolIcons";
import { useTabRoute } from "./useTabRoute";

/** Ids that tie each sub-tab to the panel AppShell wraps around the active tool (ARIA tabs pattern). */
export const subTabId = (tab: TabId, tool: string): string => `${tab}-tab-${tool}`;
export const subTabPanelId = (tab: TabId): string => `${tab}-subtab-panel`;

interface SubTabs {
  tab: TabId;
  tool: string | null;
  /** null = the bar is hidden (fewer than two tools this user can use). */
  tools: readonly ToolMeta[] | null;
  /** The route's tool has a sub-tab (false e.g. for a member deep-linked to the owner-only System). */
  toolShown: boolean;
}

/** The tools the bar shows for the current route and viewer. */
export function useSubTabs(): SubTabs {
  const { tab, tool } = useTabRoute();
  const { mode, me } = useNavMode();
  const tools = subTabsFor(mode, tab, me.role);
  return { tab, tool, tools, toolShown: tools?.some((t) => t.id === tool) ?? false };
}

function Crumb({ tab }: { tab: TabId }) {
  return (
    <span aria-hidden className="mr-1 flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
      <TabArt src={TAB_ICONS[tab]} className="h-4 w-4 object-contain opacity-85" />
      {tabMeta(tab).label}
      <span className="text-neutral-500">›</span>
    </span>
  );
}

function ToolGlyph({ tab, tool, active }: { tab: TabId; tool: string; active: boolean }) {
  const icon = toolIcon(tab, tool);
  const dim = active ? "opacity-100" : "opacity-60 group-hover:opacity-90";
  if (icon.kind === "glyph") return <icon.Icon aria-hidden strokeWidth={1.75} className={`h-5 w-5 shrink-0 text-amber-200/80 transition-opacity ${dim}`} />;
  return (
    <span className={`inline-flex transition-opacity ${dim}`}>
      <ItemArt src={icon.src} size={5} />
    </span>
  );
}

const isPlainClick = (e: MouseEvent): boolean => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);

/**
 * The second row of the sticky header: a tab's tools as an underline strip on a full-width band,
 * so it reads as navigation, never as the bordered filter chips inside pages. Each tool is a URL;
 * arrows/Home/End move between tools (activation follows focus, as in the ARIA tabs pattern).
 */
export function SubTabBar() {
  const { tab, tool, tools, toolShown } = useSubTabs();
  const { go } = useTabRoute();
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);
  if (!tools) return null;
  const move = (i: number): void => {
    const next = tools[(i + tools.length) % tools.length];
    if (!next) throw new Error(`SubTabBar: no tool at ${i}`);
    go(tab, next.id);
    refs.current[(i + tools.length) % tools.length]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const at = tools.findIndex((t) => t.id === tool);
    const target = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tools.length - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    move(target);
  };
  return (
    <div
      role="tablist"
      aria-label={`${tabMeta(tab).label} tools`}
      onKeyDown={onKeyDown}
      className="flex h-11 items-stretch overflow-x-auto whitespace-nowrap border-t border-line/70 bg-neutral-900/60 px-4 md:px-6"
    >
      <Crumb tab={tab} />
      {tools.map((t, i) => (
        <ToolTab
          key={t.id}
          tab={tab}
          meta={t}
          active={t.id === tool}
          // with no active sub-tab the first one keeps the tablist reachable by Tab
          focusable={t.id === tool || (!toolShown && i === 0)}
          onGo={() => go(tab, t.id)}
          linkRef={(el) => {
            refs.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}

interface ToolTabProps {
  tab: TabId;
  meta: ToolMeta;
  active: boolean;
  focusable: boolean;
  onGo: () => void;
  linkRef: (el: HTMLAnchorElement | null) => void;
}

/** One tool: a real link (open-in-new-tab works), a plain left click goes through go(). */
function ToolTab({ tab, meta, active, focusable, onGo, linkRef }: ToolTabProps) {
  return (
    <Link
      ref={linkRef}
      id={subTabId(tab, meta.id)}
      role="tab"
      aria-selected={active}
      aria-controls={active ? subTabPanelId(tab) : undefined}
      tabIndex={focusable ? 0 : -1}
      href={tabRouteHref({ tab, tool: meta.id })}
      scroll={false}
      prefetch={false}
      title={meta.hint}
      onClick={(e) => {
        if (!isPlainClick(e)) return;
        e.preventDefault();
        onGo();
      }}
      className={`group inline-flex shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/60 ${
        // same bone label tones as the tab row; the underline (not a frame) keeps it a level below
        active ? "border-amber-400 text-brand-bone" : "border-transparent text-brand-bone/60 hover:border-neutral-600 hover:text-brand-bone/90"
      }`}
    >
      <ToolGlyph tab={tab} tool={meta.id} active={active} />
      {meta.label}
    </Link>
  );
}
