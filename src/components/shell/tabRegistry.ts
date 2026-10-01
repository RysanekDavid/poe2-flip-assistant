import { z } from "zod";

/*
 * Plain data (no React, no image imports) so the URL router, the nav and the node test scripts all
 * read one list. Tab art lives in tabIcons.ts because tsx cannot import PNGs outside Next.
 */
export const TAB_IDS = ["flips", "trade", "farm", "craft", "wealth", "regex", "patches", "learn", "alerts", "settings", "coach"] as const;

export const tabIdSchema = z.enum(TAB_IDS);
export type TabId = z.infer<typeof tabIdSchema>;

export const DEFAULT_TAB: TabId = "flips";

export interface ToolMeta {
  id: string;
  label: string;
  /** Hover text on the sub-tab: what the tool answers, so no prose sits under the bar. */
  hint: string;
}

export interface TabMeta {
  id: TabId;
  label: string;
  hint: string;
  /** Fixed sub-tools, first = default. Tabs without a list reject every ?tool=. */
  tools?: readonly ToolMeta[];
}

export const TABS: readonly TabMeta[] = [
  { id: "flips", label: "Flips", hint: "Currency Exchange flips · positions · league start" },
  {
    id: "trade",
    label: "Trade",
    hint: "prices · price check · what to buy now",
    tools: [
      { id: "prices", label: "Prices", hint: "every exchange item: price, 7-day trend, volume" },
      { id: "price", label: "Price check", hint: "paste an item: what it is worth and how to sell it" },
      { id: "opportunities", label: "Opportunities", hint: "what to buy on the trade site now: snipes, near-misses, rising uniques" },
    ],
  },
  {
    id: "farm",
    label: "Farm",
    hint: "ways to farm maps and what their drops sell for · pinnacle bosses per kill",
    tools: [
      { id: "strategies", label: "Strategies", hint: "ways to farm maps: setup, and what the drops sell for today" },
      { id: "bosses", label: "Bosses", hint: "pinnacle bosses: entry cost vs. what a kill drops" },
    ],
  },
  {
    id: "craft",
    label: "Craft",
    hint: "profitable recipes · next move for an item · mod pool with prices",
    tools: [
      { id: "recipes", label: "Recipes", hint: "recipes that pay at today's prices" },
      { id: "moves", label: "Paste item", hint: "paste an item: its next best crafting moves" },
      { id: "modpool", label: "Mod pool", hint: "every mod a base rolls, with tier gates and prices" },
    ],
  },
  {
    id: "wealth",
    label: "Wealth",
    hint: "net worth · what to sell",
    tools: [
      { id: "worth", label: "Net worth", hint: "what your public stash is worth, now and over time" },
      { id: "sell", label: "Sell", hint: "what to sell, list, reprice or hold" },
    ],
  },
  {
    id: "regex",
    label: "Regex",
    hint: "stash search: waystones · tablets · relics · jewels · vendor · price",
    // REGEX_TABS (regexPoolContract) in the same order; test:learn holds the two together
    tools: [
      { id: "waystone", label: "Waystone", hint: "pick waystone mods to run or avoid" },
      { id: "tablet", label: "Tablet", hint: "precursor tablets by type and mod" },
      { id: "relic", label: "Relic", hint: "Trial of the Sekhemas relics by mod" },
      { id: "jewel", label: "Jewel", hint: "jewels by colour and mod" },
      { id: "vendor", label: "Vendor", hint: "vendor-screen gear: speed, resistances, +skills" },
      { id: "price", label: "Price", hint: "stash items worth at least a price" },
    ],
  },
  { id: "patches", label: "Patches", hint: "official patch notes · AI summary · what it means for trading" },
  {
    id: "learn",
    label: "Learn",
    hint: "what is this item · currency primer · atlas checklist",
    tools: [
      { id: "what", label: "What is this", hint: "find any item: what it does and what it is worth" },
      { id: "currency", label: "Currency primer", hint: "the first currencies you meet and whether to pick them up" },
      { id: "atlas", label: "Atlas checklist", hint: "the endgame unlock route, step by step" },
    ],
  },
  { id: "alerts", label: "Alerts", hint: "alert feed · sound, popup & Discord routing" },
  {
    id: "settings",
    label: "Settings",
    hint: "account · trade connection · notifications · system",
    tools: [
      { id: "account", label: "Account", hint: "password, sessions and trade connection" },
      { id: "notify", label: "Notifications", hint: "delivery status; routing lives in the Alerts tab" },
      { id: "mode", label: "Mode", hint: "Beginner or Advanced navigation" },
      { id: "system", label: "System", hint: "system health (owner only)" },
    ],
  },
  { id: "coach", label: "Coach", hint: "market · craft · verified sources" },
];

export const TAB_GROUPS = ["market", "earn", "stash", "tools", "account", "helper"] as const;
export type TabGroup = (typeof TAB_GROUPS)[number];

/**
 * Which player job a tab serves. The nav draws a thin rule wherever two neighbouring visible tabs
 * belong to different groups, so the strip reads as a few clusters rather than eleven equal items.
 */
