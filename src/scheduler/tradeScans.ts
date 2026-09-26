import type { TradeCred } from "../api/tradeClient";
import { credForUser } from "../auth/credForUser";
import { scanAll } from "../core/huntEngine";
import { scanAutoSnipes } from "../core/autoSnipe";
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

/** Hunt scan for everyone (`only` omitted) or one user's queued manual scan. */
export function runHuntScan(reason: string, only?: { userId: number; cred: TradeCred }): boolean {
  if (huntScanning) return false;
  huntScanning = true;
  scanAll(only)
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
  scanAutoSnipes(cred)
    .then((r) => {
      console.log(`[autosnipe] ${reason}: ${r.findings.length} snipe(s), ${r.searched} archetype(s), ${r.requests}/${r.maxRequests} requests`);
      if (r.errors.length > 0) console.warn(`[autosnipe] ${r.errors.length} error(s):`, r.errors.map((e) => `${e.profile}: ${e.error}`).join("; "));
    })
    .catch((e) => console.error(`[autosnipe] ${reason} failed:`, errText(e)))
    .finally(() => {
      autoSnipeRunning = false;
    });
  return true;
}

/**
 * Drain manual scan requests queued by the web routes. A request is only consumed when its
 * runner is idle — a busy runner leaves it queued for the next drain instead of dropping it.
 */
export function drainScanRequests(ownerCredNow: () => TradeCred | null): void {
  if (!autoSnipeRunning && consumeScanRequests("autosnipe").length > 0) {
    // resolved per request: the owner may have saved a POESESSID after the poller started
    const ownerCred = ownerCredNow();
    if (ownerCred) runAutoSnipe("manual scan", ownerCred);
    else console.error("[autosnipe] manual scan requested but the owner has no POESESSID — dropped");
  }
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
