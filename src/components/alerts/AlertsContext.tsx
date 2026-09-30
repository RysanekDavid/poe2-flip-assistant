"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCenterSchema, actionableUnseen, groupAlerts, unmutedUnseen, type AlertCenterData, type AlertGroup } from "../../lib/alertCenter";
import { raiseBrowserNotifications } from "./browserNotify";

const POLL_MS = 30_000;
const CHANGED_EVENT = "alerts-changed";

interface AlertCenterState {
  data: AlertCenterData | null;
  error: string | null;
  groups: AlertGroup[];
  unseen: number; // unseen alerts of unmuted types — the feed/ticker count
  actionable: number; // unseen, unmuted SNIPE/CRAFT_MARGIN/SPREAD — the bell badge
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
 * Run `load` now, every POLL_MS, on "alerts-changed", and immediately when the tab becomes
 * visible again. The poll is not paused in background tabs, because popups and the chime are
 * raised from it — but browsers throttle hidden tabs (timers down to ~1/min after ~5 min) and may
 * discard them entirely, so this is best-effort. Discord is the reliable background channel.
 */
function useAlertPoll(load: () => void): void {
  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    const onVisible = (): void => {
      if (!document.hidden) load();
    };
    window.addEventListener(CHANGED_EVENT, load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(CHANGED_EVENT, load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);
}

/**
 * ONE alert poll for the whole page. The TopBar badge, its popover and the Flips ticker each
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
        raiseBrowserNotifications(d.alerts, d);
      })
      .catch((e: unknown) => {
        console.error("[alerts] feed load failed", e);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useAlertPoll(load);

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
    return { data, error, groups, unseen: unmutedUnseen(groups), actionable: actionableUnseen(groups), markSeen, setMuted };
  }, [data, error, markSeen, setMuted]);

  return <AlertsCtx.Provider value={value}>{children}</AlertsCtx.Provider>;
}

/** Shared alert center; throws outside the provider (a wiring bug, not an empty feed). */
export function useAlertCenter(): AlertCenterState {
  const state = useContext(AlertsCtx);
  if (!state) throw new Error("useAlertCenter must be used inside <AlertsProvider>");
  return state;
}
