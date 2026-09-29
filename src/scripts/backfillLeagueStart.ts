/**
 * Manual league-start backfill (the poller does the same ≤12 digests per cycle on its own):
 *   npm run league:backfill            # until every dated league is complete or nothing is due
 *   npm run league:backfill -- 20      # at most 20 runs of ≤12 digests
 *
 * Public GGG CDN, no credentials, same client, budget and 2 s request gap as the poller. Uses the
 * DB at DB_PATH (.env.local) — stop the poller first or both will fetch the same hours.
 */
import { foldDays, leagueStartProblem, syncLeagueStart } from "../core/cx/leagueStart/backfill";
import { listStartMeta } from "../db/cxStartQueries";

const DEFAULT_MAX_RUNS = 200;

function maxRuns(): number {
  const arg = process.argv[2];
  if (arg == null) return DEFAULT_MAX_RUNS;
  const n = Number(arg);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`max runs must be a positive integer, got "${arg}"`);
  return n;
}

function printProgress(): void {
  for (const m of listStartMeta()) {
    const start = new Date(m.startHour * 1000).toISOString();
    console.log(`  ${m.league.padEnd(32)} start ${start}  days ${m.daysAvailable}/${foldDays()}`);
  }
}

async function main(): Promise<void> {
  const limit = maxRuns();
  for (let run = 1; run <= limit; run++) {
    const r = await syncLeagueStart();
    console.log(`run ${run}: ${r.fetched} digest(s), ${r.startsFound.length} start(s) dated, ${r.daysStored} day(s) folded`);
    for (const u of r.newlyUndated) console.warn(`  undated: ${u.league} — ${u.reason}`);
    // failed digests back off for 30 min; a CLI waiting that out is the poller's job, so stop loudly
    if (r.failed > 0 && r.daysStored === 0 && r.startsFound.length === 0) throw new Error(leagueStartProblem(r) ?? "digests failed");
    if (r.fetched === 0) break;
  }
  printProgress();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
