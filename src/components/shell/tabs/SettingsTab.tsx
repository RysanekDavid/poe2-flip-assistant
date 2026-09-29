"use client";

import { useEffect } from "react";
import { SettingsPanel } from "../../SettingsPanel";
import { SystemHealthPanel } from "../../system/SystemHealthPanel";
import { AlertRouting } from "../../alerts/AlertsTab";
import { PageHeader } from "../../ui/PageHeader";
import { useTabRoute } from "../useTabRoute";

const SECTION_ID: Record<string, string> = {
  account: "settings-account",
  notify: "settings-notify",
  system: "settings-system",
};

/*
 * Settings shows every section at once (they are short); ?tool= is an anchor, so a link such as
 * "fix your POESESSID" (tool=account) lands on the right block.
 */
export function SettingsTab() {
  const { tool } = useTabRoute();
  useEffect(() => {
    const id = tool ? SECTION_ID[tool] : undefined;
    if (!id) return;
    // After paint: the section only exists once this render has been committed.
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [tool]);

  return (
    <>
      <PageHeader title="Settings" purpose="Your trade connection, how alerts reach you, and (for the owner) system health." />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div id={SECTION_ID.account} className="scroll-mt-[var(--shell-h,0px)]">
          <SettingsPanel />
        </div>
        <div id={SECTION_ID.notify} className="scroll-mt-[var(--shell-h,0px)] space-y-4">
          <AlertRouting />
        </div>
      </div>
      {/* owner-only; renders nothing for members */}
      <div id={SECTION_ID.system} className="scroll-mt-[var(--shell-h,0px)]">
        <SystemHealthPanel />
      </div>
    </>
  );
}
