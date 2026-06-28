"use client";

import { useCallback, useEffect, useState } from "react";

export interface Alert {
  id: number;
  type: string;
  item_id: string;
  item_name: string | null;
  message: string;
  value: number | null;
  threshold: number | null;
  whisper: string | null;
  link: string | null;
  seen: number;
  created_at: string;
}

const LS_KEY = "lastAlertNotifiedId";

/** High-priority types get a sound + louder treatment — a snipe is time-sensitive. */
const LOUD = new Set(["SNIPE"]);

/** Short two-tone chime via Web Audio (no asset). Best-effort; silently no-ops if blocked. */
function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* audio blocked (no gesture yet) — ignore */
  }
}

/**
 * Shared alert feed: polls /api/alerts every 30s and, when `notify` is on, raises a
 * browser Notification for alerts newer than the last one we popped (deduped across
 * components via localStorage). The first load only sets the baseline — it never dumps
 * the whole history at you. Complements the OS-level notifier the poller fires.
 */
export function useAlerts(notify = false) {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const load = useCallback(
    () =>
      fetch("/api/alerts")
        .then((r) => r.json())
        .then((d: { alerts?: Alert[] }) => {
          const list = d.alerts ?? [];
          setAlerts(list);
          if (notify && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            const last = Number(localStorage.getItem(LS_KEY) ?? 0);
            const fresh = list.filter((a) => a.id > last);
            if (fresh.length) {
              localStorage.setItem(LS_KEY, String(Math.max(...fresh.map((a) => a.id))));
              if (last > 0) {
                for (const a of fresh.slice(0, 3)) {
                  new Notification(`PoE2 Flip — ${a.type}`, {
                    body: `${a.item_name ?? a.item_id}: ${a.message}${a.whisper ? "\n↳ click the alert to copy whisper" : ""}`,
                    tag: String(a.id),
                  });
                }
                // sound for time-sensitive alerts (snipes) so you catch them with the game focused
                if (fresh.some((a) => LOUD.has(a.type))) playChime();
              }
            }
          }
        })
        .catch(() => {}),
    [notify],
  );

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    const onChange = () => load();
    window.addEventListener("alerts-changed", onChange);
    return () => {
      clearInterval(id);
      window.removeEventListener("alerts-changed", onChange);
    };
  }, [load]);

  const unseen = alerts.filter((a) => a.seen === 0).length;

  const markAllSeen = useCallback(() => {
    const ids = alerts.filter((a) => a.seen === 0).map((a) => a.id);
    if (ids.length === 0) return;
    fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then(() => setAlerts((prev) => prev.map((a) => ({ ...a, seen: 1 }))))
      .then(() => window.dispatchEvent(new Event("alerts-changed")));
  }, [alerts]);

  return { alerts, unseen, markAllSeen, load };
}

/** Ask the browser for notification permission (must be called from a user gesture). */
export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}
