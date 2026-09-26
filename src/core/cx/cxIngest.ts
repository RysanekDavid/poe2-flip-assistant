import {
  CX_HOUR_SECONDS,
  cxLeagues,
  fetchCxDigest,
  isPrivateLeague,
  previousCompletedHour,
  type CxDigest,
  type CxMarket,
} from "../../api/cxClient";
import { config } from "../../config/env";
import {
  ingestedCxHours,
  ingestedMarketCount,
  namedCxItemIds,
  pruneCxHistory,
  storeCxHour,
  upsertCxItemNames,
  type CxMarketRow,
} from "../../db/cxMarketQueries";
import { resolveBaseItemNames } from "./repoeNames";

/**
 * Keep our own copy of GGG's hourly currency-exchange digests for the POLLED leagues.
 *
 * GGG serves past hours only and keeps no promise about how long; the digest also carries ~3500
 * markets across every league including private "(PLnnn)" ones we must never store. So each
 * digest is filtered down to the leagues someone is looking at, upserted idempotently, and the
 * hours we are missing are walked backwards politely (≤ 1 request / 2 s, a bounded number per
 * cycle) until the persistence window is covered.
 *
 * FAIL-QUIET by design, like rateSync: a CDN hiccup must never abort a poll cycle. Quiet means
 * console.warn with the reason, never a swallowed error.
 */

export const CX_REQUEST_GAP_MS = 2000;
export const CX_MAX_FETCHES_PER_RUN = 12;
/** A failed/unusable hour is not retried for this long, so one bad hour cannot eat every cycle. */
const RETRY_AFTER_MS = 30 * 60 * 1000;
/** An hour stored for some leagues but missing a polled one waits this long before a re-ask. */
const ABSENT_RETRY_MS = 6 * 60 * 60 * 1000;

export interface CxHistorySources {
  /** Digest for the hour STARTING at `requestHour` (its next_change_id is requestHour + 1h). */
  digestAt: (requestHour: number) => Promise<CxDigest>;
  sleep: (ms: number) => Promise<void>;
  resolveNames: (ids: readonly string[]) => Map<string, string>;
}

export const LIVE_HISTORY_SOURCES: CxHistorySources = {
  digestAt: (hour) => fetchCxDigest(hour),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  resolveNames: resolveBaseItemNames,
};

/** Request hour → earliest time it may be fetched again. */
const retryAt = new Map<number, number>();

/** Forget retry back-off — test fixtures only. */
export function resetCxIngestState(): void {
  retryAt.clear();
}

/** One digest market → a stored row with item_a < item_b, or null when a side has no volume. */
export function toMarketRow(m: CxMarket, hour: number): CxMarketRow | null {
  const [first, second] = m.market_pair;
  if (first == null || second == null || first === second) return null;
  const [a, b] = first < second ? [first, second] : [second, first];
  const va = m.volume_traded[a];
  const vb = m.volume_traded[b];
  if (va == null || vb == null) return null;
  const pick = (map: Record<string, number> | null | undefined, id: string): number | null => map?.[id] ?? null;
  return {
    league: m.league,
    hour,
    item_a: a,
    item_b: b,
    volume_a: va,
    volume_b: vb,
    low_ratio_a: pick(m.lowest_ratio, a),
    low_ratio_b: pick(m.lowest_ratio, b),
    high_ratio_a: pick(m.highest_ratio, a),
    high_ratio_b: pick(m.highest_ratio, b),
    low_stock_a: pick(m.lowest_stock, a),
    low_stock_b: pick(m.lowest_stock, b),
    high_stock_a: pick(m.highest_stock, a),
    high_stock_b: pick(m.highest_stock, b),
  };
}

function nameNewItems(rows: readonly CxMarketRow[], resolveNames: CxHistorySources["resolveNames"]): number {
  const known = namedCxItemIds();
  const unknown = [...new Set(rows.flatMap((r) => [r.item_a, r.item_b]))].filter((id) => !known.has(id));
  if (unknown.length === 0) return 0;
  const resolved = resolveNames(unknown);
  upsertCxItemNames(resolved);
  const missing = unknown.filter((id) => !resolved.has(id));
  if (missing.length > 0) {
    console.warn(`[cx-history] ${missing.length} exchange item id(s) not in the RePoE catalog, e.g. ${missing.slice(0, 3).join(", ")}`);
  }
  return missing.length;
}

export interface IngestResult {
  /** Market rows stored per league. */
  written: Record<string, number>;
  /** Polled leagues the digest does not list at all — NOT marked ingested, retried later. */
  absent: string[];
}

/**
 * Store one digest for the given leagues (private ones refused even if asked).
 *
 * A league the digest does not list is NOT marked ingested: GGG dropping a league from one
 * hour's payload is indistinguishable from a glitch, and marking it would bake a silent hole
 * into the persistence window. It is reported (loudly when the previous hour had markets) and
 * left for a later retry.
 */
