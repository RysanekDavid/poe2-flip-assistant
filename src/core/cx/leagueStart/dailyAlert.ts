import { fireLeagueAlert } from "../../leagueAlerts";
import { isPrivateLeague } from "../../../api/cxClient";
import type { LeagueStartResponse } from "../../../lib/leagueStartContract";
import { isPermanentLeague, SELL_BELOW } from "./signals";
import { loadLeagueStartView } from "./view";

/**
 * One LEAGUE alert per league-day while league-start mode is on and past leagues say something
 * is about to drop. The alert id carries the day, so fireLeagueAlert's one-shot guard makes this
 * safe to call every poll cycle.
 */

export const leagueStartAlertId = (league: string, day: number): string => `league-start:${league}:${day}`;

/** The day's message, or null when there is nothing to act on (no alert beats a noise alert). */
export function dailyMessage(view: LeagueStartResponse): string | null {
  if (!view.active || view.day == null) return null;
  const sell = view.items.filter((i) => i.signal === "sell-now");
  if (sell.length === 0) return null;
  const drop = Math.round((1 - SELL_BELOW) * 100);
  const top = sell
    .slice(0, 3)
    .map((i) => (i.ratio7 == null ? i.name : `${i.name} ${Math.round((i.ratio7 - 1) * 100)}%`))
    .join(", ");
  const n = view.basedOn;
  return (
    `League start day ${view.day}: ${sell.length} item(s) fell ≥${drop}% over the next 7 days at this point of past leagues — ` +
    `sell first: ${top}. Based on ${n} past league start${n === 1 ? "" : "s"}.`
  );
}

/** Fire today's alert for each polled league (once per league-day). Returns leagues alerted. */
export function fireLeagueStartAlerts(leagues: readonly string[], nowMs: number = Date.now()): string[] {
  const fired: string[] = [];
  for (const league of leagues) {
    if (isPermanentLeague(league) || isPrivateLeague(league)) continue;
    const view = loadLeagueStartView(league, nowMs);
    const message = dailyMessage(view);
    if (message == null || view.day == null) continue;
    if (fireLeagueAlert(league, message, undefined, leagueStartAlertId(league, view.day)) > 0) fired.push(league);
  }
  return fired;
}
