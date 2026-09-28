"use client";

import { freshForNotify, maxAlertId, type Alert } from "../../lib/alertCenter";

const LS_KEY = "lastAlertNotifiedId";

/** Short two-tone chime via Web Audio (no asset). Autoplay policy blocks it before a user gesture. */
export function playChime(): void {
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  try {
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
    window.setTimeout(() => {
      ctx.close().catch((e: unknown) => console.warn("[alerts] closing the chime audio context failed", e));
    }, 600);
  } catch (e) {
    console.warn("[alerts] chime blocked (no user gesture yet?)", e);
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Current permission, or "unsupported" when the browser has no Notification API. */
export function notifyPermission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

/** Ask the browser for notification permission (must be called from a user gesture). */
export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/** Per-type browser channels from the user's routing table (see /api/alerts). */
export interface BrowserChannels {
  popupTypes: readonly string[];
  soundTypes: readonly string[];
}

function popup(a: Alert): void {
  new Notification(`PoE2 Flip — ${a.type}`, {
    body: `${a.item_name ?? a.item_id}: ${a.message}${a.whisper ? "\n↳ whisper + trade link in the Alerts tab" : ""}`,
    tag: String(a.id),
  });
}

/**
 * React to alerts newer than the last one this browser reacted to (deduped across tabs via
 * localStorage): a desktop popup for types with `popup` on, one chime if any has `sound` on.
 * The first load only sets the baseline — it never dumps history at you. The two channels are
 * independent, so the chime still plays when popups are denied. Complements Discord, which is
 * the channel that reaches a fullscreen game.
 */
export function raiseBrowserNotifications(alerts: readonly Alert[], channels: BrowserChannels): void {
  const last = Number(localStorage.getItem(LS_KEY) ?? 0);
  const newest = maxAlertId(alerts);
  if (newest <= last) return;
  localStorage.setItem(LS_KEY, String(newest));
  if (last === 0) return;
  if (notifyPermission() === "granted") {
    for (const a of freshForNotify(alerts, last, channels.popupTypes).slice(0, 3)) popup(a);
  }
  if (freshForNotify(alerts, last, channels.soundTypes).length > 0) playChime();
}
