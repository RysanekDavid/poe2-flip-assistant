"use client";

import { visibleTools } from "../../lib/navMode";
import { tabMeta, type TabId } from "./tabRegistry";
import { useNavMode } from "./NavModeProvider";
import { useTabRoute } from "./useTabRoute";

/**
 * Sub-tool switcher for tabs with fixed tools (Craft, Wealth, Learn…); each chip is a URL. Only the
 * tools the user's nav mode shows are offered, and a single remaining tool needs no switcher.
 */
export function ToolChips({ tab }: { tab: TabId }) {
  const { tool, go } = useTabRoute();
  const { mode } = useNavMode();
  const tools = visibleTools(mode, tab);
  if (!tools) throw new Error(`ToolChips: tab ${tab} declares no tools`);
  if (tools.length < 2) return null;
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