export const TAB_GROUP: Record<TabId, TabGroup> = {
  flips: "market",
  trade: "market",
  farm: "earn",
  craft: "earn",
  wealth: "stash",
  regex: "tools",
  patches: "tools",
  learn: "tools",
  alerts: "account",
  settings: "account",
  coach: "helper",
};

/**
 * Renamed tools: an old ?tool= keeps working by landing on its replacement (Market board became
 * Opportunities on 2026-09-30; Farm board split into Strategies, which took its mechanic heat strip,
 * and Bosses on 2026-10-01). Keyed by today's tab id, since followRenames maps the tab first.
 * Only renames belong here, never removals.
 */
export const TOOL_REDIRECTS: Partial<Record<TabId, Readonly<Record<string, string>>>> = {
  trade: { board: "opportunities" },
  farm: { board: "strategies" },
};

/**
 * Renamed tabs: an old ?tab= keeps working by landing on its replacement (Exchange became Flips on
 * 2026-09-30, once item prices had moved to Market › Prices; Market became Trade on 2026-10-01, as
 * all three of its tools are about trading). Only renames belong here, never removals.
 * A Map, not an object literal, so ?tab=toString cannot resolve to an Object.prototype member.
 */
export const TAB_REDIRECTS: ReadonlyMap<string, TabId> = new Map<string, TabId>([
  ["exchange", "flips"],
  ["market", "trade"],
]);

/** The tab id a raw ?tab= stands for today; unknown and current ids pass through unchanged. */
export function redirectTab(rawTab: string | null): string | null {
  return rawTab === null ? null : (TAB_REDIRECTS.get(rawTab) ?? rawTab);
}

/** The tool id a raw ?tool= stands for today; unknown and current ids pass through unchanged. */
export function redirectTool(rawTab: string | null, rawTool: string | null): string | null {
  const tab = tabIdSchema.safeParse(rawTab);
  if (!tab.success || rawTool === null) return rawTool;
  const renames = TOOL_REDIRECTS[tab.data];
  // own keys only, so ?tool=toString cannot resolve to an Object.prototype member
  return renames && Object.prototype.hasOwnProperty.call(renames, rawTool) ? (renames[rawTool] ?? rawTool) : rawTool;
}

export interface RenamedParams {
  tab: string | null;
  tool: string | null;
  /** The asked params that were renamed (e.g. "tab=exchange"); non-empty means rewrite the URL. */
  renamed: string[];
}

/** Raw ?tab=&tool= → today's ids. The tab goes first because a tool rename is keyed by the current tab id. */
export function followRenames(askedTab: string | null, askedTool: string | null): RenamedParams {
  const tab = redirectTab(askedTab);
  const tool = redirectTool(tab, askedTool);
  const renamed = [...(tab === askedTab ? [] : [`tab=${askedTab}`]), ...(tool === askedTool ? [] : [`tool=${askedTool}`])];
  return { tab, tool, renamed };
}

function defaultTool(tools: readonly ToolMeta[]): ToolMeta {
  const first = tools[0];
  if (!first) throw new Error("a tab's tools list must not be empty");
  return first;
}

/** First declared tool of a tab, or null for tabs without a fixed list. */
export function defaultToolOf(id: TabId): string | null {
  const tools = tabMeta(id).tools;
  return tools ? defaultTool(tools).id : null;
}

export function tabMeta(id: TabId): TabMeta {
  const meta = TABS.find((t) => t.id === id);
  if (!meta) throw new Error(`tab ${id} is in TAB_IDS but missing from TABS`);
  return meta;
}

export interface TabRoute {
  tab: TabId;
  tool: string | null;
}

/**
 * URL params → a route that always renders something: an unknown tab falls back to the default
 * tab, an unknown tool to the tab's first tool. `rejected` names what was dropped so the caller
 * can warn and rewrite the URL instead of silently showing a different page.
 */
export function parseTabRoute(rawTab: string | null, rawTool: string | null): TabRoute & { rejected: string[] } {
  const rejected: string[] = [];
  const tabParse = tabIdSchema.safeParse(rawTab);
  if (rawTab !== null && !tabParse.success) rejected.push(`tab=${rawTab}`);
  const tab = tabParse.success ? tabParse.data : DEFAULT_TAB;
  const meta = tabMeta(tab);
  const tools = meta.tools;
  if (tools) {
    const known = tools.find((t) => t.id === rawTool) ?? null;
    if (rawTool !== null && !known) rejected.push(`tool=${rawTool}`);
    return { tab, tool: (known ?? defaultTool(tools)).id, rejected };
  }
  if (rawTool !== null) rejected.push(`tool=${rawTool}`);
  return { tab, tool: null, rejected };
}

/** Canonical query string for a route; the default tool is still written so links are explicit. */
export function tabRouteHref({ tab, tool }: TabRoute): string {
  const params = new URLSearchParams({ tab });
  if (tool !== null) params.set("tool", tool);
  return `?${params.toString()}`;
}
