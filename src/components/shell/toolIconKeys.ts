import type { TabId } from "./tabRegistry";

/**
 * Which tools have sub-tab art, per tab — PNG-free so the node tests can check it against
 * tabRegistry.ts. toolIcons.ts must supply exactly these keys (its type is derived from this list).
 */
export const TOOL_ICON_KEYS = {
  flips: [],
  trade: ["prices", "price", "opportunities"],
  farm: ["strategies", "bosses"],
  craft: ["recipes", "moves", "modpool"],
  wealth: ["worth", "sell"],
  regex: ["waystone", "tablet", "relic", "jewel", "vendor", "price"],
  patches: [],
  learn: ["what", "currency", "atlas"],
  alerts: [],
  settings: ["account", "notify", "mode", "system"],
  coach: [],
} as const satisfies Record<TabId, readonly string[]>;

export type ToolIconKey<T extends TabId> = (typeof TOOL_ICON_KEYS)[T][number];
