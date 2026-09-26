import { z } from "zod";
import { NOTIFY_TYPES } from "../core/notify/prefs";

/** /api/alerts payload. Parsed at the client boundary so a server shape change fails loudly. */
export const AlertSchema = z.object({
  id: z.number(),
  type: z.string(),
  item_id: z.string(),
  item_name: z.string().nullable(),
  message: z.string(),
  value: z.number().nullable(),
  threshold: z.number().nullable(),
  whisper: z.string().nullable(),
  link: z.string().nullable(),
  seen: z.number(),
  created_at: z.string(),
  foreign_league: z.string().nullable(), // set when the alert belongs to a league other than the one viewed
});
export type Alert = z.infer<typeof AlertSchema>;

export const AlertTypeCountSchema = z.object({ type: z.string(), total: z.number(), unseen: z.number() });
export type AlertTypeCount = z.infer<typeof AlertTypeCountSchema>;

export const AlertCenterSchema = z.object({
  alerts: z.array(AlertSchema),
  counts: z.array(AlertTypeCountSchema),
  tickerMuted: z.array(z.string()),
});
export type AlertCenterData = z.infer<typeof AlertCenterSchema>;

export interface AlertGroup {
  type: string;
  total: number;
  unseen: number;
  muted: boolean;
  alerts: Alert[]; // newest first; capped server-side per type
}

/** Actionable types first; unknown/legacy types after, alphabetically. */
function priority(type: string): number {
  const i = (NOTIFY_TYPES as readonly string[]).indexOf(type);
  return i === -1 ? NOTIFY_TYPES.length : i;
}

function byNewest(a: Alert, b: Alert): number {
  return b.created_at.localeCompare(a.created_at) || b.id - a.id;
}

/**
 * One group per alert type. Counts come from the server's exact per-type totals (the row list
 * is capped per type); a type present only in rows falls back to counting those rows.
 * Unmuted groups come first, then by priority, then by name.
 */
export function groupAlerts(alerts: readonly Alert[], counts: readonly AlertTypeCount[], muted: readonly string[]): AlertGroup[] {
  const mutedSet = new Set(muted);
  const groups = new Map<string, AlertGroup>();
  for (const c of counts) {
    groups.set(c.type, { type: c.type, total: c.total, unseen: c.unseen, muted: mutedSet.has(c.type), alerts: [] });
  }
  for (const a of alerts) {
    let g = groups.get(a.type);
    if (!g) {
      g = { type: a.type, total: 0, unseen: 0, muted: mutedSet.has(a.type), alerts: [] };
      groups.set(a.type, g);
    }
    g.alerts.push(a);
  }
  for (const g of groups.values()) {
    g.alerts.sort(byNewest);
    if (!counts.some((c) => c.type === g.type)) {
      g.total = g.alerts.length;
      g.unseen = g.alerts.filter((a) => a.seen === 0).length;
    }
  }
  return [...groups.values()]
    .filter((g) => g.total > 0)
    .sort((a, b) => Number(a.muted) - Number(b.muted) || priority(a.type) - priority(b.type) || a.type.localeCompare(b.type));
}

/** Badge number: unseen alerts the user has not muted. */
export function unmutedUnseen(groups: readonly AlertGroup[]): number {
  return groups.reduce((n, g) => n + (g.muted ? 0 : g.unseen), 0);
}

/** The ticker's inline strip: newest `n` alerts of unmuted types. */
export function tickerRecent(alerts: readonly Alert[], muted: readonly string[], n = 3): Alert[] {
  const mutedSet = new Set(muted);
  return alerts.filter((a) => !mutedSet.has(a.type)).sort(byNewest).slice(0, n);
}

/** Alerts newer than the last one a browser notification was raised for, muted types excluded. */
export function freshForNotify(alerts: readonly Alert[], lastNotifiedId: number, muted: readonly string[]): Alert[] {
  const mutedSet = new Set(muted);
  return alerts.filter((a) => a.id > lastNotifiedId && !mutedSet.has(a.type)).sort((a, b) => b.id - a.id);
}

/** Highest id in the feed — the browser-notify baseline, muted or not, so unmuting never replays history. */
export function maxAlertId(alerts: readonly Alert[]): number {
  return alerts.reduce((m, a) => Math.max(m, a.id), 0);
}
