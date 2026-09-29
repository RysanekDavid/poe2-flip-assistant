/* Drain the patch-summary queue now instead of waiting for the poller (Coach must be running).
 * Usage: npm run patch:summarize            — every due job
 *        npm run patch:summarize -- --force — re-summarize every stored patch (never re-announces)
 * Safe beside a running poller: each job is leased before its Coach call, so neither pays twice. */
import { setTimeout as sleep } from "node:timers/promises";
import { resetAllSummaries } from "../db/patchSummaryQueries";
import { drainPatchSummaries, drainProblem } from "../sources/patchNotes/summaryWorker";

// Each drain takes at most five jobs; a failed job backs off, so this always terminates.
const MAX_ROUNDS = 20;
// The Coach allows 10 summaries per minute per actor, and the poller shares the owner's actor:
// five per round, one round a minute leaves the other five for the poller.
const ROUND_GAP_MS = 60_000;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--force")) throw new Error("usage: patch:summarize [-- --force]");
  if (args.includes("--force")) console.log(`reset ${resetAllSummaries()} summary job(s) to pending`);
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    if (round > 1) await sleep(ROUND_GAP_MS);
    const result = await drainPatchSummaries();
    console.log(JSON.stringify({ round, ...result }));
    const problem = drainProblem(result);
    if (problem != null) {
      console.error(problem);
      process.exitCode = 1;
    }
    if (result.summarized + result.retried + result.failed === 0) return;
  }
  console.warn(`stopped after ${MAX_ROUNDS} rounds; run again to continue`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
