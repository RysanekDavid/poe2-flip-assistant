import { z } from "zod";

/*
 * Plain data (no React) so the Tools tab, its localStorage restore and the test scripts all read
 * one list — a sub-tool added here without a panel file fails test:tools instead of rendering blank.
 */
export const TOOL_IDS = ["regex", "craft-moves", "boss-ev", "liquidate"] as const;

export const toolIdSchema = z.enum(TOOL_IDS);
export type ToolId = z.infer<typeof toolIdSchema>;

export interface ToolMeta {
  id: ToolId;
  label: string;
  hint: string;
  /** Panel module, relative to src/components/tools/ — the file ToolsTab lazy-imports. */
  module: string;
}

export const TOOLS: readonly ToolMeta[] = [
  { id: "regex", label: "Price regex", hint: "stash-search regex for items at or above a price", module: "regex/RegexTool" },
  { id: "craft-moves", label: "Craft moves", hint: "legal next steps · live costs · value", module: "craftmoves/CraftMovesTool" },
  { id: "boss-ev", label: "Boss EV", hint: "entry cost vs drop-table value per boss", module: "bossev/BossEvTool" },
  { id: "liquidate", label: "Liquidate", hint: "what in your stash to sell first", module: "liquidate/LiquidateTool" },
];

export const TOOLS_STORAGE_KEY = "tools-selected";
