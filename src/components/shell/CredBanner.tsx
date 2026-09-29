"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { assertOk, warnOnFailure } from "../../lib/clientWarn";
import { poeSettingsResponseSchema, type CredStatus } from "../../lib/poeSettingsContract";
import { fmtAgeMin } from "../ui/StaleBadge";
import { useTabRoute } from "./useTabRoute";

// Same cadence as LeagueBanner: an expired cookie is found by the next trade2 call, not by polling.
const POLL_MS = 10 * 60_000;

function useCredStatus(): CredStatus | null {
  const [status, setStatus] = useState<CredStatus | null>(null);
  const load = useCallback(() => {
    fetch("/api/settings/poe")
      .then((r) => assertOk(r, "/api/settings/poe").json())
      .then((body: unknown) => setStatus(poeSettingsResponseSchema.parse(body).credStatus))
      // a banner is a nicety: a failed poll hides it (never shows a stale "expired") and is logged
      .catch((error: unknown) => {
        warnOnFailure("[cred-banner] status poll")(error);
        setStatus(null);
      });
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);
  return status;
}

/**
 * Shown only when the user's POESESSID got a 403: every stash read and reprice check silently
 * stops otherwise, and the numbers on Wealth keep looking current.
 */
export function CredBanner() {
  const status = useCredStatus();
  const { go } = useTabRoute();
  if (status?.state !== "expired") return null;
  const ageMin = status.checkedAt == null ? null : (Date.now() - Date.parse(status.checkedAt)) / 60_000;
  const since = ageMin == null || !Number.isFinite(ageMin) ? "" : ` ${fmtAgeMin(ageMin)} ago`;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
    >
      <KeyRound aria-hidden className="h-4 w-4 shrink-0 text-amber-400" />
      <span title={status.error ?? undefined}>
        Your POESESSID stopped working{since} — stash and comps show the last good read.
      </span>
      <button
        type="button"
        onClick={() => go("settings", "account")}
        className="rounded border border-amber-500/50 px-2 py-1 font-medium text-amber-100 transition-colors hover:bg-amber-500/15"
      >
        Fix in Settings
      </button>
    </div>
  );
}
