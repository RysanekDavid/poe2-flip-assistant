import type Database from "better-sqlite3";
import { CX_HOUR_SECONDS } from "../api/cxClient";
import { activityBounds, leagueActivitySince, type LeagueActivityTotal } from "../db/cxActivityQueries";
import { getStartMeta } from "../db/cxStartQueries";
import { getDb } from "../db/database";
import { baseLeagueName } from "../db/leagueQueries";

/**
 * GGG publishes the league LIST (trade2 /data/leagues) but neither which league is the current
 * challenge league nor when it started. Both are DERIVED here from our stored Currency Exchange
 * history, and must be labelled as derived wherever they are shown:
 *
 * - current league: among GGG-listed softcore challenge leagues, the one with the most Divine
 *   Orbs traded on the exchange over the last ACTIVITY_WINDOW_HOURS. A new league overtakes the
 *   previous one within hours of launch, because that is where the players went.
 * - league start: the first digest hour the league traded in, when our record reaches back that
 *   far (the league-start backfill dates it from GGG's archive; else our own activity table).
 */

/** Long enough to smooth one hour's noise and a quiet night, short enough to follow a launch. */
export const ACTIVITY_WINDOW_HOURS = 24;

/** Permanent and parallel (HC/SSF/Ruthless) leagues are never "the current challenge league". */
const NOT_CHALLENGE = /\b(standard|hardcore|hc|ssf|solo self-?found|ruthless)\b/i;

/** A softcore challenge league: anything that isn't permanent or a parallel variant. */
export function isSoftcoreChallenge(name: string): boolean {
  return name.trim() !== "" && !NOT_CHALLENGE.test(name);
}

export interface DerivedLeague {
  /** GGG's spelling (trade2 id). */
  league: string;
  divineVolume: number;
  markets: number;
  hours: number;
}

/**
 * Pure: the listed softcore challenge league with the most Divine volume, ties broken by market
 * count. Null when none of them traded in the window — no evidence, no claim. Names match the
 * digest case-insensitively; the returned spelling is GGG's trade2 id.
 */
export function pickBusiestChallengeLeague(
  listed: readonly string[],
  activity: readonly LeagueActivityTotal[],
): DerivedLeague | null {
  const byName = new Map(activity.map((a) => [a.league.toLowerCase(), a]));
  let best: DerivedLeague | null = null;
  for (const league of listed) {
    if (!isSoftcoreChallenge(league)) continue;
    const a = byName.get(league.toLowerCase());
    if (a == null || !(a.divineVolume > 0 || a.markets > 0)) continue;
    const candidate: DerivedLeague = { league, divineVolume: a.divineVolume, markets: a.markets, hours: a.hours };
    if (
      best == null ||
      candidate.divineVolume > best.divineVolume ||
      (candidate.divineVolume === best.divineVolume && candidate.markets > best.markets)
    ) {
      best = candidate;
    }
  }
  return best;
}

/** First digest hour (next_change_id) inside the activity window ending at `nowMs`. */
export function activityWindowStart(nowMs: number): number {
  return Math.floor(nowMs / 1000) - ACTIVITY_WINDOW_HOURS * CX_HOUR_SECONDS;
}

/** The derived current challenge league from stored history, or null without evidence. */
export function deriveCurrentLeague(
  listed: readonly string[],
  nowMs: number = Date.now(),
  database: Database.Database = getDb(),
): DerivedLeague | null {
  return pickBusiestChallengeLeague(listed, leagueActivitySince(activityWindowStart(nowMs), database));
}

/**
 * When `league` started trading (unix seconds, start of that hour), or null when our record does
 * not reach back to it. The league-start backfill's date wins — it searched GGG's own archive;
 * otherwise our activity table counts only if it holds an EARLIER hour of some other league,
 * proving we were recording before this league appeared.
 */
export function deriveLeagueStart(league: string, database: Database.Database = getDb()): number | null {
  const dated = getStartMeta(baseLeagueName(league), database);
  if (dated != null) return dated.startHour;
  const { leagueFirst, recordFirst } = activityBounds(league, database);
  if (leagueFirst == null || recordFirst == null || leagueFirst <= recordFirst) return null;
  return leagueFirst - CX_HOUR_SECONDS; // next_change_id is the hour's END; report its start
}
