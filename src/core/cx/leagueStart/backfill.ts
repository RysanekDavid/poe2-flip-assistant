import { CX_HOUR_SECONDS, cxLeagues, isPrivateLeague, previousCompletedHour, type CxDigest } from "../../../api/cxClient";
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
import { CX_MAX_FETCHES_PER_RUN, CX_REQUEST_GAP_MS, LIVE_HISTORY_SOURCES, type CxHistorySources } from "../cxIngest";
import { modelParams } from "../cxMarketModel";
import { DayFolder, sampleHours, SAMPLES_PER_DAY } from "./dayFold";
import { isPermanentLeague } from "./signals";
import { anchorHourOf, planStartSearch } from "./startSearch";

/**
 * League-start backfill: date every challenge league's start from GGG's public digest archive,
 * then fold its first `config.leagueStart.days` days into cx_start_days, sampled hours only.
 *
 * Probed 2026-09-29: the archive keeps challenge-league markets for ended leagues too (Fate of
 * the Vaal mid-league: 1042 markets), so past starts are recoverable — and a brand-new league
 * is recorded from its first hour, because its early hours stay in the archive for us to fetch.
 *
 * Budget: ≤ CX_MAX_FETCHES_PER_RUN digests per poll cycle, CX_REQUEST_GAP_MS apart, shared by
 * dating and folding. A day is folded only once all its sampled hours are published, and only
 * whole — a failure mid-day stores nothing and the day is retried after a back-off.
 */

const RETRY_AFTER_MS = 30 * 60 * 1000;
const WARN_EVERY_MS = 6 * 60 * 60 * 1000;

export interface LeagueStartSyncResult {
  fetched: number;
  failed: number;
  startsFound: string[];
  daysStored: number;
  /** Leagues whose start could not be dated (reason logged). */
  undated: string[];
  lastError: string | null;
}

/** Request hour → public leagues its digest lists (dating probes only; small and bounded). */
const presence = new Map<number, Set<string>>();
/** "hour" or "league|day" → earliest retry after a failure. */
const retryAt = new Map<string, number>();
const warnedAt = new Map<string, number>();

/** Forget cached probes, back-offs and warning throttles — test fixtures only. */
export function resetLeagueStartState(): void {
  presence.clear();
  retryAt.clear();
  warnedAt.clear();
}

interface Run {
  sources: CxHistorySources;
  nowMs: number;
  newestHour: number;
  budget: number;
  result: LeagueStartSyncResult;
}

