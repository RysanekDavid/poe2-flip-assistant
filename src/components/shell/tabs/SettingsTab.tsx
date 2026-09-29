"use client";

import { useEffect } from "react";
import { AccountSecurityPanel, SettingsPanel } from "../../SettingsPanel";
import { NavModePanel } from "../../NavModePanel";
import { SystemHealthPanel } from "../../system/SystemHealthPanel";
import { AlertRouting } from "../../alerts/AlertsTab";
import { PageHeader } from "../../ui/PageHeader";
import { useNavMode } from "../NavModeProvider";
import { useTabRoute } from "../useTabRoute";

const SECTION_ID: Record<string, string> = {
  account: "settings-account",
  notify: "settings-notify",
  mode: "settings-mode",
  system: "settings-system",
};

const PURPOSE = {
  beginner: "Your account, how alerts reach you, and Beginner/Advanced mode.",
  advanced: "Your trade connection, how alerts reach you, your nav mode, and (for the owner) system health.",
} as const;

/*
 * Settings shows every section at once (they are short); ?tool= is an anchor, so a link such as
 * "fix your POESESSID" (tool=account) lands on the right block. Beginner mode keeps the account's
 * password/sessions but hides the POESESSID trade connection, whose features it also hides.
 */
export function SettingsTab() {
  const { tool } = useTabRoute();
  const { mode } = useNavMode();
  useEffect(() => {
    const id = tool ? SECTION_ID[tool] : undefined;
    if (!id) return;
    // After paint: the section only exists once this render has been committed.
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [tool]);

  return (
    <>
      <PageHeader title="Settings" purpose={PURPOSE[mode]} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div id={SECTION_ID.account} className="scroll-mt-[var(--shell-h,0px)]">
          {mode === "advanced" ? <SettingsPanel /> : <AccountSecurityPanel />}
        </div>
        <div className="space-y-4">
          <div id={SECTION_ID.mode} className="scroll-mt-[var(--shell-h,0px)]">
            <NavModePanel />
          </div>
          <div id={SECTION_ID.notify} className="scroll-mt-[var(--shell-h,0px)] space-y-4">
            <AlertRouting />
          </div>
        </div>
      </div>
      {/* owner-only; renders nothing for members */}
      <div id={SECTION_ID.system} className="scroll-mt-[var(--shell-h,0px)]">
        <SystemHealthPanel />
      </div>
    </>
  );
}
