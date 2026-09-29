"use client";

import { tabMeta, type TabId } from "./tabRegistry";
import { useTabRoute } from "./useTabRoute";

/** Sub-tool switcher for tabs with fixed tools (Craft, Wealth, Settings); each chip is a URL. */
export function ToolChips({ tab }: { tab: TabId }) {
  const { tool, go } = useTabRoute();
  const tools = tabMeta(tab).tools;
  if (!tools) throw new Error(`ToolChips: tab ${tab} declares no tools`);
  return (
    <div role="group" aria-label={`${tabMeta(tab).label} tools`} className="flex flex-wrap gap-1.5">
      {tools.map((t) => {
        const active = t.id === tool;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            onClick={() => go(tab, t.id)}
            className={`h-8 rounded-md border px-3 text-sm font-medium transition-colors ${
              active
                ? "border-amber-400/50 bg-amber-400/10 text-amber-100"
                : "border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
