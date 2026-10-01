/* CX price shadow: pure pricing (testCxPricing.ts), the comparison report, the poller sync,
 * retention and the owner endpoint, against a TEMP DB.
 * Run: npm run test:cx (src/scripts/runWithTestEnv.ts sets DB_PATH). NO NETWORK. */
import assert from "node:assert/strict";
import { CX_HOUR_SECONDS, CX_USER_AGENT } from "../api/cxClient";
import { config } from "../config/env";
import { CX_SHADOW_MAX_HOURS_PER_RUN, loadCxShadowReport, pruneCxPriceShadow, syncCxPriceShadow } from "../core/cx/cxPriceShadow";
import { buildCxShadowReport, ninjaAt, percentile } from "../core/cx/cxShadowReport";
import { getDb } from "../db/database";
import { storeCxHour } from "../db/cxMarketQueries";
import { shadowedHours, shadowPricesBetween, type StoredShadowPrice } from "../db/cxShadowQueries";
import { toSqliteTime } from "../db/priceAtQueries";
import { cxShadowResponse } from "../lib/cxShadowResponse";
import { FR, HP, ID_MAP, PIDS, PRICING_DIGEST, baseMarkets, rowsAt, runCxPricingTests } from "./testCxPricing";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

const db = getDb();
db.exec(`DELETE FROM cx_markets; DELETE FROM cx_ingest; DELETE FROM cx_price_shadow; DELETE FROM cx_price_shadow_hours;
  DELETE FROM price_snapshots;`);

/** Ten minutes after the fixture hour's end. */
const NOW = HP * 1000 + 10 * 60_000;
const H = CX_HOUR_SECONDS;

main()
  .then(() => {
    db.close();
    console.log("ALL PASS — cx price shadow: pricing, report, sync, retention, endpoint");
  })
  .catch((error: unknown) => {
    db.close();
    console.error(error);
    process.exit(1);
  });

async function main(): Promise<void> {
  runCxPricingTests();
  testReportMaths();
  testSyncOrderAndIdempotence();
  testLateHourRepricesLaterCarries();
  testSyncCap();
  assert.match(CX_USER_AGENT, /^poe2-coach\/1\.0( \(contact: [^)]+\))?$/, "digest requests identify the tool, no browser UA");
  testLoadReport();
  testRetention();
  await testEndpointGate();
}

function shadow(exchangeId: string, hour: number, priceDiv: number, method: StoredShadowPrice["method"] = "direct"): StoredShadowPrice {
  return { hour, exchangeId, priceDiv, method, units: 10, volumeDiv: 5, legs: 1, tradedHour: method === "carried" ? hour - H : hour };
}

function testReportMaths(): void {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.ok(Math.abs((percentile([0, 10], 0.9) ?? 0) - 9) < 1e-12);
  // Pairing window (H − 1h, H + 1h]: the newest point inside wins, the lower edge is excluded.
  const series: Array<[number, number]> = [[HP - H, 1], [HP - 60, 2], [HP + H, 3], [HP + H + 1, 4]];
  assert.equal(ninjaAt(series, HP), 3);
  assert.equal(ninjaAt([[HP - H, 1]], HP), null);
  assert.equal(ninjaAt(undefined, HP), null);

  const at = (s: number): string => toSqliteTime(s * 1000);
  const report = buildCxShadowReport({
    league: FR,
    hoursRequested: 2,
    hours: { computed: 2, fromHour: HP - H, toHour: HP },
    unitExchangeId: "u",
    unmapped: [{ digestId: "X", name: "Ex" }],
    nameOf: (id) => id.toUpperCase(),
    shadow: [shadow("a", HP - H, 1.1), shadow("a", HP, 0.9), shadow("b", HP, 2, "bridge"), shadow("c", HP, 5, "carried"), shadow("d", HP, 1)],
    ninja: [
      { itemId: "a", itemName: "A", priceDiv: 1, fetchedAt: at(HP - H + 60) },
      { itemId: "a", itemName: "A", priceDiv: 1, fetchedAt: at(HP + 60) },
      { itemId: "b", itemName: "B", priceDiv: 1, fetchedAt: at(HP + 120) },
      { itemId: "c", itemName: "C", priceDiv: 4, fetchedAt: at(HP) },
      { itemId: "n", itemName: "N", priceDiv: 7, fetchedAt: at(HP) },
      { itemId: "u", itemName: "Unit", priceDiv: 1, fetchedAt: at(HP) },
    ],
  });
  assert.deepEqual(
    [report.coverage.cxTraded, report.coverage.cxCarriedOnly, report.coverage.ninja, report.coverage.both],
    [4, 1, 5, 4],
    "the Divine unit counts as present on both sides",
  );
  assert.deepEqual(report.coverage.ninjaOnly, [{ exchangeId: "n", name: "N" }]);
  assert.deepEqual(report.coverage.cxOnly, [{ exchangeId: "d", name: "D" }]);
  assert.equal(report.traded.n, 3, "carried, unmatched and unit rows stay out of the traded stats");
  assert.ok(Math.abs((report.traded.medianAbsPct ?? 0) - 10) < 1e-9);
  assert.equal(report.byMethod.carried.n, 1);
  assert.ok(Math.abs((report.byMethod.carried.medianSignedPct ?? 0) - 25) < 1e-9);
  assert.deepEqual(report.outliers.map((o) => o.exchangeId), ["b", "a"], "worst median |dev| first, traded only");
  assert.deepEqual(report.byLiquidity.map((t) => t.n), [0, 3, 0], "every traded test row filled 5 Div");
  assert.deepEqual([report.outliers[1]?.hours, report.outliers[1]?.cxDiv], [2, 0.9], "newest hour's values shown");
  assert.deepEqual([report.fromHour, report.toHour, report.coverage.unmapped], [HP - H, HP, [{ digestId: "X", name: "Ex" }]]);
}

