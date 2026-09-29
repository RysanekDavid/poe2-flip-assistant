import { config } from "../../config/env";
import { patchSyncProblem, patchSyncSummary } from "./contracts";
import { syncPatchNotes } from "./store";
import { drainPatchSummaries, drainProblem, type DrainResult } from "./summaryWorker";
import { withHeartbeat } from "../../core/heartbeat";

const describe = (error: unknown): unknown => (error instanceof Error ? error.message : error);

async function syncOnce(): Promise<void> {
  try {
    // syncPatchNotes keeps the threads that parsed and reports the rest in its result instead of
    // throwing; the run still counts as red so a drifted thread cannot hide behind the good ones.
    const result = await withHeartbeat("patch-notes", "", () => syncPatchNotes(), { problem: patchSyncProblem });
    const problem = patchSyncProblem(result);
    if (problem == null) console.log(`[patch-notes] ${patchSyncSummary(result)}`);
    else console.error(`[patch-notes] ${problem} (${patchSyncSummary(result)})`);
  } catch (error: unknown) {
    console.error("[patch-notes] sync failed:", describe(error));
  }
}

function drainSummary(result: DrainResult): string {
  return `summarized ${result.summarized}, retrying ${result.retried}, failed ${result.failed}, announced ${result.announced}`;
}

// Runs after every sync, successful or not: queued retries and announcements must not wait on
// the forum being reachable.
async function summarizeOnce(): Promise<void> {
  try {
    const result = await withHeartbeat("patch-summary", "", () => drainPatchSummaries(), { problem: drainProblem });
    const problem = drainProblem(result);
    // An unreachable Coach is logged once per outage by the worker; the heartbeat stays red.
    if (result.coachUnreachable) return;
    if (problem == null) console.log(`[patch-summary] ${drainSummary(result)}`);
    else console.error(`[patch-summary] ${problem} (${drainSummary(result)})`);
  } catch (error: unknown) {
    console.error("[patch-summary] drain failed:", describe(error));
  }
}

export function startPatchNotesWatcher(): (() => void) | null {
  if (!config.patchNotes.enabled) {
    console.log("[patch-notes] watcher disabled");
    return null;
  }
  const intervalMs = config.patchNotes.intervalMin * 60_000;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    console.error("[patch-notes] PATCH_NOTES_INTERVAL_MIN must be greater than zero");
    return null;
  }
  let running = false;
  const run = (): void => {
    if (running) {
      console.warn("[patch-notes] sync skipped because the previous sync is still running");
      return;
    }
    running = true;
    syncOnce()
      .then(summarizeOnce)
      .finally(() => {
        running = false;
      });
  };
  console.log(`[patch-notes] checking official PoE2 notes every ${config.patchNotes.intervalMin}m`);
  run();
  const timer = setInterval(run, intervalMs);
  return () => clearInterval(timer);
}
