import notifier from "node-notifier";
import { insertAlert, hasRecentAlert } from "../db/queries";
import { config } from "../config/env";

export type AlertType =
  | "SPREAD"
  | "SPIKE"
  | "TREND_REVERSAL"
  | "VOLUME"
  | "TREND"
  | "SNIPE"
  | "CRAFT_BASE"
  | "RESELL";

/**
 * Persist an alert and fire a desktop notification.
 *
 * Throttled: the same item+type won't re-alert within ALERT_COOLDOWN_MIN (default
 * 60m) — otherwise a still-profitable item would ping every poll (5m). Desktop
 * notif is best-effort; DB failures propagate (we want to know if logging breaks).
 */
export function fireAlert(
  userId: number,
  a: {
    type: AlertType;
    itemId: string;
    itemName: string;
    message: string;
    value: number;
    threshold: number;
    whisper?: string | null; // in-game whisper to copy (snipe alerts)
    link?: string | null; // trade-site deep link
  },
): void {
  if (hasRecentAlert(userId, a.itemId, a.type, config.alertCooldownMin)) return;

  insertAlert(userId, {
    type: a.type,
    itemId: a.itemId,
    itemName: a.itemName,
    message: a.message,
    value: a.value,
    threshold: a.threshold,
    whisper: a.whisper,
    link: a.link,
  });

  try {
    notifier.notify({
      title: `PoE2 Flip — ${a.type}`,
      message: `${a.itemName}: ${a.message}`,
      sound: true,
    });
  } catch (err) {
    // Notif backend missing (e.g. headless) — log, don't throw.
    console.warn(`desktop notify failed: ${err instanceof Error ? err.message : err}`);
  }
}
