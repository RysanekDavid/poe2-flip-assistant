"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface LeagueStatus {
  tracked: string;
  detected: string | null;
  detectedAt: string | null;
  mismatch: boolean;
  canSwitch: boolean;
}

function useLeagueStatus(): { status: LeagueStatus | null; reload: () => void } {
  const [status, setStatus] = useState<LeagueStatus | null>(null);

  const reload = useCallback(() => {
    fetch("/api/league/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: LeagueStatus | null) => setStatus(s))
      .catch(() => {}); // header-level nicety; a failed poll must not break the dashboard
  }, []);

  useEffect(() => {
    reload();
    const timer = setInterval(reload, 10 * 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  return { status, reload };
}

/** Owner-only action: point every price source at the detected league, no redeploy. */
function SwitchButton({ league, onSwitched }: { league: string; onSwitched: () => void }) {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/league", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(body) ?? `switch failed (${res.status})`);
      onSwitched();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      <button
        onClick={() => void submit()}
        disabled={switching}
        className="rounded border border-amber-500/50 px-2 py-1 font-medium text-amber-100 transition-colors hover:bg-amber-500/15 disabled:opacity-50"
      >
        {switching ? "switching…" : `Switch to ${league}`}
      </button>
      {error && <span className="text-bad">{error}</span>}
    </>
  );
}

/**
 * A new league means every price on screen belongs to a dead market, so this outranks the
 * header. The owner gets the switch button; members get the warning only — the league is
 * global state, one account must not flip it for everyone by accident.
 */
export function LeagueBanner() {
  const { status, reload } = useLeagueStatus();
  if (!status || !status.mismatch || status.detected == null) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
      <span>
        New league <strong>{status.detected}</strong> detected — this app is still tracking{" "}
        <strong>{status.tracked}</strong>.
      </span>
      {status.canSwitch ? (
        <SwitchButton league={status.detected} onSwitched={reload} />
      ) : (
        <span className="text-amber-200/70">ask the owner to switch.</span>
      )}
    </div>
  );
}

function errorMessage(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "error" in body) {
    const { error } = body as { error: unknown };
    if (typeof error === "string") return error;
  }
  return null;
}
