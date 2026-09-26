/* GGG currency-exchange history: ingest, backfill, retention and the league view, against a TEMP
 * DB. Also runs the pure model suite (testCxMarkets.ts).
 * Run: npm run test:cx (src/scripts/runWithTestEnv.ts sets DB_PATH). NO NETWORK. */
import assert from "node:assert/strict";
import { CX_HOUR_SECONDS, type CxDigest } from "../api/cxClient";
import { config } from "../config/env";
import {
  CX_MAX_FETCHES_PER_RUN,
  CX_REQUEST_GAP_MS,
  ingestCxDigest,
  missingRequestHours,
  pruneCxMarketHistory,
  resetCxIngestState,
  syncCxHistory,
  type CxHistorySources,
} from "../core/cx/cxIngest";
import { loadCxMarketView } from "../core/cx/cxItemMarkets";
import { loadCxRoutes, ROUTE_MIN_HELD } from "../core/cx/cxRouteView";
import type { PricedItem } from "../api/types";
import { getDb } from "../db/database";
import { cxItemNames, newestCxHour } from "../db/cxMarketQueries";
import { FR, H0, IDS, PRIVATE, digestAt, hourId, market, omenMarkets, simulacrumMarkets, stubNames } from "./cxTestFixtures";
import { runCxModelTests } from "./testCxMarkets";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

const db = getDb();
db.exec("DELETE FROM cx_markets; DELETE FROM cx_ingest; DELETE FROM cx_items;");

/** "Now" = ten minutes into the hour after the captured digest, so its hour is the newest one. */
const NOW = H0 * 1000 + 10 * 60_000;

main()
  .then(() => {
    db.close();
    console.log("ALL PASS — cx market model, fees, persistence, mapping, ingest, backfill and retention");
  })
  .catch((error: unknown) => {
    db.close();
    console.error(error);
    process.exit(1);
  });

async function main(): Promise<void> {
  runCxModelTests();
  testIngestIsIdempotentAndExcludesPrivate();
  await testBackfillIsBoundedAndPolite();
  testLeagueViewAndStaleness();
  testRouteView();
  testRetention();
  console.log("  ok — ingest, backfill, league view, retention");
}

function count(sql: string, ...args: unknown[]): number {
  return (db.prepare(sql).get(...args) as { c: number }).c;
}

function testIngestIsIdempotentAndExcludesPrivate(): void {
  const digest = digestAt(H0, [...omenMarkets(), ...omenMarkets(PRIVATE)]);
  const first = ingestCxDigest(digest, [FR, PRIVATE], stubNames);
  assert.deepEqual(Object.keys(first), [FR], "a private league is refused even when asked for");
  assert.equal(first[FR], 5, "3 real base markets + 2 omen markets");
  assert.equal(count("SELECT COUNT(*) c FROM cx_markets WHERE league = ?", PRIVATE), 0);
  // "Standard" is in the payload but not polled → not stored
  assert.equal(count("SELECT COUNT(*) c FROM cx_markets WHERE league = 'Standard'"), 0);

  ingestCxDigest(digest, [FR], stubNames);
  assert.equal(count("SELECT COUNT(*) c FROM cx_markets"), 5, "re-ingesting the same hour adds nothing");
  const bumped = digestAt(H0, [omenMarkets()[0]!, { ...omenMarkets()[1]!, volume_traded: { [IDS.omenOfLight]: 7, [IDS.exalted]: 70 } }]);
  ingestCxDigest(bumped, [FR], stubNames);
  const row = db
    .prepare("SELECT volume_a, volume_b FROM cx_markets WHERE league = ? AND hour = ? AND item_a = ? AND item_b = ?")
    .get(FR, H0, IDS.exalted, IDS.omenOfLight) as { volume_a: number; volume_b: number } | undefined;
  assert.deepEqual(row, { volume_a: 70, volume_b: 7 }, "a re-ingest overwrites the same key");
  assert.equal(count("SELECT COUNT(*) c FROM cx_markets WHERE hour = ? AND item_b = ?", H0, IDS.omenOfLight), 2);
  assert.equal(cxItemNames().get(IDS.omenOfLight), "Omen of Light", "names resolved at ingest");
  assert.throws(() => ingestCxDigest({ ...digest, markets: [] }, [FR], stubNames), /no markets/);
}

function sources(available: ReadonlyMap<number, CxDigest>, calls: { fetched: number[]; slept: number[] }): CxHistorySources {
  return {
    digestAt: async (hour) => {
      calls.fetched.push(hour);
      const d = available.get(hour + CX_HOUR_SECONDS);
      if (d == null) throw new Error(`no digest for ${hour}`);
      return d;
    },
    sleep: async (ms) => {
      calls.slept.push(ms);
    },
    resolveNames: stubNames,
  };
}

