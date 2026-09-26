"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { assertOk, warnOnFailure } from "../lib/clientWarn";

interface LeagueStatus {
  tracked: string;
  defaultLeague: string;
  detected: string | null;
  detectedAt: string | null;
  /** Only ever true for users who FOLLOW the default — a deliberate pin is not a mistake. */
  mismatch: boolean;
  defaultMismatch: boolean;
  canSwitch: boolean;
  canSetDefault: boolean;
}

function useLeagueStatus(): { status: LeagueStatus | null; reload: () => void } {
  const [status, setStatus] = useState<LeagueStatus | null>(null);

  const reload = useCallback(() => {
    fetch("/api/league/status")
      .then((r) => assertOk(r, "/api/league/status").json())
      .then((s: LeagueStatus) => setStatus(s))
      // header-level nicety: a failed poll must not break the dashboard, but it must be diagnosable
      .catch(warnOnFailure("[league-banner] status poll"));
  }, []);

  useEffect(() => {
    reload();
    const timer = setInterval(reload, 10 * 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  return { status, reload };
}

/** PUT a league at one of the two league endpoints; reports the failure instead of swallowing it. */
function SwitchButton({
  league,
  endpoint,
  label,
  busyLabel,
  onSwitched,
}: {
  league: string;
  endpoint: string;
  label: string;
  busyLabel: string;
  onSwitched: () => void;
}) {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
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
        {switching ? busyLabel : label}
      </button>
      {error && <span className="text-bad">{error}</span>}
    </>
  );
}

/**
 * A new league means every price on screen belongs to a dead market, so this outranks the header.
 *
 * Two distinct actions now: anyone can move their OWN view (the same per-user switch the header
 * dropdown performs — a view preference), while only the owner can move the app default, which is
 * what the poller, the Coach and the shared trade2 pipelines run under for everybody else.
 */
export function LeagueBanner() {
  const { status, reload } = useLeagueStatus();
  const detected = status?.detected ?? null;
  if (!status || detected == null) return null;

  // The owner keeps seeing this after switching their own view, until the DEFAULT moves too.
  const ownerMustAct = status.canSetDefault && status.defaultMismatch;
  if (!status.mismatch && !ownerMustAct) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
      <span>
        New league <strong>{detected}</strong> detected —{" "}
        {status.mismatch ? (
          <>
            you are viewing <strong>{status.tracked}</strong>.
          </>
        ) : (
          <>
            the app default is still <strong>{status.defaultLeague}</strong>.
          </>
        )}
      </span>
      {status.mismatch && (
        <SwitchButton
          league={detected}
          endpoint="/api/settings/league"
          label={`Switch my view to ${detected}`}
          busyLabel="switching…"
          onSwitched={() => window.location.reload()}
        />
      )}
      {ownerMustAct && (
        <SwitchButton
          league={detected}
          endpoint="/api/settings/league/default"
          label="Set as default for everyone"
          busyLabel="saving…"
          onSwitched={reload}
        />
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
