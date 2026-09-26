import type { TradeCred } from "../api/tradeClient";
import { credForUser } from "../auth/credForUser";
import { scanAll, type ScanSummary } from "../core/huntEngine";
import { scanAutoSnipes, type ScanReport } from "../core/autoSnipe";
import { withHeartbeat } from "../core/heartbeat";
import { saveSnipeFailure } from "../db/huntQueries";
import { consumeScanRequests, requestScan } from "../db/scanRequestQueries";
import { listUsers } from "../db/userQueries";

/**
 * Trade2 scan runners for the poller process — the single owner of the trade2 limiter. Each kind
 * has an in-flight guard: a tick (cron, interval or a drained web request) that finds its scan
 * still running is skipped, never stacked, so a slow cycle can't multiply the request rate.
 */
let huntScanning = false;
let autoSnipeRunning = false;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * One user's expired cookie is that hunt's own error (shown on its row), not a broken subsystem;
 * the heartbeat goes red only when nothing worked or mod capture is broken for everyone.
 * `scanned` counts SUCCESSFUL hunts only (errors are not included), so "nothing worked" is
 * scanned === 0 with at least one error — which also covers the scan-setup failure path.
 */
export function huntProblem(s: ScanSummary): string | null {
  if (s.diag.zeroModRares > 0) return `${s.diag.zeroModRares}/${s.diag.rares} rare listings had no mods — mod capture broken`;
  const first = s.errors[0];
  if (first && s.scanned === 0) return `every hunt failed — ${first.hunt}: ${first.error}`;
  return null;
}

/** Budget deferrals are normal pacing; a scan that searched nothing and hit errors is not. */
export function autoSnipeProblem(r: ScanReport): string | null {
  const first = r.errors[0];
  if (first && r.searched === 0 && r.profiles > 0) return `no archetype searched — ${first.profile}: ${first.error}`;
  return null;
}

/** Hunt scan for everyone (`only` omitted) or one user's queued manual scan. */
export function runHuntScan(reason: string, only?: { userId: number; cred: TradeCred }): boolean {
  if (huntScanning) return false;
  huntScanning = true;
  // A one-user manual lap says nothing about the background loop's health — keep it off the heartbeat.
  const scan = only ? scanAll(only) : withHeartbeat("hunts", "", () => scanAll(), { problem: huntProblem });
  scan
    .then((s) => {
      if (s.hits > 0) console.log(`[hunt] ${reason}: ${s.hits} new across ${s.scanned} hunt(s)`);
      if (s.errors.length > 0) console.warn(`[hunt] ${reason}: ${s.errors.length} hunt error(s): ${s.errors.map((e) => `${e.hunt}: ${e.error}`).join("; ")}`);
      if (s.diag.zeroModRares > 0) console.error(`[hunt] ${s.diag.zeroModRares}/${s.diag.rares} rare listings had NO mods — mod capture broken`);
    })
    .catch((e) => console.error(`[hunt] ${reason} failed:`, errText(e)))
    .finally(() => {
      huntScanning = false;
    });
  return true;
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

function drainHunts(): void {
  if (huntScanning) return;
  const userIds = consumeScanRequests("hunts");
  if (userIds.length === 0) return;
  // one manual lap per drain: the requesting users' hunts in a single scan per user, serially
  const users = listUsers().filter((u) => userIds.includes(u.id));
  const [first, ...rest] = users;
  if (!first) return;
  const cred = credForUser(first);
  if (cred) runHuntScan(`manual scan (${first.name})`, { userId: first.id, cred });
  else console.error(`[hunt] manual scan for ${first.name} dropped — no stored POESESSID`);
  // re-queue the others; the next drain (20s) picks them up once this scan finishes
  for (const u of rest) requestScan("hunts", u.id);
}

/**
 * Drain manual scan requests queued by the web routes. A request is only consumed when its
 * runner is idle — a busy runner leaves it queued for the next drain instead of dropping it.
 * Runs on a timer, so a DB error (SQLITE_BUSY, a cred that fails to decrypt) is logged loudly and
 * retried next tick instead of escaping as an uncaught exception that kills the poller. Returns
 * those errors so the caller's heartbeat can show them.
 */
export function drainScanRequests(ownerCredNow: () => TradeCred | null): string[] {
  const errors: string[] = [];
  try {
    drainAutoSnipe(ownerCredNow);
  } catch (e) {
    console.error("[autosnipe] draining manual scan requests failed:", errText(e));
    errors.push(`autosnipe drain: ${errText(e)}`);
  }
  try {
    drainHunts();
  } catch (e) {
    console.error("[hunt] draining manual scan requests failed:", errText(e));
    errors.push(`hunt drain: ${errText(e)}`);
  }
  return errors;
}
