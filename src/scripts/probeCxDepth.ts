/**
 * Manual network probe (never in CI): how far back does GGG's public currency-exchange digest
 * archive reach? The league-start feature can only learn from past league starts the CDN still
 * serves, so this decides between "3–4 past league starts" and "only the current league".
 *   npm run probe:cx-depth
 *
 * Public CDN, no credentials. Three requests, through the same cxClient the poller uses.
 */
import { cxLeagues, fetchCxDigest, isPrivateLeague, type CxDigest } from "../api/cxClient";

// One mid-league hour from each of three different leagues' lifetimes.
const PROBE_HOURS_ISO = ["2026-05-28T12:00:00Z", "2026-09-05T12:00:00Z", "2025-12-12T12:00:00Z"] as const;

function unixHour(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`bad probe timestamp ${iso}`);
  return Math.floor(ms / 1000);
}

function marketCounts(digest: CxDigest): { publicCounts: Array<[string, number]>; privateLeagues: number; privateMarkets: number } {
  const counts = new Map<string, number>();
  let privateMarkets = 0;
  const privateNames = new Set<string>();
  for (const m of digest.markets) {
    if (isPrivateLeague(m.league)) {
      privateMarkets++;
      privateNames.add(m.league);
      continue;
    }
    counts.set(m.league, (counts.get(m.league) ?? 0) + 1);
  }
  const publicCounts = cxLeagues(digest).map((league): [string, number] => [league, counts.get(league) ?? 0]);
  publicCounts.sort((a, b) => b[1] - a[1]);
  return { publicCounts, privateLeagues: privateNames.size, privateMarkets };
}

async function probeHour(iso: string): Promise<boolean> {
  const hour = unixHour(iso);
  console.log(`\n=== requested ${iso} (hour=${hour}) ===`);
  try {
    const digest = await fetchCxDigest(hour);
    const nextIso = new Date(digest.next_change_id * 1000).toISOString();
    const echo = digest.next_change_id === hour ? " (= requested: nothing newer / no data for this hour)" : "";
    console.log(`next_change_id=${digest.next_change_id} (${nextIso})${echo}`);
    console.log(`markets total=${digest.markets.length}`);
    const { publicCounts, privateLeagues, privateMarkets } = marketCounts(digest);
    for (const [league, n] of publicCounts) console.log(`  ${league.padEnd(40)} ${n} markets`);
    console.log(`  (private leagues: ${privateLeagues}, ${privateMarkets} markets)`);
    return true;
  } catch (e) {
    console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function main(): Promise<void> {
  let failures = 0;
  for (const iso of PROBE_HOURS_ISO) {
    if (!(await probeHour(iso))) failures++;
  }
  if (failures > 0) {
    console.error(`\n${failures} of ${PROBE_HOURS_ISO.length} probe hour(s) failed`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
