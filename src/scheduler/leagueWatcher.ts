import type Database from "better-sqlite3";
import { fetchNinjaLeagues } from "../api/ninjaClient";
import { fetchScoutLeagues } from "../api/scoutClient";
import type { LeagueOption } from "../api/types";
import { getDb } from "../db/database";
import { markLeagueAlerted, readLeagueState, recordLeagueDetection } from "../db/leagueQueries";
import { fireLeagueAlert } from "../core/leagueAlerts";
import { clearLeagueListCache } from "../core/leagueSwitch";
import { getDefaultLeague } from "../core/leagueState";

/** A new PoE2 league drops a few times a year — 6h is timely without being noise. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Permanent/parallel leagues are never "the current challenge league". */
const PERMANENT = /\b(standard|hardcore|hc|ssf|solo self-?found|ruthless)\b/i;

/** Source name → the league it reports as current (null = it could not tell us). */
export type LeagueReports = Record<string, string | null>;

export interface LeagueDetection {
  reports: LeagueReports;
  /** The league BOTH sources named, or null when they disagreed or either one failed. */
  agreed: string | null;
}

/** The network half, injectable so tests never touch poe.ninja or poe2scout. */
export interface LeagueSources {
  scout: () => Promise<LeagueOption[]>;
  ninja: () => Promise<LeagueOption[]>;
}

const LIVE_SOURCES: LeagueSources = { scout: fetchScoutLeagues, ninja: fetchNinjaLeagues };

/** A challenge league is any league that isn't permanent/parallel (Standard, HC, SSF, Ruthless). */
function isChallengeLeague(name: string): boolean {
  return name.trim() !== "" && !PERMANENT.test(name);
}

/**
 * poe2scout's reading: every challenge league it flags `IsCurrent`. This is a SET, not one
 * league — live data flags the new league AND the one before it (Forbidden Rites and Runes of
 * Aldur were both IsCurrent in Sep 2026), so scout alone cannot say which is newest.
 */
export function currentChallengeLeagues(rows: LeagueOption[]): string[] {
  return [...new Set(rows.filter((r) => r.current === true && isChallengeLeague(r.name)).map((r) => r.name.trim()))];
}

/**
 * poe.ninja's reading: the FIRST challenge league in the list. ninja exposes no current flag at
 * all (the payload is a flat [{id,name}]), only newest-first ordering, so this is a heuristic
 * and the weaker of the two signals — which is why it never alerts on its own.
 */
export function pickOrderedLeague(rows: LeagueOption[]): string | null {
  return rows.find((r) => isChallengeLeague(r.name))?.name.trim() ?? null;
}

/**
 * The agreement rule: ninja's ordering PROPOSES the newest league, scout's IsCurrent flag must
 * CONFIRM it is live. Either source failing, or ninja naming a league scout does not flag,
 * means no agreement and no alert. The returned spelling is scout's `Value`, because that is
 * the exact string scoutClient matches leagues on.
 */
export function agreeOnLeague(candidate: string | null, confirmed: string[]): string | null {
  if (candidate == null) return null;
  return confirmed.find((name) => name.toLowerCase() === candidate.toLowerCase()) ?? null;
}

/** Ask both sources what the current league is; ninja proposes, scout confirms. */
export async function detectCurrentLeague(sources: LeagueSources = LIVE_SOURCES): Promise<LeagueDetection> {
  const [confirmed, candidate] = await Promise.all([
    askSource(sources.scout, currentChallengeLeagues),
    askSource(sources.ninja, pickOrderedLeague),
  ]);
  return {
    reports: { poe2scout: confirmed == null ? null : confirmed.join(" | ") || null, ninja: candidate },
    agreed: agreeOnLeague(candidate ?? null, confirmed ?? []),
  };
}

/**
 * One detection pass. Never throws: a source that is down, rate-limited or reshaped must not
 * stall the poller, so the whole network path logs one line and gives up until the next tick.
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
    console.warn(
      `[league] sources disagree or unavailable — ${JSON.stringify(detection.reports)}; keeping current league`,
    );
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

  // A league nobody has announced before is exactly when the memoized scout league list is
  // wrong; drop it so the header dropdown offers the new league now, not up to ten minutes later.
  clearLeagueListCache();
  fireLeagueAlert(
    detection.agreed,
    `New PoE2 league detected: ${detection.agreed} — app is tracking ${tracked}`,
    database,
  );
  markLeagueAlerted(detection.agreed, database);
  console.log(`[league] new league detected: ${detection.agreed} (tracking ${tracked})`);
  return { agreed: detection.agreed, alerted: true };
}

/** Start the 6h detection loop. Returns a stop handle, like the patch-notes watcher. */
export function startLeagueWatcher(): () => void {
  console.log("[league] checking poe.ninja + poe2scout for a new league every 6h");
  let running = false;
  const run = (): void => {
    if (running) return; // previous check still draining through the ninja limiter
    running = true;
    void checkLeagueOnce()
      .catch((err: unknown) => {
        // checkLeagueOnce swallows source failures itself; anything here is a DB/programming bug.
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

/** One source's answer, or null when it failed — a dead source must not veto the other. */
async function askSource<T>(
  fetchLeagues: () => Promise<LeagueOption[]>,
  pick: (rows: LeagueOption[]) => T,
): Promise<T | null> {
  try {
    return pick(await fetchLeagues());
  } catch (err) {
    console.warn(`[league] source unavailable: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
