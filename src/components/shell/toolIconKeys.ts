import type { TabId } from "./tabRegistry";

/**
 * Which tools have sub-tab art, per tab — PNG-free so the node tests can check it against
 * tabRegistry.ts. toolIcons.ts must supply exactly these keys (its type is derived from this list).
 */
export const TOOL_ICON_KEYS = {
  home: [],
  flips: [],
  trade: ["prices", "price", "opportunities"],
  farm: ["strategies", "bosses"],
  craft: ["recipes", "moves", "modpool"],
  stash: ["worth", "sell"],
  regex: ["waystone", "tablet", "relic", "jewel", "vendor", "price"],
  learn: ["what", "currency", "atlas", "patches"],
  alerts: [],
  settings: ["account", "notify", "mode", "system"],
  coach: [],
} as const satisfies Record<TabId, readonly string[]>;

export type ToolIconKey<T extends TabId> = (typeof TOOL_ICON_KEYS)[T][number];
