"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchNotifySettings, postNotifySettings, type NotifySettings } from "../../lib/notifySettings";
import { announceAlertsChanged } from "./AlertsContext";

/** `done` is the success note — fixed, or derived from the fresh view (e.g. whether a refresh was queued). */
export type Run = (body: unknown, done?: string | ((view: NotifySettings) => string)) => Promise<boolean>;

export interface NotifySettingsApi {
  view: NotifySettings | null;
  busy: boolean;
  error: string | null;
  info: string | null;
  run: Run;
}

/**
 * Load the settings view once; `run` posts one action and swaps in the fresh view. Lifted out of
 * the routing panel so the Delivery summary above it reads the same state instead of a second copy.
 */
export function useNotifySettings(): NotifySettingsApi {
  const [view, setView] = useState<NotifySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchNotifySettings()
      .then(setView)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const run = useCallback<Run>((body, done) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    return postNotifySettings(body)
      .then((v) => {
        setView(v);
        if (done) setInfo(typeof done === "string" ? done : done(v));
        announceAlertsChanged(); // the feed reads ticker/sound/popup routing from the same table
        return true;
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      })
      .finally(() => setBusy(false));
  }, []);
  return { view, busy, error, info, run };
}
