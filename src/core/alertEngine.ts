import { insertAlert, lastAlert, hasAlertEver, pruneAlerts } from "../db/alertQueries";
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
  // "material" (default): the core/alertRefire gate against this user's last alert for the same
  // item+type IN THIS LEAGUE — past ALERT_COOLDOWN_MIN a repeat fires only when the value rose
  // ALERT_REFIRE_RISE_PCT over the last alerted one or ALERT_REFIRE_QUIET_HOURS have passed. That
  // applies to TREND/SPIKE re-entries too: an item flapping in and out of a state is not news.
  dedupe?: "material" | "once";
  signal?: string; // TREND call (BUY/SELL): a BUY↔SELL change always fires, whatever the value
}

function isDuplicate(userId: number, league: string, a: AlertInput): boolean {
  if (a.dedupe === "once") return hasAlertEver(userId, a.itemId, a.type);
  const policy = { cooldownMin: config.alertCooldownMin, ...config.alertRefire };
  const last = lastAlert(userId, league, a.itemId, a.type);
  return refireDecision(last, { value: a.value, signal: a.signal }, policy) !== "fire";
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
 * Deduped per user + item + type, the material gate also per league (see AlertInput.dedupe). DB
 * failures propagate.
 *
 * Discord delivery is not wired here: the alerts insert trigger (db/notifyMigrations) queues it
 * per the recipient's routing prefs, and the poller's drainer (core/notify) sends it.
 */
export function fireAlert(userId: number, league: string, a: AlertInput): boolean {
  if (isDuplicate(userId, league, a)) return false;
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

/** Alert retention runs hourly, not every 5-minute poll — a day-granular cutoff gains nothing faster. */
const PRUNE_EVERY_MS = 60 * 60 * 1000;
let lastPruneAt = -Infinity;

/**
 * Prune the alert feed per config.alertRetention, at most once an hour (`force` bypasses that for
 * tests). Returns rows removed, or null when this call was skipped.
 */
export function pruneAlertFeed(nowMs: number = Date.now(), force = false): number | null {
  if (!force && nowMs - lastPruneAt < PRUNE_EVERY_MS) return null;
  lastPruneAt = nowMs;
  return pruneAlerts(config.alertRetention.days, config.alertRetention.unseenKeepDays);
}
