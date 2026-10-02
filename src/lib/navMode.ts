/*
 * Beginner / Advanced navigation. A beginner (new to PoE2, maybe on a console) sees only the tabs
 * that answer "what do I do today, what do I farm, what is it worth, what is this"; the tools that
 * need trading experience or a POESESSID sit behind "More tools" until they opt in under
 * Settings › Mode. Nothing is ever silently hidden: a link into an advanced page still opens it,
 * and the shell says where it lives. Pure data + functions so the router, the nav, the tour and the
 * node tests share one rule.
 */
import { z } from "zod";
import {
  DEFAULT_TAB,
  HEADER_TABS,
  NAV_ORDER,
  parseTabRoute,
  tabIdSchema,
  tabMeta,
  type TabId,
  type TabMeta,
  type TabRoute,
  type ToolMeta,
} from "../components/shell/tabRegistry";

export const NAV_MODES = ["beginner", "advanced"] as const;
export const navModeSchema = z.enum(NAV_MODES);
export type NavMode = z.infer<typeof navModeSchema>;

export const NAV_MODE_LABEL: Record<NavMode, string> = { beginner: "Beginner", advanced: "Advanced" };

/**
 * Beginner strip in display order. Coach is not listed: it is a helper, shown in both modes; nor are
 * Alerts and Settings, which live in the header (HEADER_TABS) for everyone.
 */
export const BEGINNER_TABS: readonly TabId[] = ["home", "farm", "trade", "learn"];

/**
 * Beginner tools of the tabs above that declare tools; a tab missing here keeps all of its tools.
 * Settings keeps `account` for password + sessions only — its POESESSID block is hidden separately.
 */
export const BEGINNER_TOOLS: Partial<Record<TabId, readonly string[]>> = {
  farm: ["strategies", "bosses"],
  trade: ["price", "prices"],
  // Craft is not a beginner tab today; Roll & sell and Planner stay advanced even if it becomes one:
  // the first ends in selling on the trade site, the second plans multi-omen crafts with estimated odds.
  craft: ["recipes", "moves", "modpool"],
  settings: ["account", "notify", "mode", "system"],
};

/** Whether a tab belongs to this mode's navigation (strip, header or Coach). */
export function isTabVisible(mode: NavMode, tab: TabId): boolean {
  return mode === "advanced" || tab === "coach" || HEADER_TABS.includes(tab) || BEGINNER_TABS.includes(tab);
}

/** The tab strip for a mode, in nav order, Coach last (TabNav draws it apart on the right). */
export function navTabs(mode: NavMode): readonly TabMeta[] {
  const strip = mode === "advanced" ? NAV_ORDER : BEGINNER_TABS;
  return [...strip.map(tabMeta), tabMeta("coach")];
}

/** Strip tabs this mode leaves out, in nav order: what the beginner's "More tools" offers. */
export function moreTabs(mode: NavMode): readonly TabMeta[] {
  return NAV_ORDER.filter((id) => !isTabVisible(mode, id)).map(tabMeta);
}

/** A tab's fixed tools visible in a mode; undefined for tabs without a fixed list (as tabMeta). */
export function visibleTools(mode: NavMode, tab: TabId): readonly ToolMeta[] | undefined {
  const tools = tabMeta(tab).tools;
  const allowed = mode === "beginner" ? BEGINNER_TOOLS[tab] : undefined;
  if (!tools || !allowed) return tools;
  const kept = tools.filter((t) => allowed.includes(t.id));
  if (kept.length === 0) throw new Error(`navMode: beginner hides every tool of tab ${tab}`);
  return kept;
}

export type UserRole = "owner" | "member";

/**
 * Tools whose section renders only for the owner (Settings › System health is empty for members).
 * They stay routable — ?tool=system still parses — they just get no sub-tab that would do nothing.
 */
export const OWNER_ONLY_TOOLS: Partial<Record<TabId, readonly string[]>> = { settings: ["system"] };

/** The sub-tab bar's tools: null when fewer than two remain, since one tool needs no switcher. */
export function subTabsFor(mode: NavMode, tab: TabId, role: UserRole): readonly ToolMeta[] | null {
  const ownerOnly = role === "owner" ? [] : (OWNER_ONLY_TOOLS[tab] ?? []);
  const tools = visibleTools(mode, tab)?.filter((t) => !ownerOnly.includes(t.id));
  return tools && tools.length >= 2 ? tools : null;
}

/** Both modes land on Home: it routes a player to the job they came for. */
export function defaultTabFor(mode: NavMode): TabId {
  if (!isTabVisible(mode, DEFAULT_TAB)) throw new Error(`navMode: the default tab ${DEFAULT_TAB} is hidden in ${mode} mode`);
  return DEFAULT_TAB;
}

/** First visible tool of a tab, or null for tabs without a fixed tool list. */
export function defaultToolFor(mode: NavMode, tab: TabId): string | null {
  return visibleTools(mode, tab)?.[0]?.id ?? null;
}

export interface ModeRoute extends TabRoute {
  /** Params that did not parse at all (unknown tab / tool). */
  rejected: string[];
  /**
   * Params that parsed and are rendered, but are not part of this mode's navigation (e.g.
   * "tab=flips" for a beginner). The shell shows a banner saying where the page lives.
   */
  hidden: string[];
}

/**
 * URL params → the route this mode renders. Like parseTabRoute, but a missing tab means the mode's
 * default. A deep link into a page this mode leaves out of its nav still opens that page — it is
 * reported in `hidden` so the shell can say it is an advanced tool, never swapped for another page.
 * Only a tab's implicit default tool falls back to the first tool the mode shows.
 */
export function parseModeRoute(mode: NavMode, rawTab: string | null, rawTool: string | null): ModeRoute {
  const known = rawTab === null || tabIdSchema.safeParse(rawTab).success;
  const parsed = known ? parseTabRoute(rawTab ?? defaultTabFor(mode), rawTool) : parseTabRoute(defaultTabFor(mode), null);
  const rejected = known ? parsed.rejected : [`tab=${rawTab}`, ...(rawTool === null ? [] : [`tool=${rawTool}`])];
  if (!isTabVisible(mode, parsed.tab)) return { ...parsed, rejected, hidden: [`tab=${parsed.tab}`] };
  const tools = visibleTools(mode, parsed.tab);
  if (!tools || parsed.tool === null || tools.some((t) => t.id === parsed.tool)) return { ...parsed, rejected, hidden: [] };
  const explicit = known && rawTool !== null && parsed.tool === rawTool;
  if (explicit) return { ...parsed, rejected, hidden: [`tool=${rawTool}`] };
  return { tab: parsed.tab, tool: defaultToolFor(mode, parsed.tab), rejected, hidden: [] };
}
