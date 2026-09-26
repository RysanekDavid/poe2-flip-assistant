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
  cxHistoryProblem,
  type CxHistorySources,
} from "../core/cx/cxIngest";
import { loadCxMarketView } from "../core/cx/cxItemMarkets";
import { loadCxRoutes, ROUTE_MIN_HELD } from "../core/cx/cxRouteView";
import type { PricedItem } from "../api/types";
import { getDb } from "../db/database";
import { cxItemNames, ingestedMarketCount, newestCxHour } from "../db/cxMarketQueries";
import {
  FR,
  H0,
  IDS,
  PRIVATE,
  REAL_DIGEST,
  digestAt,
  hourId,
  implausibleMarkets,
  market,
  omenMarkets,
  simulacrumMarkets,
  stubNames,
  thinRibMarkets,
} from "./cxTestFixtures";
import { runCxModelTests } from "./testCxMarkets";
import { runAbsentLeagueTests, runCxOutcomeTests } from "./testCxOutcomes";

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
  testAbsentLeagueIsNotMarked();
  await testBackfillIsBoundedAndPolite();
  await testOutageStaysRed();
  await testNewestHourGrace();
  testLeagueViewAndStaleness();
  testRouteView();
  testRetention();
  runCxOutcomeTests(); // appends hours after H0 — keep last among the stored-history tests
  await runAbsentLeagueTests(NOW);
  console.log("  ok — ingest, backfill, league view, retention, outcome loop, absent leagues");
}

function count(sql: string, ...args: unknown[]): number {
  return (db.prepare(sql).get(...args) as { c: number }).c;
}

function testIngestIsIdempotentAndExcludesPrivate(): void {
  const digest = digestAt(H0, [...omenMarkets(), ...omenMarkets(PRIVATE)]);
  const first = ingestCxDigest(digest, [FR, PRIVATE], stubNames);
  assert.deepEqual(Object.keys(first.written), [FR], "a private league is refused even when asked for");
  assert.equal(first.written[FR], 5, "3 real base markets + 2 omen markets");
  assert.deepEqual(first.absent, []);
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

/** A polled league the digest does not list is reported, warned about, and NOT marked ingested. */
function testAbsentLeagueIsNotMarked(): void {
  const next = H0 + CX_HOUR_SECONDS;
  const withoutFr = { ...REAL_DIGEST, next_change_id: next, markets: REAL_DIGEST.markets.filter((m) => m.league !== FR) };
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const result = ingestCxDigest(withoutFr, [FR, "Standard"], stubNames);
    assert.deepEqual(result.absent, [FR]);
    assert.ok((result.written.Standard ?? 0) > 0);
  } finally {
    console.warn = original;
  }
  assert.equal(ingestedMarketCount(FR, next), null, "no 0-row hour baked into the window");
  assert.ok(warnings.some((w) => w.includes(`"${FR}" missing from digest`)), "loud: it had markets the hour before");
  db.exec(`DELETE FROM cx_markets WHERE league = 'Standard'; DELETE FROM cx_ingest WHERE league = 'Standard';`);
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
  for (let k = 0; k < 6; k++) {
    available.set(hourId(k), digestAt(hourId(k), [...omenMarkets(), ...simulacrumMarkets(12), ...thinRibMarkets(), ...implausibleMarkets()]));
  }
  assert.equal(missingRequestHours([FR], NOW).length, config.cx.backfillHours);

  const calls = { fetched: [] as number[], slept: [] as number[] };
  const first = await syncCxHistory([FR], sources(available, calls), NOW);
  assert.equal(first.stored, 6);
  assert.equal(first.attempted, CX_MAX_FETCHES_PER_RUN);
  assert.equal(cxHistoryProblem(first), null, "a partial backfill that stored hours is healthy");
  assert.equal(calls.fetched.length, CX_MAX_FETCHES_PER_RUN, "bounded per run");
  assert.equal(calls.fetched[0], H0 - CX_HOUR_SECONDS, "newest hour first");
  assert.deepEqual(calls.slept, Array(CX_MAX_FETCHES_PER_RUN - 1).fill(CX_REQUEST_GAP_MS), "≤ 1 request / 2 s");
  assert.equal(newestCxHour(FR), H0);

  // Second run: stored hours are never re-fetched, and the six that just failed are backed off.
  const again = { fetched: [] as number[], slept: [] as number[] };
  const second = await syncCxHistory([FR], sources(available, again), NOW);
  assert.equal(again.fetched.length, config.cx.backfillHours - CX_MAX_FETCHES_PER_RUN);
  assert.ok(again.fetched.every((h) => !calls.fetched.includes(h)));
  assert.equal(second.deferred, first.attempted - first.stored, "the hours that just failed are counted as backed off");
}

