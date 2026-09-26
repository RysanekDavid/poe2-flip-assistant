/* Outcome loop (published edge → next hour hit/miss) and the absent-league safeguards, against the
 * TEMP DB testCxHistory.ts has filled. Run via npm run test:cx. NO NETWORK. */
import assert from "node:assert/strict";
import { CX_HOUR_SECONDS } from "../api/cxClient";
import { absentRetryAt, ingestCxDigest, MAX_ABSENCES, resetCxIngestState, syncCxHistory } from "../core/cx/cxIngest";
import { cxHitRate, trackCxOutcomes } from "../core/cx/cxOutcomes";
import { getDb } from "../db/database";
import { FR, H0, IDS, digestAt, simulacrumMarkets, stubNames } from "./cxTestFixtures";

type Row = { item: string; hour: number; buy_quote: string; sell_quote: string; next_net_pct: number | null; outcome: string | null };

function outcomes(): Row[] {
  return getDb()
    .prepare("SELECT item, hour, buy_quote, sell_quote, next_net_pct, outcome FROM cx_edge_outcomes WHERE league = ? ORDER BY hour")
    .all(FR) as Row[];
}

/**
 * Expects six stored hours ending at H0 in which Simulacrum held a 12% Div → Ex edge every hour —
 * the only item that passes the rank gate (the rib is thin, the Vaal Siphoner implausible, Omen
 * and the base currencies coarse).
 */
export function runCxOutcomeTests(): void {
  getDb().exec("DELETE FROM cx_edge_outcomes;");
  assert.deepEqual(trackCxOutcomes(FR), { resolved: 0, published: 1 });
  assert.deepEqual(trackCxOutcomes(FR), { resolved: 0, published: 0 }, "publishing is idempotent per item-hour");
  const [first] = outcomes();
  assert.ok(first != null);
  assert.deepEqual([first.item, first.hour, first.buy_quote, first.sell_quote], [IDS.simulacrum, H0, IDS.divine, IDS.exalted]);
  assert.equal(first.outcome, null, "pending until the next hour is stored");

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
  assert.deepEqual(cxHitRate(FR, now), { hits: 1, resolved: 2, days: 7 });
  assert.deepEqual(cxHitRate(FR, now + 8 * 24 * 3_600_000), { hits: 0, resolved: 0, days: 7 }, "rolling window");
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
