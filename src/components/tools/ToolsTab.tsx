/*
 * Tools tab. Every tool here is read-only: it reads market data and your own snapshots, and never
 * interacts with the game or trade site on your behalf (no whispers, no listings, no clicks).
 * Every number a tool shows must carry its source and age, so a stale or estimated value is never
 * mistaken for a live one.
 */
"use client";

import { useEffect, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { TOOL_IDS, TOOLS, TOOLS_STORAGE_KEY, toolIdSchema, type ToolId } from "./toolRegistry";

function PanelLoading() {
  return <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/30 px-4 py-2.5 text-xs text-neutral-600">loading…</div>;
}

// Lazy per tool: each panel will pull its own data/logic, and only the open one should load.
const PANELS: Record<ToolId, ComponentType> = {
  regex: dynamic(() => import("./regex/RegexTool").then((m) => m.RegexTool), { loading: PanelLoading }),
  "craft-moves": dynamic(() => import("./craftmoves/CraftMovesTool").then((m) => m.CraftMovesTool), {
    loading: PanelLoading,
  }),
  "boss-ev": dynamic(() => import("./bossev/BossEvTool").then((m) => m.BossEvTool), { loading: PanelLoading }),
  liquidate: dynamic(() => import("./liquidate/LiquidateTool").then((m) => m.LiquidateTool), { loading: PanelLoading }),
};

function readStoredTool(): ToolId | null {
  try {
    const raw = localStorage.getItem(TOOLS_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = toolIdSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[tools] ignoring unknown stored tool "${raw}"`);
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    console.warn("[tools] could not read the selected tool from localStorage", error);
    return null;
  }
}

function storeTool(id: ToolId): void {
  try {
    localStorage.setItem(TOOLS_STORAGE_KEY, id);
  } catch (error: unknown) {
    console.warn("[tools] could not persist the selected tool to localStorage", error);
  }
}

function useSelectedTool(): [ToolId, (id: ToolId) => void] {
  const [selected, setSelected] = useState<ToolId>(TOOL_IDS[0]);
  // Restored after mount, not in the initializer: the server render has no localStorage.
  useEffect(() => {
    const stored = readStoredTool();
    if (stored) setSelected(stored);
  }, []);
  const select = (id: ToolId): void => {
    setSelected(id);
    storeTool(id);
  };
  return [selected, select];
}

export function ToolsTab() {
  const [selected, select] = useSelectedTool();
  const Panel = PANELS[selected];
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col" aria-label="Tools">
        {TOOLS.map((t) => {
          const active = t.id === selected;
          return (
            <button
              key={t.id}
              onClick={() => select(t.id)}
              title={t.hint}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors ${
                active
                  ? "border-neutral-700 bg-neutral-900 text-neutral-100"
                  : "border-transparent text-neutral-500 hover:bg-neutral-900/50 hover:text-neutral-300"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1">
        <Panel />
      </div>
    </div>
  );
}
