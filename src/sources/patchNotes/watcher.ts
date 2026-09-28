import { config } from "../../config/env";
import { patchSyncProblem } from "./contracts";
import { syncPatchNotes } from "./store";
import { withHeartbeat } from "../../core/heartbeat";

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
    // syncPatchNotes keeps the threads that parsed and reports the rest in its result instead of
    // throwing; the run still counts as red so a drifted thread cannot hide behind the good ones.
    withHeartbeat("patch-notes", "", () => syncPatchNotes(), { problem: patchSyncProblem })
      .then((result) => {
        const problem = patchSyncProblem(result);
        if (problem == null) {
          console.log(`[patch-notes] checked ${result.checkedThreads} thread(s), changed ${result.changedThreads}`);
        } else {
          console.error(`[patch-notes] ${problem}`);
        }
      })
      .catch((error: unknown) => {
        console.error("[patch-notes] sync failed:", error instanceof Error ? error.message : error);
      })
      .finally(() => {
        running = false;
      });
  };
  console.log(`[patch-notes] checking official PoE2 notes every ${config.patchNotes.intervalMin}m`);
  run();
  const timer = setInterval(run, intervalMs);
  return () => clearInterval(timer);
}
