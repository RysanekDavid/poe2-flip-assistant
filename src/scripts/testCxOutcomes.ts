/* Outcome loop (published edge → next hour hit/miss) and the absent-league safeguards, against a
 * TEMP DB. Seeds its own history — no dependency on what earlier suites stored.
 * Run via npm run test:cx. NO NETWORK. */
import assert from "node:assert/strict";
import { CX_HOUR_SECONDS } from "../api/cxClient";
import { absentRetryAt, ingestCxDigest, MAX_ABSENCES, resetCxIngestState, syncCxHistory } from "../core/cx/cxIngest";
import { leagueStats } from "../core/cx/cxItemMarkets";
import { cxPersistedNextHour, trackCxOutcomes } from "../core/cx/cxOutcomes";
import { slowerLegDivPerHour } from "../core/cx/cxPersistence";
import { getDb } from "../db/database";
import {
  FR,
  H0,
  IDS,
  digestAt,
  hourId,
  implausibleMarkets,
  omenMarkets,
  simulacrumMarkets,
  stubNames,
  thinRibMarkets,
} from "./cxTestFixtures";

/**
 * Six fresh hours ending at H0: Simulacrum holds a 12% Div → Ex edge every hour and is the only
 * item that passes the rank gate (the rib is thin, the Vaal Siphoner implausible, Omen and the
 * base currencies coarse).
 */
function seedSixHours(): void {
  getDb().exec(`DELETE FROM cx_markets WHERE league = '${FR}'; DELETE FROM cx_ingest WHERE league = '${FR}'; DELETE FROM cx_edge_outcomes;`);
  for (let k = 5; k >= 0; k--) {
    const extra = [...simulacrumMarkets(12), ...omenMarkets(), ...thinRibMarkets(), ...implausibleMarkets()];
    ingestCxDigest(digestAt(hourId(k), extra), [FR], stubNames);
  }
}

type Row = { item: string; hour: number; buy_quote: string; sell_quote: string; next_net_pct: number | null; outcome: string | null };

function outcomes(): Row[] {
  return getDb()
    .prepare("SELECT item, hour, buy_quote, sell_quote, next_net_pct, outcome FROM cx_edge_outcomes WHERE league = ? ORDER BY hour")
    .all(FR) as Row[];
}

/** The gate's own numbers are stored beside the published edge — the Coach reads them verbatim. */
function assertDetailMatchesGate(): void {
  const stats = leagueStats(FR, H0).get(IDS.simulacrum);
  assert.ok(stats?.edge != null);
  const row = getDb()
    .prepare(
      `SELECT persistence6, slower_div_per_hour, net_div_per_unit, buy_price, sell_price, fee_complete
       FROM cx_edge_outcomes WHERE league = ? AND item = ? AND hour = ?`,
    )
    .get(FR, IDS.simulacrum, H0) as Record<string, number | null>;
  assert.equal(row.persistence6, stats.edge.persistence6);
  assert.equal(row.slower_div_per_hour, slowerLegDivPerHour(stats));
  assert.equal(row.net_div_per_unit, stats.edge.netDivPerUnit);
  assert.equal(row.buy_price, stats.edge.buy.priceQuote);
  assert.equal(row.sell_price, stats.edge.sell.priceQuote);
  assert.equal(row.fee_complete, stats.edge.feeComplete ? 1 : 0);
}

/**
 * Newest hour first, older hours backfilled later (the real cold-start order): the memoized stats
 * for that newest hour must be recomputed once the window fills, not stay "sporadic".
 */
function testMemoSeesLateBackfill(): void {
  getDb().exec(`DELETE FROM cx_markets WHERE league = '${FR}'; DELETE FROM cx_ingest WHERE league = '${FR}';`);
  ingestCxDigest(digestAt(hourId(0), simulacrumMarkets(12)), [FR], stubNames);
  assert.equal(leagueStats(FR, H0).get(IDS.simulacrum)?.issue, "sporadic");
  for (let k = 1; k <= 4; k++) ingestCxDigest(digestAt(hourId(k), simulacrumMarkets(12)), [FR], stubNames);
  assert.equal(leagueStats(FR, H0).get(IDS.simulacrum)?.edge?.persistence6, 5, "late backfill invalidated the memo");
}

export function runCxOutcomeTests(): void {
  testMemoSeesLateBackfill();
  seedSixHours();
  assert.deepEqual(trackCxOutcomes(FR), { resolved: 0, published: 1 });
  assert.deepEqual(trackCxOutcomes(FR), { resolved: 0, published: 0 }, "publishing is idempotent per item-hour");
  const [first] = outcomes();
  assert.ok(first != null);
  assert.deepEqual([first.item, first.hour, first.buy_quote, first.sell_quote], [IDS.simulacrum, H0, IDS.divine, IDS.exalted]);
  assert.equal(first.outcome, null, "pending until the next hour is stored");
  assertDetailMatchesGate();

  // Next hour: the same direction still clears the threshold → hit.
  ingestCxDigest(digestAt(H0 + CX_HOUR_SECONDS, simulacrumMarkets(12)), [FR], stubNames);
  assert.deepEqual(trackCxOutcomes(FR), { resolved: 1, published: 1 });
  // The hour after: the gap closes to 0 (inside the ratio grid) → miss.
  ingestCxDigest(digestAt(H0 + 2 * CX_HOUR_SECONDS, simulacrumMarkets(0)), [FR], stubNames);
  trackCxOutcomes(FR);

  const [hit, miss] = outcomes();
  assert.equal(hit?.outcome, "hit");
  assert.ok(hit?.next_net_pct != null && hit.next_net_pct > 5);
  assert.equal(miss?.hour, H0 + CX_HOUR_SECONDS);
  assert.equal(miss?.outcome, "miss");
  const now = (H0 + 2 * CX_HOUR_SECONDS) * 1000 + 60_000;
  assert.deepEqual(cxPersistedNextHour(FR, now), { held: 1, checked: 2, days: 7 });
  assert.deepEqual(cxPersistedNextHour(FR, now + 8 * 24 * 3_600_000), { held: 0, checked: 0, days: 7 }, "rolling window");
}

/** A league GGG never lists: bounded re-asks, and one loud warning an hour. */
export async function runAbsentLeagueTests(now: number): Promise<void> {
  const t = 1_000_000;
  assert.equal(absentRetryAt(1, t), t + 6 * 3_600_000);
  assert.equal(absentRetryAt(MAX_ABSENCES - 1, t), t + 6 * 3_600_000);
  assert.equal(absentRetryAt(MAX_ABSENCES, t), Infinity, "given up on after MAX_ABSENCES");

  resetCxIngestState();
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  const failing = {
    digestAt: async (): Promise<never> => {
      throw new Error("offline");
    },
    sleep: async () => undefined,
    resolveNames: stubNames,
  };
  try {
    await syncCxHistory(["Ghost League"], failing, now);
    await syncCxHistory(["Ghost League"], failing, now + 60_000);
  } finally {
    console.warn = original;
  }
  const ghost = warnings.filter((w) => w.includes(`"Ghost League" has no exchange history`));
  assert.equal(ghost.length, 1, "warned once, throttled for an hour");
  resetCxIngestState();
}
