"use client";

import { useState } from "react";
import { describeError } from "../../lib/clientWarn";
import { defaultTabFor } from "../../lib/navMode";
import { Button } from "../ui/Button";
import { useNavMode } from "./NavModeProvider";
import { TabArt } from "./TabArt";
import { TAB_ICONS } from "./tabIcons";
import { hiddenPageName } from "./headerText";
import type { TabId } from "./tabRegistry";
import { useTabRoute } from "./useTabRoute";

/**
 * A link into a page the user's nav mode leaves out still opens that page; this bar says why it is
 * not in their tabs and offers the two ways on: show every tool, or go back Home.
 */
export function AdvancedBanner({ tab, tool, hidden }: { tab: TabId; tool: string | null; hidden: readonly string[] }) {
  const { setMode, mode } = useNavMode();
  const { go } = useTabRoute();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (hidden.length === 0) return null;
  const showAll = (): void => {
    setSaving(true);
    setError(null);
    setMode("advanced")
      .catch((e: unknown) => {
        console.error("[nav-mode] switch to advanced failed", e);
        setError(`Could not switch: ${describeError(e)}`);
      })
      .finally(() => setSaving(false));
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-sm">
      <TabArt src={TAB_ICONS[tab]} className="h-6 w-6 object-contain" />
      {/* min width: on a phone the sentence takes its own row instead of a one-word column */}
      <span role="status" className="min-w-[14rem] flex-1 text-neutral-200">
        <b className="text-amber-200">{hiddenPageName(tab, tool, hidden)}</b> is an Advanced tool, so it is not in your {mode} tabs.
      </span>
      {error && <span className="text-bad">{error}</span>}
      {/* secondary: the page below keeps the one amber primary action */}
      <Button size="sm" variant="secondary" onClick={showAll} disabled={saving} title="switch to Advanced mode (Settings › Mode switches back)">
        {saving ? "Switching…" : "Show all tools"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => go(defaultTabFor(mode))}>
        Back to Home
      </Button>
    </div>
  );
}