export function ingestCxDigest(
  digest: CxDigest,
  leagues: readonly string[],
  resolveNames: CxHistorySources["resolveNames"],
): IngestResult {
  if (digest.markets.length === 0) throw new Error(`digest ${digest.next_change_id} has no markets`);
  const hour = digest.next_change_id;
  const listed = new Set(cxLeagues(digest));
  const result: IngestResult = { written: {}, absent: [] };
  const all: CxMarketRow[] = [];
  for (const league of new Set(leagues)) {
    if (isPrivateLeague(league)) continue;
    if (!listed.has(league)) {
      result.absent.push(league);
      warnIfVanished(league, hour);
      continue;
    }
    const rows = digest.markets
      .filter((m) => m.league === league)
      .map((m) => toMarketRow(m, hour))
      .filter((r): r is CxMarketRow => r != null);
    storeCxHour(league, hour, rows);
    result.written[league] = rows.length;
    all.push(...rows);
  }
  nameNewItems(all, resolveNames);
  return result;
}

function warnIfVanished(league: string, hour: number): void {
  const previous = ingestedMarketCount(league, hour - CX_HOUR_SECONDS);
  if (previous != null && previous > 0) {
    console.warn(`[cx-history] "${league}" missing from digest ${hour} but had ${previous} market(s) the hour before`);
  }
}

/** Request hours (newest first) inside the backfill window that some league is still missing. */
export function missingRequestHours(leagues: readonly string[], nowMs: number): number[] {
  const newest = previousCompletedHour(nowMs);
  const window = Array.from({ length: config.cx.backfillHours }, (_, i) => newest - i * CX_HOUR_SECONDS);
  const oldestId = window[window.length - 1]! + CX_HOUR_SECONDS;
  const have = leagues.filter((l) => !isPrivateLeague(l)).map((l) => ingestedCxHours(l, oldestId));
  return window.filter((h) => have.some((set) => !set.has(h + CX_HOUR_SECONDS)));
}

async function fetchAndIngest(
  hour: number,
  leagues: readonly string[],
  sources: CxHistorySources,
  nowMs: number,
): Promise<boolean> {
  try {
    const digest = await sources.digestAt(hour);
    if (digest.next_change_id !== hour + CX_HOUR_SECONDS) {
      throw new Error(`asked for hour ${hour}, digest is ${digest.next_change_id}`);
    }
    const { absent } = ingestCxDigest(digest, leagues, sources.resolveNames);
    // A league GGG does not list may be dead or misspelled: re-asking every 30 min for 24 hours
    // of it would cost ~48 full-digest downloads an hour, so its hours wait much longer.
    if (absent.length > 0) retryAt.set(hour, nowMs + ABSENT_RETRY_MS);
    else retryAt.delete(hour);
    return true;
  } catch (err) {
    retryAt.set(hour, nowMs + RETRY_AFTER_MS);
    console.warn(`[cx-history] hour ${hour} skipped: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Poller hook: fill the newest missing hours of the backfill window, at most
 * CX_MAX_FETCHES_PER_RUN, one request per CX_REQUEST_GAP_MS. Never throws. Returns hours stored.
 */
export async function syncCxHistory(
  leagues: readonly string[],
  sources: CxHistorySources = LIVE_HISTORY_SOURCES,
  nowMs: number = Date.now(),
): Promise<number> {
  const due = missingRequestHours(leagues, nowMs)
    .filter((h) => nowMs >= (retryAt.get(h) ?? -Infinity))
    .slice(0, CX_MAX_FETCHES_PER_RUN);
  let stored = 0;
  for (const [i, hour] of due.entries()) {
    if (i > 0) await sources.sleep(CX_REQUEST_GAP_MS);
    if (await fetchAndIngest(hour, leagues, sources, nowMs)) stored++;
  }
  if (stored > 0) console.log(`[cx-history] stored ${stored}/${due.length} digest hour(s) for ${leagues.join(", ")}`);
  return stored;
}

/** Retention runs hourly, not every 5-minute cycle — the data only changes once an hour. */
const PRUNE_EVERY_MS = 60 * 60 * 1000;
let lastPruneAt = -Infinity;

/**
 * Retention: drop market-hours older than config.cx.historyDays, at most once an hour (`force`
 * bypasses that for tests). Returns rows removed, or null when this call was skipped.
 */
export function pruneCxMarketHistory(nowMs: number = Date.now(), force = false): number | null {
  if (!force && nowMs - lastPruneAt < PRUNE_EVERY_MS) return null;
  lastPruneAt = nowMs;
  const cutoff = Math.floor(nowMs / 1000) - config.cx.historyDays * 24 * CX_HOUR_SECONDS;
  return pruneCxHistory(cutoff);
}
