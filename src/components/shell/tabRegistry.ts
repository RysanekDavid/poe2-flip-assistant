import { z } from "zod";

/*
 * Plain data (no React, no image imports) so the URL router, the nav and the node test scripts all
 * read one list. Tab art lives in tabIcons.ts because tsx cannot import PNGs outside Next.
 */
export const TAB_IDS = ["exchange", "market", "farm", "craft", "wealth", "regex", "patches", "alerts", "settings", "coach"] as const;

export const tabIdSchema = z.enum(TAB_IDS);
export type TabId = z.infer<typeof tabIdSchema>;

export const DEFAULT_TAB: TabId = "exchange";

export interface ToolMeta {
  id: string;
  label: string;
}

export interface TabMeta {
  id: TabId;
  label: string;
  hint: string;
  /** Fixed sub-tools, first = default. */
  tools?: readonly ToolMeta[];
  /**
   * The tab's own internals own ?tool= (e.g. regex modes): any slug-shaped value is passed through
   * untouched. Tabs with neither this nor `tools` reject every ?tool=.
   */
  openTools?: true;
}

export const TABS: readonly TabMeta[] = [
  { id: "exchange", label: "Exchange", hint: "in-game Currency Exchange flips" },
  {
    id: "market",
    label: "Market",
    hint: "price check · trade site demand · snipes",
    tools: [
      { id: "price", label: "Price check" },
      { id: "board", label: "Market board" },
    ],
  },
  { id: "farm", label: "Farm", hint: "what to farm now · pinnacle boss EV" },
  {
    id: "craft",
    label: "Craft",
    hint: "profitable recipes · next move for an item",
    tools: [
      { id: "recipes", label: "Recipes" },
      { id: "moves", label: "Paste item" },
    ],
  },
  {
    id: "wealth",
    label: "Wealth",
    hint: "net worth · what to sell",
    tools: [
      { id: "worth", label: "Net worth" },
      { id: "sell", label: "Sell" },
    ],
  },
  { id: "regex", label: "Regex", hint: "stash search: waystones · tablets · relics · jewels · vendor · price", openTools: true },
  { id: "patches", label: "Patches", hint: "official patch notes · AI summary · what it means for trading" },
  { id: "alerts", label: "Alerts", hint: "alert feed · sound, popup & Discord routing" },
  {
    id: "settings",
    label: "Settings",
    hint: "account · trade connection · notifications · system",
    tools: [
      { id: "account", label: "Account" },
      { id: "notify", label: "Notifications" },
      { id: "system", label: "System" },
    ],
  },
  { id: "coach", label: "Coach", hint: "market · craft · verified sources" },
];

const toolSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);

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
  if (rawTool === null) return { tab, tool: null, rejected };
  const slug = meta.openTools ? toolSlugSchema.safeParse(rawTool) : null;
  if (!slug?.success) rejected.push(`tool=${rawTool}`);
  return { tab, tool: slug?.success ? slug.data : null, rejected };
}

/** Canonical query string for a route; the default tool is still written so links are explicit. */
export function tabRouteHref({ tab, tool }: TabRoute): string {
  const params = new URLSearchParams({ tab });
  if (tool !== null) params.set("tool", tool);
  return `?${params.toString()}`;
}
