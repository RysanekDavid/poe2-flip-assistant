import { CX_HOUR_SECONDS, cxLeagues, isPrivateLeague, previousCompletedHour } from "../../../api/cxClient";
import { config } from "../../../config/env";
import { namedCxItemIds, upsertCxItemNames } from "../../../db/cxMarketQueries";
import {
  getStartMeta,
  listStartMeta,
  recordStartHour,
  registryLeagues,
  storeStartDay,
  type LeagueStartMeta,
} from "../../../db/cxStartQueries";
import { CX_MAX_FETCHES_PER_RUN, LIVE_HISTORY_SOURCES, type CxHistorySources } from "../cxIngest";
import { modelParams } from "../cxMarketModel";
import { DayFolder, sampleHours } from "./dayFold";
import { fetchDigest, isDue, isExhausted, MAX_FAILURES, resetFetchState, type FetchRun } from "./digestFetch";
import { HORIZON_LONG, isPermanentLeague } from "./signals";
import { anchorHourOf, planStartSearch } from "./startSearch";

/**
 * League-start backfill: date every challenge league's start from GGG's public digest archive,
 * then fold its first `foldDays()` days into cx_start_days, sampled hours only.
 *
 * Probed 2026-09-29: the archive keeps challenge-league markets for ended leagues too (Fate of
 * the Vaal mid-league: 1042 markets), so past starts are recoverable — and a brand-new league
 * is recorded from its first hour, because its early hours stay in the archive for us to fetch.
 *
 * Budget: ≤ CX_MAX_FETCHES_PER_RUN digests per poll cycle, 2 s apart, shared by dating and
 * folding. Only SETTLED hours are asked (one hour behind the newest completed one), so an empty
 * answer is the archive's final word, not "not published yet". A day is folded once all its
 * sampled hours are settled; a sample the archive has nothing for, or that failed MAX_FAILURES
 * times, is folded as a 0-market hour — the day's point then has fewer hours and MIN_POINT_HOURS
 * decides whether it still counts.
 */

const WARN_EVERY_MS = 6 * 60 * 60 * 1000;
const SETTLE_HOURS = 1;
/** Dating probes cached per process; one hour of one digest is a handful of league names. */
const PRESENCE_CAP = 5000;

/**
 * Past leagues are folded HORIZON_LONG days beyond the active window, so a day-13 row still has a
 * real 14-day follow-up; the live league keeps recording through the same length for the next one.
 */
export const foldDays = (): number => config.leagueStart.days + HORIZON_LONG;

export interface UndatedLeague {
  league: string;
  reason: string;
}

export interface LeagueStartSyncResult {
  fetched: number;
  failed: number;
  startsFound: string[];
  daysStored: number;
  /** Leagues whose start could not be dated this run. */
  undated: UndatedLeague[];
  /** The subset not reported to the heartbeat before (this process). */
  newlyUndated: UndatedLeague[];
  lastError: string | null;
}

/** Request hour → public leagues its digest lists (dating probes only). */
const presence = new Map<number, Set<string>>();
const warnedAt = new Map<string, number>();
const reportedUndated = new Set<string>();

/** Forget cached probes, back-offs and warning throttles — test fixtures only. */
export function resetLeagueStartState(): void {
  presence.clear();
  warnedAt.clear();
  reportedUndated.clear();
  resetFetchState();
}

interface Run extends FetchRun {
  settledHour: number;
  result: LeagueStartSyncResult;
}

/** Leagues a start can be dated for: registry base names, never permanent or private ones. */
export function startCandidates(): Array<{ league: string; anchorHour: number }> {
  return registryLeagues()
    .filter((r) => !isPermanentLeague(r.league) && !isPrivateLeague(r.league))
    .map((r) => ({ league: r.league, anchorHour: anchorHourOf(r.firstSeenAt) }));
}

function knownFor(league: string): Map<number, boolean> {
  const out = new Map<number, boolean>();
  for (const [hour, listed] of presence) out.set(hour, listed.has(league));
  return out;
}

function remember(hour: number, listed: Set<string>): void {
  presence.set(hour, listed);
  if (presence.size > PRESENCE_CAP) presence.delete(presence.keys().next().value!);
}

function markUndated(run: Run, league: string, reason: string): void {
  const entry = { league, reason };
  run.result.undated.push(entry);
  if (!reportedUndated.has(league)) {
    reportedUndated.add(league);
    run.result.newlyUndated.push(entry);
  }
  if (run.nowMs - (warnedAt.get(league) ?? -Infinity) < WARN_EVERY_MS) return;
  warnedAt.set(league, run.nowMs);
  console.warn(`[league-start] "${league}": start not dated — ${reason}`);
}

