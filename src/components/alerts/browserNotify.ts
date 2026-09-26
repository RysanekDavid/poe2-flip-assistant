"use client";

import { freshForNotify, maxAlertId, type Alert } from "../../lib/alertCenter";

const LS_KEY = "lastAlertNotifiedId";

/** High-priority types get a sound — a snipe is time-sensitive. */
const LOUD = new Set(["SNIPE"]);

/** Short two-tone chime via Web Audio (no asset). Autoplay policy blocks it before a user gesture. */
function playChime(): void {
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

/** Ask the browser for notification permission (must be called from a user gesture). */
export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Pop a browser notification for alerts newer than the last one we popped (deduped across tabs
 * via localStorage). The first load only sets the baseline — it never dumps history at you.
 * Muted types never pop. Complements Discord, which is the channel that reaches a fullscreen game.
 */
export function raiseBrowserNotifications(alerts: readonly Alert[], muted: readonly string[]): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const last = Number(localStorage.getItem(LS_KEY) ?? 0);
  const newest = maxAlertId(alerts);
  if (newest <= last) return;
  localStorage.setItem(LS_KEY, String(newest));
  if (last === 0) return;
  const fresh = freshForNotify(alerts, last, muted);
  for (const a of fresh.slice(0, 3)) {
    new Notification(`PoE2 Flip — ${a.type}`, {
      body: `${a.item_name ?? a.item_id}: ${a.message}${a.whisper ? "\n↳ click the alert to copy whisper" : ""}`,
      tag: String(a.id),
    });
  }
  if (fresh.some((a) => LOUD.has(a.type))) playChime();
}