/**
 * A persistent outage must stay red: after the first failed run every missing hour sits in its
 * back-off, so a later run attempts nothing — deferred failures still make it a problem. The
 * wrong-hour digest (a non-network failure) counts as a failure too.
 */
async function testOutageStaysRed(): Promise<void> {
  resetCxIngestState();
  const wrong = new Map([[hourId(8), digestAt(hourId(9), omenMarkets())]]);
  const run = () => syncCxHistory([FR], sources(wrong, { fetched: [], slept: [] }), NOW);
  const first = await run();
  // A digest for the wrong hour is refused rather than filed under the hour we asked for.
  assert.equal(count("SELECT COUNT(*) c FROM cx_ingest WHERE hour IN (?, ?)", hourId(8), hourId(9)), 0);
  assert.equal(first.stored, 0);
  assert.ok(cxHistoryProblem(first) != null, "every attempted hour failed → problem");

  let last = first;
  for (let i = 0; i < 5 && last.attempted > 0; i++) last = await run();
  assert.equal(last.attempted, 0, "eventually every missing hour is backed off");
  assert.ok(last.deferred > 0);
  assert.match(cxHistoryProblem(last) ?? "", /backed off after failures, none stored/, "no flap to green during back-off");
  assert.equal(cxHistoryProblem({ stored: 0, attempted: 0, failed: 0, deferred: 0, lastError: null }), null, "nothing missing is healthy");
}

/** Every request hour of the backfill window is available for `league` except the listed digest ids. */
async function fillHistoryExcept(league: string, skipIds: readonly number[]): Promise<Map<number, CxDigest>> {
  const available = new Map<number, CxDigest>();
  for (let k = 0; k < config.cx.backfillHours; k++) {
    if (!skipIds.includes(hourId(k))) available.set(hourId(k), digestAt(hourId(k), omenMarkets(league)));
  }
  resetCxIngestState(); // back-offs are keyed by hour, not league — earlier tests' would block these hours
  const runs = Math.ceil(config.cx.backfillHours / CX_MAX_FETCHES_PER_RUN) + 1;
  for (let i = 0; i < runs; i++) await syncCxHistory([league], sources(available, { fetched: [], slept: [] }), NOW);
  resetCxIngestState(); // forget those runs' back-offs so each check below starts from a clean slate
  return available;
}

/**
 * GGG routinely has not published the newest completed hour a few minutes past the boundary, so a
 * single failure of THAT hour stays green; a repeat failure of it, or any failure of an older
 * hour, is red.
 */
async function testNewestHourGrace(): Promise<void> {
  const newestLeague = "Grace Newest";
  const onlyNewest = await fillHistoryExcept(newestLeague, [hourId(0)]);
  const run = (league: string, available: Map<number, CxDigest>, at: number) =>
    syncCxHistory([league], sources(available, { fetched: [], slept: [] }), at);
  const once = await run(newestLeague, onlyNewest, NOW);
  assert.deepEqual([once.attempted, once.stored, once.failed], [1, 0, 0], "newest hour tried once, not yet counted");
  assert.equal(cxHistoryProblem(once), null, "one failed newest hour → ok");
  assert.equal(cxHistoryProblem(await run(newestLeague, onlyNewest, NOW + 60_000)), null, "still ok while backed off");
  const twice = await run(newestLeague, onlyNewest, NOW + 31 * 60_000); // retried after the back-off, same hour
  assert.equal(twice.failed, 1);
  assert.match(cxHistoryProblem(twice) ?? "", /1 digest hour\(s\) failed/, "repeated newest-hour failure → red");
  assert.ok(cxHistoryProblem(await run(newestLeague, onlyNewest, NOW + 32 * 60_000)) != null, "and stays red while backed off");

  const olderLeague = "Grace Older";
  const onlyOlder = await fillHistoryExcept(olderLeague, [hourId(5)]);
  const older = await run(olderLeague, onlyOlder, NOW);
  assert.deepEqual([older.attempted, older.failed], [1, 1]);
  assert.ok(cxHistoryProblem(older) != null, "an older hour failing even once → red");
  resetCxIngestState();
}