/** Store the fixture's FR markets (or base-only) as an ingested hour. */
function ingest(hour: number, full: boolean): void {
  storeCxHour(FR, hour, rowsAt(full ? PRICING_DIGEST.markets : baseMarkets(), hour));
}

function testSyncOrderAndIdempotence(): void {
  // Backfill stores newest first; the shadow must still price oldest first so carry works.
  ingest(HP, true);
  ingest(HP - 2 * H, true);
  ingest(HP - H, false);
  const first = syncCxPriceShadow([FR, "Some League (PL123)"], NOW, ID_MAP);
  assert.deepEqual([first.hours, first.pending, first.forgotten], [3, 0, 0], "private leagues are never priced");
  const mid = new Map(shadowPricesBetween(FR, HP - H, HP - H).map((p) => [p.exchangeId, p]));
  assert.equal(mid.get("essence-of-the-abyss")?.method, "carried", "the quiet hour carried from the hour before it");
  assert.equal(mid.get("essence-of-the-abyss")?.tradedHour, HP - 2 * H);
  assert.equal(mid.get("exalted")?.method, "direct");
  assert.deepEqual([...shadowedHours(FR, 0)].sort(), [HP - 2 * H, HP - H, HP]);
  const again = syncCxPriceShadow([FR], NOW, ID_MAP);
  assert.deepEqual([again.hours, again.rows], [0, 0], "priced hours are never recomputed");
  const hourRow = db.prepare("SELECT priced, carried, unmapped_ids AS ids FROM cx_price_shadow_hours WHERE league = ? AND hour = ?").get(FR, HP);
  assert.deepEqual(hourRow, { priced: 8, carried: 0, ids: JSON.stringify([PIDS.shard]) });
}

/** An older hour stored AFTER newer hours were priced re-queues them, so their carries include it. */
function testLateHourRepricesLaterCarries(): void {
  const league = "Late League";
  const store = (hour: number, full: boolean): void =>
    storeCxHour(league, hour, rowsAt(full ? PRICING_DIGEST.markets : baseMarkets(), hour).map((r) => ({ ...r, league })));
  store(HP - 2 * H, false);
  store(HP, false);
  assert.equal(syncCxPriceShadow([league], NOW, ID_MAP).hours, 2);
  const essenceAt = (hour: number): StoredShadowPrice | undefined =>
    shadowPricesBetween(league, hour, hour).find((p) => p.exchangeId === "essence-of-the-abyss");
  assert.equal(essenceAt(HP), undefined, "nothing to carry yet");

  store(HP - H, true); // the backfill fills the gap late
  const late = syncCxPriceShadow([league], NOW, ID_MAP);
  assert.deepEqual([late.hours, late.forgotten, late.pending], [2, 1, 0], "the late hour, then the newer hour it re-queued");
  assert.deepEqual([essenceAt(HP)?.method, essenceAt(HP)?.tradedHour], ["carried", HP - H]);
  assert.equal(essenceAt(HP - 2 * H), undefined, "older hours are never touched");
  db.exec(`DELETE FROM cx_markets WHERE league = 'Late League'; DELETE FROM cx_ingest WHERE league = 'Late League';
    DELETE FROM cx_price_shadow WHERE league = 'Late League'; DELETE FROM cx_price_shadow_hours WHERE league = 'Late League';`);
}

