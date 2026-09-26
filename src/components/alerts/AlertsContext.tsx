"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCenterSchema, groupAlerts, unmutedUnseen, type AlertCenterData, type AlertGroup } from "../../lib/alertCenter";
import { raiseBrowserNotifications } from "./browserNotify";

const POLL_MS = 30_000;
const CHANGED_EVENT = "alerts-changed";

interface AlertCenterState {
  data: AlertCenterData | null;
  error: string | null;
  groups: AlertGroup[];
  unseen: number; // unseen alerts of unmuted types — the badge
  markSeen: (target: { type: string } | { all: true }) => Promise<void>;
  setMuted: (type: string, muted: boolean) => Promise<void>;
}

const AlertsCtx = createContext<AlertCenterState | null>(null);

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
}

/** Tell every alert consumer (and the Settings panel) to refetch. */
export function announceAlertsChanged(): void {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * ONE alert poll for the whole page. The TopBar badge, its popover and the Exchange ticker each
 * used to poll /api/alerts on their own; they now read this provider. Browser notifications are
 * raised here too, so they fire on every tab — not only while the ticker happens to be mounted.
 */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AlertCenterData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/alerts")
      .then(async (r) => {
        if (!r.ok) throw new Error(`/api/alerts → ${r.status}`);
        return AlertCenterSchema.parse(await r.json());
      })
      .then((d) => {
        setData(d);
        setError(null);
        raiseBrowserNotifications(d.alerts, d.tickerMuted);
      })
      .catch((e: unknown) => {
        console.error("[alerts] feed load failed", e);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    window.addEventListener(CHANGED_EVENT, load);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(CHANGED_EVENT, load);
    };
  }, [load]);

  // Actions report failure through `error` (shown by the ticker), so callers can fire and forget.
  const act = useCallback(async (url: string, body: unknown) => {
    try {
      await postJson(url, body);
      announceAlertsChanged();
    } catch (e) {
      console.error("[alerts] action failed", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const markSeen = useCallback((target: { type: string } | { all: true }) => act("/api/alerts", target), [act]);
  const setMuted = useCallback(
    (type: string, muted: boolean) => act("/api/settings/notify", { action: "pref", type, ticker: !muted }),
    [act],
  );

  const value = useMemo<AlertCenterState>(() => {
    const groups = data ? groupAlerts(data.alerts, data.counts, data.tickerMuted) : [];
    return { data, error, groups, unseen: unmutedUnseen(groups), markSeen, setMuted };
  }, [data, error, markSeen, setMuted]);

  return <AlertsCtx.Provider value={value}>{children}</AlertsCtx.Provider>;
}

/** Shared alert center; throws outside the provider (a wiring bug, not an empty feed). */
export function useAlertCenter(): AlertCenterState {
  const state = useContext(AlertsCtx);
  if (!state) throw new Error("useAlertCenter must be used inside <AlertsProvider>");
  return state;
}
