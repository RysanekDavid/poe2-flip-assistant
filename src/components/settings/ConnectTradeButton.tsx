"use client";

import { useState } from "react";
import { describeError } from "../../lib/clientWarn";
import { useNavMode } from "../shell/NavModeProvider";
import { useTabRoute } from "../shell/useTabRoute";
import { Button } from "../ui/Button";

/**
 * The way to the POESESSID form (Settings › Account). Beginner mode hides that form, so a beginner
 * who reached a stash page through More tools is switched to Advanced first — otherwise the button
 * would open a Settings page with nowhere to connect.
 */
export function ConnectTradeButton() {
  const { mode, setMode } = useNavMode();
  const { go } = useTabRoute();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = (): void => {
    if (mode === "advanced") return go("settings", "account");
    setBusy(true);
    setError(null);
    setMode("advanced")
      .then(() => go("settings", "account"))
      .catch((e: unknown) => {
        console.error("[nav-mode] switch to advanced before Settings failed", e);
        setError(`Could not switch: ${describeError(e)}`);
      })
      .finally(() => setBusy(false));
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={open}
        disabled={busy}
        title={mode === "advanced" ? undefined : "the trade connection is an Advanced setting: this shows all tools, then opens it"}
      >
        {busy ? "Switching…" : mode === "advanced" ? "Open Settings" : "Show all tools & connect"}
      </Button>
      {error && <span role="alert" className="text-sm text-bad">{error}</span>}
    </span>
  );
}
