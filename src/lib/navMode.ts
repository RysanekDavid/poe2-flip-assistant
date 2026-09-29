/*
 * Beginner / Advanced navigation. A beginner (new to PoE2, maybe on a console) sees only the tabs
 * that answer "what is this, what do I farm, what is it worth"; everything that needs trading
 * experience or a POESESSID stays out of the nav until they opt in under Settings › Mode.
 * Pure data + functions so the router, the nav, the tour and the node tests share one rule.
 */
import { z } from "zod";
import {
  DEFAULT_TAB,
  TABS,
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

/** Beginner nav in display order. Coach is not listed: it is a helper, shown in both modes. */
export const BEGINNER_TABS: readonly TabId[] = ["learn", "farm", "market", "alerts", "settings"];

/**
 * Beginner tools of the tabs above that declare tools; a tab missing here keeps all of its tools.
 * Settings keeps `account` for password + sessions only — its POESESSID block is hidden separately.
 */
export const BEGINNER_TOOLS: Partial<Record<TabId, readonly string[]>> = {
  farm: ["strategies"],
  market: ["price"],
  settings: ["account", "notify", "mode", "system"],
};

export function isTabVisible(mode: NavMode, tab: TabId): boolean {
  return mode === "advanced" || tab === "coach" || BEGINNER_TABS.includes(tab);
}

/** Tabs in nav order for a mode (Coach last, as TabNav renders it apart). */
export function visibleTabs(mode: NavMode): readonly TabMeta[] {
  if (mode === "advanced") return TABS;
  return [...BEGINNER_TABS.map(tabMeta), tabMeta("coach")];
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

export function defaultTabFor(mode: NavMode): TabId {
  return mode === "beginner" ? "learn" : DEFAULT_TAB;
}

/** First visible tool of a tab, or null for tabs without a fixed tool list. */
export function defaultToolFor(mode: NavMode, tab: TabId): string | null {
  return visibleTools(mode, tab)?.[0]?.id ?? null;
}

export interface ModeRoute extends TabRoute {
  /** Params that did not parse at all (unknown tab / tool). */
  rejected: string[];
  /** Params that parsed but are hidden in this mode — the caller warns and rewrites the URL. */
  hidden: string[];
}

/**
 * URL params → the route this mode renders. Like parseTabRoute, but a missing tab means the mode's
 * default, and a hidden tab or explicitly requested hidden tool falls back to what the mode shows,
 * so a deep link into a hidden page lands somewhere real instead of a blank page.
 */
export function parseModeRoute(mode: NavMode, rawTab: string | null, rawTool: string | null): ModeRoute {
  const known = rawTab === null || tabIdSchema.safeParse(rawTab).success;
  const parsed = known ? parseTabRoute(rawTab ?? defaultTabFor(mode), rawTool) : parseTabRoute(defaultTabFor(mode), null);
  const rejected = known ? parsed.rejected : [`tab=${rawTab}`, ...(rawTool === null ? [] : [`tool=${rawTool}`])];
  if (!isTabVisible(mode, parsed.tab)) {
    const tab = defaultTabFor(mode);
    return { tab, tool: defaultToolFor(mode, tab), rejected, hidden: [`tab=${parsed.tab}`] };
  }
  const tools = visibleTools(mode, parsed.tab);
  if (!tools || parsed.tool === null || tools.some((t) => t.id === parsed.tool)) return { ...parsed, rejected, hidden: [] };
  // The tab's own default may be hidden (Farm board for a beginner): only an explicit ?tool= is a hidden deep link.
  const explicit = known && rawTool !== null && parsed.tool === rawTool;
  return { tab: parsed.tab, tool: defaultToolFor(mode, parsed.tab), rejected, hidden: explicit ? [`tool=${rawTool}`] : [] };
}
