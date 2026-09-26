import notifier from "node-notifier";
import { insertAlert, hasRecentAlert, hasAlertEver } from "../db/alertQueries";
import { config } from "../config/env";

export type AlertType =
  | "SPREAD"
  | "SPIKE"
  | "TREND_REVERSAL"
  | "VOLUME"
  | "TREND"
  | "SNIPE"
  | "CRAFT_BASE"
  | "CRAFT_MARGIN"
  | "RESELL"
  | "LEAGUE"; // new league detected / league switched — fired by leagueAlerts, not this engine

/**
 * Persist an alert and fire a desktop notification.
 *
 * `league` is the market the DETECTING pipeline ran in, passed by the caller — the multi-league
 * poller alerts per league, while the shared trade2 scanners (hunts, autosnipe, craft margins)
 * only ever run in the app default. Reading the recipient's current view here would file a
 * default-league snipe under whatever league they happened to be looking at.
 *
 * Throttled: the same item+type won't re-alert within ALERT_COOLDOWN_MIN (default
 * 60m) — otherwise a still-profitable item would ping every poll (5m). Desktop
 * notif is best-effort; DB failures propagate (we want to know if logging breaks).
 */
export function fireAlert(
  userId: number,
  league: string,
  a: {
    type: AlertType;
    itemId: string;
    itemName: string;
    message: string;
    value: number;
    threshold: number;
    whisper?: string | null; // in-game whisper to copy (snipe alerts)
    link?: string | null; // trade-site deep link
    // "once": alert at most once EVER per itemId+type — for listing-level snipes, where the
    // cooldown just re-pinged the same unsold bait every hour (Sol Trail ×12).
    dedupe?: "cooldown" | "once";
  },
): void {
  const seen =
    a.dedupe === "once"
      ? hasAlertEver(userId, a.itemId, a.type)
      : hasRecentAlert(userId, a.itemId, a.type, config.alertCooldownMin);
  if (seen) return;

  insertAlert(userId, league, {
    type: a.type,
    itemId: a.itemId,
    itemName: a.itemName,
    message: a.message,
    value: a.value,
    threshold: a.threshold,
    whisper: a.whisper,
    link: a.link,
  });

  if (!config.desktopNotify) return;
  try {
    // Callback form: on a headless box the backend fails ASYNCHRONOUSLY, and without a callback
    // node-notifier surfaces that as an unhandled error (same fix as leagueAlerts).
    notifier.notify({ title: `PoE2 Flip — ${a.type}`, message: `${a.itemName}: ${a.message}`, sound: true }, (err) => {
      if (err) console.warn(`desktop notify failed: ${err.message}`);
    });
  } catch (err) {
    // Notif backend missing (e.g. headless) — log, don't throw.
    console.warn(`desktop notify failed: ${err instanceof Error ? err.message : err}`);
  }
}