async function testBackfillIsBoundedAndPolite(): Promise<void> {
  db.exec("DELETE FROM cx_markets; DELETE FROM cx_ingest;");
  resetCxIngestState();
  const available = new Map<number, CxDigest>();
  for (let k = 0; k < 6; k++) available.set(hourId(k), digestAt(hourId(k), [...omenMarkets(), ...simulacrumMarkets(12)]));
  assert.equal(missingRequestHours([FR], NOW).length, config.cx.backfillHours);

  const calls = { fetched: [] as number[], slept: [] as number[] };
  const stored = await syncCxHistory([FR], sources(available, calls), NOW);
  assert.equal(stored, 6);
  assert.equal(calls.fetched.length, CX_MAX_FETCHES_PER_RUN, "bounded per run");
  assert.equal(calls.fetched[0], H0 - CX_HOUR_SECONDS, "newest hour first");
  assert.deepEqual(calls.slept, Array(CX_MAX_FETCHES_PER_RUN - 1).fill(CX_REQUEST_GAP_MS), "≤ 1 request / 2 s");
  assert.equal(newestCxHour(FR), H0);

  // Second run: stored hours are never re-fetched, and the six that just failed are backed off.
  const again = { fetched: [] as number[], slept: [] as number[] };
  await syncCxHistory([FR], sources(available, again), NOW);
  assert.equal(again.fetched.length, config.cx.backfillHours - CX_MAX_FETCHES_PER_RUN);
  assert.ok(again.fetched.every((h) => !calls.fetched.includes(h)));

  // A digest for the wrong hour is refused rather than filed under the hour we asked for.
  resetCxIngestState();
  const wrong = new Map([[hourId(8), digestAt(hourId(9), omenMarkets())]]);
  await syncCxHistory([FR], sources(wrong, { fetched: [], slept: [] }), NOW);
  assert.equal(count("SELECT COUNT(*) c FROM cx_ingest WHERE hour IN (?, ?)", hourId(8), hourId(9)), 0);
}

function testLeagueViewAndStaleness(): void {
  const ninja = [
    { itemId: "omen-of-light", itemName: "Omen of Light" },
    { itemId: "simulacrum", itemName: "Simulacrum" },
    { itemId: "chaos", itemName: "Chaos Orb" },
  ];
  const view = loadCxMarketView(FR, ninja, NOW);
  assert.ok(view != null);
  assert.equal(view.newestHour, H0);
  assert.equal(view.byItemId.get("simulacrum")?.persistence6, 6);
  assert.equal(view.byItemId.get("omen-of-light")?.kind, "band");
  assert.ok(view.coverage.mapped >= 3);
  assert.equal(loadCxMarketView(FR, ninja, NOW + 4 * 3_600_000), null, "a 4h-old newest hour is not the market now");
  assert.equal(loadCxMarketView("No Such League", ninja, NOW), null);
}

function testRouteView(): void {
  const ninja: PricedItem[] = [
    { itemId: "simulacrum", itemName: "Simulacrum", category: "Fragments", baseValue: 3, volume: 600, change7d: null, spark7d: null, icon: "sim.png" },
  ];
  const view = loadCxRoutes(FR, ninja, NOW);
  assert.ok(view != null);
  const sim = view.routes.find((r) => r.itemId === "simulacrum" && r.from === "DIVINE" && r.to === "EXALT");
  assert.ok(sim, "Div → Simulacrum → Ex → Div held all six hours");
  assert.equal(sim.held6, 6);
  assert.equal(sim.icon, "sim.png");
  assert.ok(sim.capDivPerHour != null && Math.abs(sim.capDivPerHour - sim.capUnitsPerHour * 3) < 1e-9);
  assert.ok(view.routes.every((r) => r.held6 >= ROUTE_MIN_HELD));
  assert.equal(loadCxRoutes(FR, ninja, NOW + 4 * 3_600_000), null);
}

function testRetention(): void {
  const oldHour = H0 - (config.cx.historyDays + 1) * 24 * CX_HOUR_SECONDS;
  ingestCxDigest(digestAt(oldHour, [market(FR, IDS.omenOfLight, IDS.divine, 1, 8)]), [FR], stubNames);
  const before = count("SELECT COUNT(*) c FROM cx_markets");
  const removed = pruneCxMarketHistory(NOW);
  assert.equal(removed, 4, "only the out-of-window hour (3 base + 1 omen market) is removed");
  assert.equal(count("SELECT COUNT(*) c FROM cx_markets"), before - 4);
  assert.equal(count("SELECT COUNT(*) c FROM cx_ingest WHERE hour = ?", oldHour), 0);
  assert.equal(newestCxHour(FR), H0);
}
