import { config } from "../../config/env";
import { syncPatchNotes } from "./store";

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
    syncPatchNotes()
      .then((result) => {
        if (result.ok) {
          console.log(`[patch-notes] checked ${result.checkedThreads} thread(s), changed ${result.changedThreads}`);
        } else {
          console.error(`[patch-notes] sync incomplete: ${result.errors.join("; ")}`);
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
