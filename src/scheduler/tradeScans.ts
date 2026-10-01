import type { TradeCred } from "../api/tradeClient";
import { scanAutoSnipes, type ScanReport } from "../core/autoSnipe";
import { withHeartbeat } from "../core/heartbeat";
import { saveSnipeFailure } from "../db/snipeReportQueries";
import { consumeScanRequests } from "../db/scanRequestQueries";
import { finishRepriceRun, markRepriceStarted } from "../db/repriceRunQueries";
import { repriceForUser, type RepriceUserResult } from "../core/wealth/repriceRun";

/**
 * Trade2 scan runners for the poller process — the single owner of the trade2 limiter. Each kind
 * has an in-flight guard: a tick (cron, interval or a drained web request) that finds its scan
 * still running is skipped, never stacked, so a slow cycle can't multiply the request rate.
 */
let autoSnipeRunning = false;
let repriceRunning = false;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Budget deferrals are normal pacing; a scan that searched nothing and hit errors is not. */
export function autoSnipeProblem(r: ScanReport): string | null {
  const first = r.errors[0];
  if (first && r.searched === 0 && r.profiles > 0) return `no archetype searched — ${first.profile}: ${first.error}`;
  return null;
}

export function runAutoSnipe(reason: string, cred: TradeCred): boolean {
  if (autoSnipeRunning) {
    console.warn(`[autosnipe] ${reason} skipped — previous scan still running`);
    return false;
  }
  autoSnipeRunning = true;
  withHeartbeat("autosnipe", "", () => scanAutoSnipes(cred), { problem: autoSnipeProblem })
    .then((r) => {
      console.log(`[autosnipe] ${reason}: ${r.findings.length} snipe(s), ${r.searched} archetype(s), ${r.searches}/${r.maxSearches} searches, ${r.fetches} fetches`);
      if (r.errors.length > 0) console.warn(`[autosnipe] ${r.errors.length} error(s):`, r.errors.map((e) => `${e.profile}: ${e.error}`).join("; "));
    })
    .catch((e) => console.error(`[autosnipe] ${reason} failed:`, errText(e)))
    .finally(() => {
      autoSnipeRunning = false;
    });
  return true;
}

function drainAutoSnipe(ownerCredNow: () => TradeCred | null): void {
  if (autoSnipeRunning || consumeScanRequests("autosnipe").length === 0) return;
  // resolved per request: the owner may have saved a POESESSID after the poller started
  const ownerCred = ownerCredNow();
  if (ownerCred) {
    runAutoSnipe("manual scan", ownerCred);
    return;
  }
  const msg = "manual scan requested but the owner has no POESESSID stored";
  console.error(`[autosnipe] ${msg}`);
  saveSnipeFailure(msg); // the UI is waiting on this scan — give it the reason
}

/** The user's panel is waiting on this run — record why. A user deleted mid-run has no row left. */
function recordRunFailure(userId: number, error: string): void {
  try {
    finishRepriceRun(userId, { checked: 0, searches: 0, error });
  } catch (e: unknown) {
    console.error(`[reprice] user ${userId}: could not record the failure (${error}): ${errText(e)}`);
  }
}

/**
 * Users one after another: each run is ≤ 8 searches on the shared limiter, never in parallel.
 * One user's failure (even a deleted user) never stops the rest.
 */
export async function repriceUsers(
  userIds: readonly number[],
  credFor: (userId: number) => TradeCred | null,
  run: typeof repriceForUser = repriceForUser,
): Promise<RepriceUserResult[]> {
  const results: RepriceUserResult[] = [];
  for (const userId of userIds) {
    try {
      results.push(await run(userId, credFor(userId)));
    } catch (e: unknown) {
      recordRunFailure(userId, errText(e));
      results.push({ userId, candidates: 0, checked: 0, searches: 0, fetches: 0, error: errText(e) });
    }
  }
  return results;
}

const repriceProblem = (rs: RepriceUserResult[]): string | null => {
  const failed = rs.filter((r) => r.error != null);
  return failed.length > 0 ? `${failed.length} of ${rs.length} reprice run(s) failed — user ${failed[0]!.userId}: ${failed[0]!.error}` : null;
};

/** Stash › Sell reprice checks queued by POST /api/wealth/reprice, run under each user's own cookie. */
export function drainReprice(credFor: (userId: number) => TradeCred | null): void {
  if (repriceRunning) return; // stays queued for the next drain
  const userIds = consumeScanRequests("reprice");
  if (userIds.length === 0) return;
  // synchronously, before the first await: a user waiting behind another reads "running", not "lost"
  markRepriceStarted(userIds);
  repriceRunning = true;
  withHeartbeat("reprice", "", () => repriceUsers(userIds, credFor), { problem: repriceProblem })
    .then((rs) => {
      for (const r of rs) console.log(`[reprice] user ${r.userId}: ${r.checked}/${r.candidates} checked, ${r.searches} searches, ${r.fetches} fetches${r.error ? ` — ${r.error}` : ""}`);
    })
    .catch((e) => console.error("[reprice] run failed:", errText(e)))
    .finally(() => {
      repriceRunning = false;
    });
}

/**
 * Drain manual scan requests queued by the web routes. A request is only consumed when its
 * runner is idle — a busy runner leaves it queued for the next drain instead of dropping it.
 * Runs on a timer, so a DB error (SQLITE_BUSY, a cred that fails to decrypt) is logged loudly and
 * retried next tick instead of escaping as an uncaught exception that kills the poller. Returns
 * those errors so the caller's heartbeat can show them.
 */
export function drainScanRequests(ownerCredNow: () => TradeCred | null, credFor: (userId: number) => TradeCred | null): string[] {
  const errors: string[] = [];
  try {
    drainAutoSnipe(ownerCredNow);
  } catch (e) {
    console.error("[autosnipe] draining manual scan requests failed:", errText(e));
    errors.push(`autosnipe drain: ${errText(e)}`);
  }
  try {
    drainReprice(credFor);
  } catch (e) {
    console.error("[reprice] draining reprice requests failed:", errText(e));
    errors.push(`reprice drain: ${errText(e)}`);
  }
  return errors;
}
