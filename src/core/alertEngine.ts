import { insertAlert, lastAlert, hasAlertEver } from "../db/alertQueries";
import { config } from "../config/env";
import { SnipeCardSchema, type SnipeCard } from "../lib/snipeCard";
import { refireDecision } from "./alertRefire";

export type AlertType =
  | "SPREAD"
  | "SPIKE"
  | "TREND_REVERSAL"
  | "VOLUME"
  | "TREND"
  | "SNIPE"
  | "CRAFT_MARGIN"
  | "LEAGUE" // new league detected / league switched — fired by leagueAlerts, not this engine
  | "PATCH"; // official patch notes + AI summary — fired by the patch-summary worker, not this engine

export interface AlertInput {
  type: AlertType;
  itemId: string;
  itemName: string;
  message: string;
  value: number;
  threshold: number;
  whisper?: string | null; // in-game whisper to copy (snipe alerts)
  link?: string | null; // trade-site deep link
  details?: SnipeCard | null; // item card (SNIPE) — validated again here, it is persisted as-is
  // "once": alert at most once EVER per itemId+type — for listing-level snipes, where the
  // cooldown just re-pinged the same unsold bait every hour (Sol Trail ×12).
  // "material" (default): see core/alertRefire — a repeat needs a real move or a quiet day.
  dedupe?: "material" | "once";
  signal?: string; // TREND call (BUY/SELL): a direction change always re-alerts
}

function isDuplicate(userId: number, a: AlertInput): boolean {
  if (a.dedupe === "once") return hasAlertEver(userId, a.itemId, a.type);
  const policy = { cooldownMin: config.alertCooldownMin, ...config.alertRefire };
  return refireDecision(lastAlert(userId, a.itemId, a.type), { value: a.value, signal: a.signal }, policy) !== "fire";
}

/**
 * Persist an alert; returns whether it was stored. Popups are the browser's job
 * (components/alerts/browserNotify), which honours each user's per-type popup switches.
 *
 * `league` is the market the DETECTING pipeline ran in, passed by the caller — the multi-league
 * poller alerts per league, while the shared trade2 scanners (autosnipe, craft margins)
 * only ever run in the app default. Reading the recipient's current view here would file a
 * default-league snipe under whatever league they happened to be looking at.
 *
 * Deduped per user + item + type (see AlertInput.dedupe). DB failures propagate.
 *
 * Discord delivery is not wired here: the alerts insert trigger (db/notifyMigrations) queues it
 * per the recipient's routing prefs, and the poller's drainer (core/notify) sends it.
 */
export function fireAlert(userId: number, league: string, a: AlertInput): boolean {
  if (isDuplicate(userId, a)) return false;
  insertAlert(userId, league, {
    type: a.type,
    itemId: a.itemId,
    itemName: a.itemName,
    message: a.message,
    value: a.value,
    threshold: a.threshold,
    whisper: a.whisper,
    link: a.link,
    details: a.details == null ? null : JSON.stringify(SnipeCardSchema.parse(a.details)),
  });
  return true;
}