function testLeagueViewAndStaleness(): void {
  const ninja = [
    { itemId: "omen-of-light", itemName: "Omen of Light" },
    { itemId: "simulacrum", itemName: "Simulacrum" },
    { itemId: "chaos", itemName: "Chaos Orb" },
    { itemId: "preserved-rib", itemName: "Preserved Rib" },
  ];
  const view = loadCxMarketView(FR, ninja, NOW);
  assert.ok(view != null);
  assert.equal(view.newestHour, H0);
  assert.equal(view.byItemId.get("simulacrum")?.edge?.persistence6, 6);
  assert.equal(view.byItemId.get("omen-of-light")?.issue, "coarse");
  assert.equal(view.byItemId.get("preserved-rib")?.issue, "thin");
  assert.equal(view.coverage.mapped, 4);
  assert.equal(loadCxMarketView(FR, ninja, NOW + 4 * 3_600_000), null, "a 4h-old newest hour is not the market now");
  assert.equal(loadCxMarketView("No Such League", ninja, NOW), null);
}

function testRouteView(): void {
  const ninja: PricedItem[] = [
    { itemId: "simulacrum", itemName: "Simulacrum", category: "Fragments", baseValue: 40, volume: 600, change7d: null, spark7d: null, icon: "sim.png" },
  ];
  const view = loadCxRoutes(FR, ninja, NOW);
  assert.ok(view != null);
  const sim = view.routes.find((r) => r.itemId === "simulacrum" && r.from === "DIVINE" && r.to === "EXALT");
  assert.ok(sim, "Div → Simulacrum → Ex → Div held all six hours");
  assert.equal(sim.held6, 6);
  assert.equal(sim.icon, "sim.png");
  assert.ok(sim.capDivPerHour != null && Math.abs(sim.capDivPerHour - sim.capUnitsPerHour * 40) < 1e-9);
  assert.ok(view.routes.every((r) => r.held6 >= ROUTE_MIN_HELD));
  assert.deepEqual(
    view.routes.map((r) => r.item).filter((n) => n !== "Simulacrum"),
    [],
    "the stored thin rib and +80% artefact never become routes",
  );
  assert.equal(loadCxRoutes(FR, ninja, NOW + 4 * 3_600_000), null);
}

function testRetention(): void {
  const oldHour = H0 - (config.cx.historyDays + 1) * 24 * CX_HOUR_SECONDS;
  // An old hour for the polled league AND for a league nobody polls any more: both age out.
  ingestCxDigest(digestAt(oldHour, [market(FR, IDS.omenOfLight, IDS.divine, 1, 8)]), [FR, "Standard"], stubNames);
  const before = count("SELECT COUNT(*) c FROM cx_markets");
  const oldStandard = count("SELECT COUNT(*) c FROM cx_markets WHERE league = 'Standard' AND hour = ?", oldHour);
  assert.ok(oldStandard > 0);
  const removed = pruneCxMarketHistory(NOW, true);
  assert.equal(removed, 4 + oldStandard, "only out-of-window hours go (FR: 3 base + 1 omen), per league");
  assert.equal(count("SELECT COUNT(*) c FROM cx_markets"), before - removed);
  assert.equal(count("SELECT COUNT(*) c FROM cx_ingest WHERE hour = ?", oldHour), 0);
  assert.equal(newestCxHour(FR), H0);
  assert.equal(pruneCxMarketHistory(NOW + 60_000), null, "retention runs at most hourly");
  assert.equal(pruneCxMarketHistory(NOW + 61 * 60_000), 0, "…and again once the hour has passed");
  // the delete is a primary-key range per league, never a table scan
  const plan = db.prepare("EXPLAIN QUERY PLAN DELETE FROM cx_markets WHERE league = ? AND hour < ?").all(FR, 0) as Array<{ detail: string }>;
  assert.ok(plan.some((p) => /USING PRIMARY KEY|USING INDEX/.test(p.detail)), JSON.stringify(plan));
}
