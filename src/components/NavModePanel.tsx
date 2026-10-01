"use client";

import { useState } from "react";
import { describeError } from "../lib/clientWarn";
import { BEGINNER_TABS, NAV_MODE_LABEL, moreTabs } from "../lib/navMode";
import { tabMeta } from "./shell/tabRegistry";
import { useNavMode } from "./shell/NavModeProvider";
import { Panel } from "./ui/Panel";
import { Toggle } from "./ui/Toggle";
import { InfoTip } from "./ui/Tooltip";

const BEGINNER_LABELS = BEGINNER_TABS.map((id) => tabMeta(id).label);
const ADVANCED_ONLY = moreTabs("beginner").map((t) => t.label);

const TIP = (
  <>
    Beginner: {BEGINNER_LABELS.join(", ")} (Trade without Opportunities), with Alerts and Settings in the header. Advanced adds{" "}
    {ADVANCED_ONLY.join(", ")}, Trade › Opportunities and the POESESSID trade connection; in Beginner they stay one click away under
    More tools. Coach is in both.
  </>
);

/** Settings › Mode: the Beginner/Advanced nav switch, stored per account. */
export function NavModePanel() {
  const { mode, setMode } = useNavMode();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(advanced: boolean): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await setMode(advanced ? "advanced" : "beginner");
    } catch (e: unknown) {
      console.error("[nav-mode] switch failed", e);
      setError(`could not switch mode: ${describeError(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Mode" right={<InfoTip tip={TIP} label="What each mode shows" side="bottom" align="end" />}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Toggle checked={mode === "advanced"} onChange={(next) => void change(next)} label="Advanced mode" disabled={saving} disabledReason="saving…" />
        <span className="text-sm text-neutral-400">
          Now: <span className="text-neutral-200">{NAV_MODE_LABEL[mode]}</span> — {mode === "beginner" ? "the essentials for a new player." : "every trading tool."}
        </span>
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </Panel>
  );
}
