import { CX_HOUR_SECONDS, type CxDigest } from "../../../api/cxClient";
import { CX_REQUEST_GAP_MS, type CxHistorySources } from "../cxIngest";

/**
 * The backfill's one door to GGG's digest archive: budget, politeness gap, and what an answer
 * means.
 *
 * - `ok`: a digest for exactly the hour asked.
 * - `empty`: the archive answered "nothing for this hour" (next_change_id echoes the request,
 *   or no markets at all). For an hour that is already settled that is permanent — before the
 *   archive's depth, or a dead hour — so it is recorded, never retried.
 * - `failed`: transport or shape error. Retried after RETRY_AFTER_MS, at most MAX_FAILURES times
 *   per hour; after that the hour is given up on (loudly) for the life of the process.
 */

export const RETRY_AFTER_MS = 30 * 60 * 1000;
export const MAX_FAILURES = 5;

export type Fetched = { kind: "ok"; digest: CxDigest } | { kind: "empty" } | { kind: "failed" };

export interface FetchRun {
  sources: CxHistorySources;
  nowMs: number;
  budget: number;
  fetched: number;
  failed: number;
  lastError: string | null;
}

/** Request hour → earliest retry after a failure. */
const retryAt = new Map<number, number>();
/** Request hour → failed fetches so far. */
const failCounts = new Map<number, number>();

export function resetFetchState(): void {
  retryAt.clear();
  failCounts.clear();
}

/** The hour failed MAX_FAILURES times — callers treat it as missing, not as pending. */
export const isExhausted = (hour: number): boolean => (failCounts.get(hour) ?? 0) >= MAX_FAILURES;

/** Not exhausted and past its back-off. */
export const isDue = (hour: number, nowMs: number): boolean => !isExhausted(hour) && nowMs >= (retryAt.get(hour) ?? -Infinity);

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function recordFailure(run: FetchRun, hour: number, err: unknown): void {
  const count = (failCounts.get(hour) ?? 0) + 1;
  failCounts.set(hour, count);
  retryAt.set(hour, run.nowMs + RETRY_AFTER_MS);
  run.failed++;
  run.lastError = errText(err);
  const verdict = count >= MAX_FAILURES ? `giving up on this hour after ${count} failures` : `retry ${count}/${MAX_FAILURES} in 30 min`;
  console.warn(`[league-start] digest ${hour} failed (${verdict}): ${run.lastError}`);
}

/** One digest through the run's budget and the 2 s gap. Never throws. */
export async function fetchDigest(run: FetchRun, hour: number): Promise<Fetched> {
  if (run.fetched > 0) await run.sources.sleep(CX_REQUEST_GAP_MS);
  run.fetched++;
  run.budget--;
  try {
    const digest = await run.sources.digestAt(hour);
    if (digest.next_change_id === hour || digest.markets.length === 0) return { kind: "empty" };
    if (digest.next_change_id !== hour + CX_HOUR_SECONDS) throw new Error(`asked for hour ${hour}, digest is ${digest.next_change_id}`);
    failCounts.delete(hour);
    return { kind: "ok", digest };
  } catch (err: unknown) {
    recordFailure(run, hour, err);
    return { kind: "failed" };
  }
}