/** Date one league's start as far as this run's budget allows. */
async function dateStart(run: Run, league: string, anchorHour: number): Promise<void> {
  while (run.budget > 0) {
    const step = planStartSearch(knownFor(league), anchorHour, run.settledHour);
    if (step.kind === "found") {
      recordStartHour(league, step.startHour);
      run.result.startsFound.push(league);
      console.log(`[league-start] "${league}" started trading at ${new Date(step.startHour * 1000).toISOString()}`);
      return;
    }
    if (step.kind === "wait") return;
    if (step.kind === "not-found") return markUndated(run, league, step.reason);
    if (isExhausted(step.hour)) return markUndated(run, league, `probe hour ${step.hour} failed ${MAX_FAILURES} times`);
    if (!isDue(step.hour, run.nowMs)) return;
    const got = await fetchDigest(run, step.hour);
    if (got.kind === "failed") return;
    remember(step.hour, got.kind === "ok" ? new Set(cxLeagues(got.digest)) : new Set());
  }
}

function nameNewItems(ids: readonly string[], sources: CxHistorySources): void {
  const known = namedCxItemIds();
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) upsertCxItemNames(sources.resolveNames(unknown));
}

/** Fetch and store one day. False when it could not yet (not settled, backed off, budget, a fresh failure). */
async function foldDay(run: Run, meta: LeagueStartMeta): Promise<boolean> {
  const day = meta.daysAvailable;
  const hours = sampleHours(meta.startHour, day);
  if (hours[hours.length - 1]! > run.settledHour) return false;
  const toFetch = hours.filter((h) => !isExhausted(h));
  if (toFetch.some((h) => !isDue(h, run.nowMs)) || run.budget < toFetch.length) return false;
  const folder = new DayFolder(meta.league, day, modelParams());
  for (const hour of hours) {
    if (isExhausted(hour)) {
      folder.addMissing(hour);
      continue;
    }
    const got = await fetchDigest(run, hour);
    if (got.kind === "ok") folder.add(hour, got.digest);
    else if (got.kind === "empty" || isExhausted(hour)) folder.addMissing(hour);
    else return false; // retried after the back-off; nothing of this day is stored meanwhile
  }
  nameNewItems(folder.items(), run.sources);
  const { rows, sampled } = folder.result();
  storeStartDay(meta.league, day, rows, sampled, { curveDays: foldDays(), nowMs: run.nowMs });
  run.result.daysStored++;
  return true;
}

function newResult(): LeagueStartSyncResult {
  return { fetched: 0, failed: 0, startsFound: [], daysStored: 0, undated: [], newlyUndated: [], lastError: null };
}

/**
 * Poller hook. Dates undated leagues first (a few probes each), then folds days oldest-league
 * first so past curves complete before the live league's newest day. Never throws on a CDN
 * failure — failures are counted for the heartbeat; a DB error does throw (that is a bug).
 */
export async function syncLeagueStart(
  sources: CxHistorySources = LIVE_HISTORY_SOURCES,
  nowMs: number = Date.now(),
  budget: number = CX_MAX_FETCHES_PER_RUN,
): Promise<LeagueStartSyncResult> {
  const result = newResult();
  const settledHour = previousCompletedHour(nowMs) - SETTLE_HOURS * CX_HOUR_SECONDS;
  const run: Run = { sources, nowMs, budget, fetched: 0, failed: 0, lastError: null, settledHour, result };
  for (const { league, anchorHour } of startCandidates()) {
    if (run.budget <= 0) break;
    if (getStartMeta(league) == null) await dateStart(run, league, anchorHour);
  }
  for (const meta of listStartMeta()) {
    let current: LeagueStartMeta | null = meta;
    while (current != null && current.daysAvailable < foldDays() && run.budget > 0) {
      if (!(await foldDay(run, current))) break;
      current = getStartMeta(meta.league);
    }
  }
  Object.assign(result, { fetched: run.fetched, failed: run.failed, lastError: run.lastError });
  if (result.daysStored > 0 || result.startsFound.length > 0) {
    console.log(`[league-start] ${result.startsFound.length} start(s) dated, ${result.daysStored} day(s) folded, ${result.fetched} digest(s)`);
  }
  return result;
}

/**
 * Heartbeat verdict. Red while digests fail and nothing moves forward. A league that cannot be
 * dated is reported ONCE (the next clean run turns the row green again, the text stays readable
 * as its last error) — an ancient seeded league before the archive's depth is a fact, not an outage.
 */
export function leagueStartProblem(r: LeagueStartSyncResult): string | null {
  const parts: string[] = [];
  if (r.failed > 0 && r.daysStored === 0 && r.startsFound.length === 0) {
    parts.push(`${r.failed} of ${r.fetched} digest(s) failed, nothing stored${r.lastError ? `: ${r.lastError}` : ""}`);
  }
  if (r.newlyUndated.length > 0) {
    parts.push(`not dated (reported once): ${r.newlyUndated.map((u) => `${u.league} — ${u.reason}`).join("; ")}`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
}