function testSyncCap(): void {
  const league = "Cap League";
  const hours = Array.from({ length: CX_SHADOW_MAX_HOURS_PER_RUN + 1 }, (_, i) => HP - i * H);
  for (const h of hours) storeCxHour(league, h, rowsAt(baseMarkets(), h).map((r) => ({ ...r, league })));
  const first = syncCxPriceShadow([league], NOW, ID_MAP);
  assert.deepEqual([first.hours, first.pending], [CX_SHADOW_MAX_HOURS_PER_RUN, 1]);
  assert.ok(!shadowedHours(league, 0).has(HP), "the cap leaves the NEWEST hour for later, oldest go first");
  assert.equal(syncCxPriceShadow([league], NOW, ID_MAP).hours, 1);
  db.exec(`DELETE FROM cx_markets WHERE league = 'Cap League'; DELETE FROM cx_ingest WHERE league = 'Cap League';
    DELETE FROM cx_price_shadow WHERE league = 'Cap League'; DELETE FROM cx_price_shadow_hours WHERE league = 'Cap League';`);
}

function testLoadReport(): void {
  const insert = db.prepare(
    "INSERT INTO price_snapshots (league, item_id, item_name, category, chaos_equiv, volume, fetched_at) VALUES (?, ?, ?, 'Currency', ?, 1, ?)",
  );
  insert.run(FR, "exalted", "Exalted Orb", 0.001437, toSqliteTime((HP + 300) * 1000));
  insert.run(FR, "essence-of-the-abyss", "Essence of the Abyss", 0.2938, toSqliteTime((HP - 1800) * 1000));
  insert.run(FR, "mirror-of-kalandra", "Mirror of Kalandra", 9000, toSqliteTime((HP - 600) * 1000));
  insert.run(FR, "stale-item", "Stale", 1, toSqliteTime((HP - 30 * H) * 1000)); // outside the window
  const report = loadCxShadowReport(FR, 2, NOW);
  assert.deepEqual([report.fromHour, report.toHour, report.hoursComputed], [HP - H, HP, 2]);
  assert.equal(report.coverage.ninja, 3, "the stale ninja item is outside the window");
  assert.deepEqual(report.coverage.ninjaOnly.map((i) => i.name), ["Mirror of Kalandra"]);
  assert.ok(report.coverage.cxOnly.some((i) => i.name === "Divine Orb"), "names come from the entity catalog");
  assert.equal(report.traded.n, 2, "exalted + essence at the newest hour; the carried essence hour pairs too");
  assert.equal(report.byMethod.carried.n, 1);
  assert.deepEqual(report.coverage.unmapped.map((u) => u.digestId), [PIDS.shard], "distinct across hours, ids kept");
  assert.throws(() => loadCxShadowReport(FR, 0, NOW), RangeError);
}

function testRetention(): void {
  const old = HP - (config.retentionDays * 24 + 2) * H;
  ingest(old, false);
  syncCxPriceShadow([FR], (old + 600) * 1000, ID_MAP);
  assert.ok(shadowedHours(FR, 0).has(old));
  const removed = pruneCxPriceShadow(NOW, true);
  assert.ok(removed != null && removed > 0);
  assert.ok(!shadowedHours(FR, 0).has(old), "an hour past retentionDays is dropped");
  assert.ok(shadowedHours(FR, 0).has(HP), "recent hours stay");
  assert.equal(pruneCxPriceShadow(NOW), null, "not due again within the hour");
}

async function testEndpointGate(): Promise<void> {
  const url = (q: string): URL => new URL(`http://x/api/system/cx-shadow${q}`);
  const calls: Array<[string, number]> = [];
  const load = (league: string, hours: number): ReturnType<typeof loadCxShadowReport> => {
    calls.push([league, hours]);
    return loadCxShadowReport(league, hours, NOW);
  };
  const owner = { id: 1, role: "owner" as const };
  assert.equal(cxShadowResponse(null, url(""), load).status, 401);
  assert.equal(cxShadowResponse({ id: 2, role: "member" }, url(""), load).status, 403);
  assert.equal(cxShadowResponse(owner, url("?hours=0"), load).status, 400);
  assert.equal(cxShadowResponse(owner, url("?hours=abc"), load).status, 400);
  assert.equal(calls.length, 0, "rejected requests never load");
  const ok = cxShadowResponse(owner, url("?hours=2"), load, () => FR);
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { league: string; hoursRequested: number };
  assert.deepEqual([body.league, body.hoursRequested], [FR, 2]);
  assert.equal(cxShadowResponse(owner, url(`?league=${encodeURIComponent(FR)}`), load).status, 200);
  assert.deepEqual(calls, [[FR, 2], [FR, 24]], "default 24h; explicit league honoured");
}
