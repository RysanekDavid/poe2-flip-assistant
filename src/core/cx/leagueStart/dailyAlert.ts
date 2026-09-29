import { fireLeagueAlert } from "../../leagueAlerts";
import { isPrivateLeague } from "../../../api/cxClient";
import { baseLeagueName } from "../../../db/leagueQueries";
import type { LeagueStartResponse } from "../../../lib/leagueStartContract";
import { isPermanentLeague, SELL_BELOW } from "./signals";
import { loadLeagueStartView } from "./view";

/**
 * One LEAGUE alert per league-day while league-start mode is on and past leagues say something
 * is about to drop. The alert id carries the (base) league and the day, so fireLeagueAlert's
 * one-shot guard makes this safe to call every poll cycle.
 */

/** `day` is the 0-based league day; only the message shows it 1-based. */
export const leagueStartAlertId = (baseLeague: string, day: number): string => `league-start:${baseLeague}:${day}`;

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
    `League start day ${view.day + 1} of ${view.curveDays}: ${sell.length} item(s) fell ≥${drop}% over the next 7 days at this point of past leagues — ` +
    `sell first: ${top}. Based on ${n} past league start${n === 1 ? "" : "s"}.`
  );
}

/**
 * Fire today's alert once per BASE league among the polled ones: "X" and "HC X" share one start
 * and one set of curves, so they share one alert, tagged with the base league.
 * Returns the base leagues alerted.
 */
export function fireLeagueStartAlerts(leagues: readonly string[], nowMs: number = Date.now()): string[] {
  const bases = [...new Set(leagues.map(baseLeagueName))];
  const fired: string[] = [];
  for (const base of bases) {
    if (isPermanentLeague(base) || isPrivateLeague(base)) continue;
    const view = loadLeagueStartView(base, nowMs);
    const message = dailyMessage(view);
    if (message == null || view.day == null) continue;
    if (fireLeagueAlert(base, message, undefined, leagueStartAlertId(base, view.day)) > 0) fired.push(base);
  }
  return fired;
}
