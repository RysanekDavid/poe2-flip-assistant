"use client";

import { useRef, type KeyboardEvent, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { subTabsFor } from "../../lib/navMode";
import { ItemArt } from "../ui/ItemArt";
import { useNavMode } from "./NavModeProvider";
import { TAB_ICONS } from "./tabIcons";
import { tabMeta, tabRouteHref, type TabId, type ToolMeta } from "./tabRegistry";
import { toolIcon } from "./toolIcons";
import { useTabRoute } from "./useTabRoute";

/** Ids that tie each sub-tab to the panel AppShell wraps around the active tool (ARIA tabs pattern). */
export const subTabId = (tab: TabId, tool: string): string => `${tab}-tab-${tool}`;
export const subTabPanelId = (tab: TabId): string => `${tab}-subtab-panel`;

/** The tools the bar shows for the current route, or null when it is hidden (fewer than two tools). */
export function useSubTabs(): { tab: TabId; tool: string | null; tools: readonly ToolMeta[] | null } {
  const { tab, tool } = useTabRoute();
  const { mode } = useNavMode();
  return { tab, tool, tools: subTabsFor(mode, tab) };
}

function Crumb({ tab }: { tab: TabId }) {
  const icon = TAB_ICONS[tab];
  return (
    <span aria-hidden className="mr-1 flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
      {icon.kind === "art" ? (
        <Image src={icon.src} alt="" className="h-4 w-4 object-contain opacity-60" />
      ) : (
        <icon.Icon strokeWidth={1.75} className="h-4 w-4 text-amber-200/60" />
      )}
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

function Count({ n, active }: { n: number; active: boolean }) {
  return <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-amber-400/15 text-amber-200" : "bg-neutral-800 text-neutral-300"}`}>{n}</span>;
}

const isPlainClick = (e: MouseEvent): boolean => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);

interface Props {
  /** Optional per-tool counts; only numbers the shell already holds belong here (no extra polls). */
  counts?: Partial<Record<string, number | null>>;
}

/**
 * The second row of the sticky header: a tab's tools as an underline strip on a full-width band,
 * so it reads as navigation, never as the bordered filter chips inside pages. Each tool is a URL;
 * arrows/Home/End move between tools (activation follows focus, as in the ARIA tabs pattern).
 */
export function SubTabBar({ counts }: Props) {
  const { tab, tool, tools } = useSubTabs();
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
      className="flex h-11 items-stretch overflow-x-auto whitespace-nowrap border-t border-line/70 bg-neutral-900/60 px-6"
    >
      <Crumb tab={tab} />
      {tools.map((t, i) => (
        <ToolTab
          key={t.id}
          tab={tab}
          meta={t}
          active={t.id === tool}
          count={counts?.[t.id] ?? null}
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
  count: number | null;
  onGo: () => void;
  linkRef: (el: HTMLAnchorElement | null) => void;
}

/** One tool: a real link (open-in-new-tab works), a plain left click goes through go(). */
function ToolTab({ tab, meta, active, count, onGo, linkRef }: ToolTabProps) {
  return (
    <Link
      ref={linkRef}
      id={subTabId(tab, meta.id)}
      role="tab"
      aria-selected={active}
      aria-controls={active ? subTabPanelId(tab) : undefined}
      tabIndex={active ? 0 : -1}
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
        active ? "border-amber-400 text-neutral-100" : "border-transparent text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
      }`}
    >
      <ToolGlyph tab={tab} tool={meta.id} active={active} />
      {meta.label}
      {count != null && <Count n={count} active={active} />}
    </Link>
  );
}