/** Leagues a start can be dated for: registry base names, never permanent or private ones. */
export function startCandidates(): Array<{ league: string; anchorHour: number }> {
  return registryLeagues()
    .filter((r) => !isPermanentLeague(r.league) && !isPrivateLeague(r.league))
    .map((r) => ({ league: r.league, anchorHour: anchorHourOf(r.firstSeenAt) }));
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** One digest, budget and politeness gap applied. Null (with the failure recorded) on error. */
async function fetchDigest(run: Run, hour: number, retryKey: string): Promise<CxDigest | null> {
  if (run.result.fetched > 0) await run.sources.sleep(CX_REQUEST_GAP_MS);
  run.result.fetched++;
  run.budget--;
  try {
    const digest = await run.sources.digestAt(hour);
    if (digest.next_change_id !== hour + CX_HOUR_SECONDS) throw new Error(`asked for hour ${hour}, digest is ${digest.next_change_id}`);
    if (digest.markets.length === 0) throw new Error(`digest ${hour} has no markets`);
    return digest;
  } catch (err: unknown) {
    run.result.failed++;
    run.result.lastError = errText(err);
    retryAt.set(retryKey, run.nowMs + RETRY_AFTER_MS);
    console.warn(`[league-start] digest ${hour} failed: ${run.result.lastError}`);
    return null;
  }
}

const backedOff = (key: string, nowMs: number): boolean => nowMs < (retryAt.get(key) ?? -Infinity);

function knownFor(league: string): Map<number, boolean> {
  const out = new Map<number, boolean>();
  for (const [hour, listed] of presence) out.set(hour, listed.has(league));
  return out;
}

function warnThrottled(league: string, message: string, nowMs: number): void {
  if (nowMs - (warnedAt.get(league) ?? -Infinity) < WARN_EVERY_MS) return;
  warnedAt.set(league, nowMs);
  console.warn(`[league-start] "${league}": ${message}`);
}

/** Date one league's start as far as this run's budget allows. */
async function dateStart(run: Run, league: string, anchorHour: number): Promise<void> {
  while (run.budget > 0) {
    const step = planStartSearch(knownFor(league), anchorHour, run.newestHour);
    if (step.kind === "found") {
      recordStartHour(league, step.startHour);
      run.result.startsFound.push(league);
      console.log(`[league-start] "${league}" started trading at ${new Date(step.startHour * 1000).toISOString()}`);
      return;
    }
    if (step.kind === "wait") return;
    if (step.kind === "not-found") {
      run.result.undated.push(league);
      warnThrottled(league, `start not dated — ${step.reason}`, run.nowMs);
      return;
    }
    if (backedOff(String(step.hour), run.nowMs)) return;
    const digest = await fetchDigest(run, step.hour, String(step.hour));
    if (digest == null) return;
    presence.set(step.hour, new Set(cxLeagues(digest)));
  }
}

function nameNewItems(ids: readonly string[], sources: CxHistorySources): void {
  const known = namedCxItemIds();
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) upsertCxItemNames(sources.resolveNames(unknown));
}

/** Fetch and store one whole day. False when it could not (not published, backed off, failed). */
async function foldDay(run: Run, meta: LeagueStartMeta): Promise<boolean> {
  const day = meta.daysAvailable;
  const hours = sampleHours(meta.startHour, day);
  const key = `${meta.league}|${day}`;
  if (hours[hours.length - 1]! > run.newestHour || run.budget < hours.length || backedOff(key, run.nowMs)) return false;
  const folder = new DayFolder(meta.league, day, modelParams());
  for (const hour of hours) {
    const digest = await fetchDigest(run, hour, key);
    if (digest == null) return false;
    folder.add(hour, digest);
  }
  nameNewItems(folder.items(), run.sources);
  const { rows, sampled } = folder.result();
  storeStartDay(meta.league, day, rows, sampled, { curveDays: config.leagueStart.days, nowMs: run.nowMs });
  run.result.daysStored++;
  return true;
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
  const result: LeagueStartSyncResult = { fetched: 0, failed: 0, startsFound: [], daysStored: 0, undated: [], lastError: null };
  const run: Run = { sources, nowMs, newestHour: previousCompletedHour(nowMs), budget, result };
  for (const { league, anchorHour } of startCandidates()) {
    if (run.budget <= 0) break;
    if (getStartMeta(league) == null) await dateStart(run, league, anchorHour);
  }
  for (const meta of listStartMeta()) {
    let current: LeagueStartMeta | null = meta;
    while (current != null && current.daysAvailable < config.leagueStart.days && run.budget >= SAMPLES_PER_DAY) {
      if (!(await foldDay(run, current))) break;
      current = getStartMeta(meta.league);
    }
  }
  if (result.daysStored > 0 || result.startsFound.length > 0) {
    console.log(`[league-start] ${result.startsFound.length} start(s) dated, ${result.daysStored} day(s) folded, ${result.fetched} digest(s)`);
  }
  return result;
}

/** Heartbeat verdict: red when digests failed and nothing moved forward. */
export function leagueStartProblem(r: LeagueStartSyncResult): string | null {
  if (r.failed === 0 || r.daysStored > 0 || r.startsFound.length > 0) return null;
  return `${r.failed} of ${r.fetched} digest(s) failed, nothing stored${r.lastError ? `: ${r.lastError}` : ""}`;
}
