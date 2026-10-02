import type Database from "better-sqlite3";
import { getDb } from "../db/database";
import { markLeagueAlerted, readLeagueState, recordLeagueDetection } from "../db/leagueQueries";
import { fireLeagueAlert } from "../core/leagueAlerts";
import { deriveCurrentLeague, deriveLeagueStart, type DerivedLeague } from "../core/leagueDerivation";
import { getLeagueList, type LeagueListSnapshot } from "../core/leagueList";
import { getDefaultLeague } from "../core/leagueState";
import { withHeartbeat } from "../core/heartbeat";

/** A new PoE2 league drops a few times a year — 6h is timely without being noise. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Evidence name → what it reported (null = it could not tell us). Stored as league_state.sources_json. */
export type LeagueReports = Record<string, string | null>;

export interface LeagueDetection {
  reports: LeagueReports;
  /** The derived current challenge league, or null without evidence. */
  agreed: string | null;
}

/**
 * The two inputs, both from GGG and injectable so tests touch neither the network nor the CX
 * tables: the trade2 league list (does the league exist?) and our stored exchange activity
 * (where are players actually trading?).
 */
export interface LeagueSources {
  leagueList: () => Promise<LeagueListSnapshot>;
  derive: (listed: readonly string[]) => DerivedLeague | null;
  start: (league: string) => number | null;
}

const LIVE_SOURCES: LeagueSources = {
  leagueList: () => getLeagueList(),
  derive: (listed) => deriveCurrentLeague(listed),
  start: (league) => deriveLeagueStart(league),
};

function describeList(list: LeagueListSnapshot): string {
  const age = new Date(list.fetchedAt).toISOString();
  return `${list.names.length} leagues, fetched ${age}${list.staleReason ? ` (STALE: ${list.staleReason})` : ""}`;
}

function describeDerived(derived: DerivedLeague, startHour: number | null): string {
  const start = startHour == null ? "start before our exchange record" : `first traded ${new Date(startHour * 1000).toISOString()}`;
  return `${derived.league}: ${Math.round(derived.divineVolume)} Divine over ${derived.hours} digest hour(s), ${start}`;
}

/**
 * Which league is current: GGG's list says it exists, our CX history says it is where the
 * trading is. Throws only when the list itself is unavailable with nothing cached.
 */
export async function detectCurrentLeague(sources: LeagueSources = LIVE_SOURCES): Promise<LeagueDetection> {
  const list = await sources.leagueList();
  const derived = sources.derive(list.names);
  return {
    reports: {
      trade2: describeList(list),
      cxVolume: derived == null ? null : describeDerived(derived, sources.start(derived.league)),
    },
    agreed: derived?.league ?? null,
  };
}

/**
 * One detection pass. A list outage with nothing cached is reported (heartbeat + log) and the
 * pass gives up until the next tick; it never stalls the poller.
 */
export async function checkLeagueOnce(
  sources: LeagueSources = LIVE_SOURCES,
  database: Database.Database = getDb(),
): Promise<{ agreed: string | null; alerted: boolean }> {
  let detection: LeagueDetection;
  try {
    detection = await detectCurrentLeague(sources);
  } catch (err) {
    console.warn(`[league] detection failed: ${err instanceof Error ? err.message : err}`);
    return { agreed: null, alerted: false };
  }

  if (detection.agreed == null) {
    console.warn(`[league] no exchange activity for any listed challenge league — ${JSON.stringify(detection.reports)}`);
    return { agreed: null, alerted: false };
  }

  recordLeagueDetection(detection.agreed, detection.reports, database);
  const tracked = getDefaultLeague(database);
  if (detection.agreed.toLowerCase() === tracked.toLowerCase()) return { agreed: detection.agreed, alerted: false };

  // Dedupe: the same news repeats every 6h until someone switches, so alert once per league.
  const alreadyAlerted = readLeagueState(database)?.alerted_league;
  if (alreadyAlerted != null && alreadyAlerted.toLowerCase() === detection.agreed.toLowerCase()) {
    return { agreed: detection.agreed, alerted: false };
  }

  fireLeagueAlert(
    detection.agreed,
    `New PoE2 league detected: ${detection.agreed} — app is tracking ${tracked}`,
    database,
  );
  markLeagueAlerted(detection.agreed, database);
  console.log(`[league] new league detected: ${detection.agreed} (tracking ${tracked})`);
  return { agreed: detection.agreed, alerted: true };
}

/**
 * Live sources that also report a failed or stale list — checkLeagueOnce deliberately survives
 * them, so the heartbeat would otherwise record "ok" while detection runs on an old list.
 */
function observedSources(onProblem: (message: string) => void): LeagueSources {
  return {
    ...LIVE_SOURCES,
    leagueList: async () => {
      try {
        const list = await LIVE_SOURCES.leagueList();
        if (list.staleReason != null) onProblem(`trade2 leagues stale since ${new Date(list.fetchedAt).toISOString()}: ${list.staleReason}`);
        return list;
      } catch (err: unknown) {
        onProblem(`trade2 leagues: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    },
  };
}

/** Start the 6h detection loop. Returns a stop handle, like the patch-notes watcher. */
export function startLeagueWatcher(): () => void {
  console.log("[league] checking GGG's trade2 league list + exchange activity for the current league every 6h");
  let running = false;
  const run = (): void => {
    if (running) return;
    running = true;
    const problems: string[] = [];
    const sources = observedSources((m) => problems.push(m));
    const problem = (): string | null => (problems.length > 0 ? problems.join("; ") : null);
    void withHeartbeat("league-watch", "", () => checkLeagueOnce(sources), { problem })
      .catch((err: unknown) => {
        // checkLeagueOnce survives source failures itself; anything here is a DB/programming bug.
        console.error("[league] check failed:", err instanceof Error ? err.message : err);
      })
      .finally(() => {
        running = false;
      });
  };
  run();
  const timer = setInterval(run, CHECK_INTERVAL_MS);
  return () => clearInterval(timer);
}
