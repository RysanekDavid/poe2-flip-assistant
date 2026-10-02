/* Per-league exchange activity (cx_league_activity) and the default-league / league-start
 * derivations built on it. Runs inside test:cx (temp DB via runWithTestEnv). NO NETWORK. */
import assert from "node:assert/strict";
import { CX_HOUR_SECONDS } from "../api/cxClient";
import { ingestCxDigest } from "../core/cx/cxIngest";
import { summarizeLeagueActivity } from "../core/cx/leagueActivity";
import { ACTIVITY_WINDOW_HOURS, deriveCurrentLeague, deriveLeagueStart } from "../core/leagueDerivation";
import { activityBounds, leagueActivitySince, pruneLeagueActivity, recordLeagueActivity } from "../db/cxActivityQueries";
import { ensureCxTables } from "../db/cxMigrations";
import { recordStartHour } from "../db/cxStartQueries";
import { getDb } from "../db/database";
import { FR, H0, PRIVATE, REAL_DIGEST, digestAt, omenMarkets, stubNames } from "./cxTestFixtures";

const OLD = "LA Old League";
const NEW = "LA New League";
const DATED = "LA Dated League";

export function runLeagueActivityTests(nowMs: number): void {
  testSummary();
  testIngestRecordsEveryPublicLeague();
  testDerivedCurrentLeague(nowMs);
  testDerivedStart();
  testSeedFromStoredMarkets();
  testPrune();
  console.log("  ok — league activity: summary, ingest of every public league, derived current league + start, seed, prune");
}

/** The captured digest: Forbidden Rites + Standard + two private leagues. */
function testSummary(): void {
  const rows = summarizeLeagueActivity(REAL_DIGEST);
  const byLeague = new Map(rows.map((r) => [r.league, r]));
  assert.deepEqual([...byLeague.keys()].sort(), [FR, "Standard"], "private (PLnnn) leagues never summarized");
  assert.deepEqual(byLeague.get(FR), { league: FR, hour: H0, markets: 3, divineVolume: 253_902 });
  assert.deepEqual(byLeague.get("Standard"), { league: "Standard", hour: H0, markets: 3, divineVolume: 3_002 });
}

/** Polled or not, every public league's activity lands — a new league is seen before anyone polls it. */
function testIngestRecordsEveryPublicLeague(): void {
  const hour = H0 + 5 * CX_HOUR_SECONDS;
  ingestCxDigest(digestAt(hour, [...omenMarkets(), ...omenMarkets(PRIVATE)]), [FR], stubNames);
  const stored = getDb().prepare("SELECT league, markets FROM cx_league_activity WHERE hour = ? ORDER BY league").all(hour);
  assert.deepEqual(stored, [
    { league: FR, markets: 5 },
    { league: "Standard", markets: 3 },
  ]);
  getDb().prepare("DELETE FROM cx_league_activity WHERE hour = ?").run(hour);
  getDb().prepare("DELETE FROM cx_markets WHERE hour = ?").run(hour);
  getDb().prepare("DELETE FROM cx_ingest WHERE hour = ?").run(hour);
}

function testDerivedCurrentLeague(nowMs: number): void {
  const outside = H0 - (ACTIVITY_WINDOW_HOURS + 6) * CX_HOUR_SECONDS;
  recordLeagueActivity([
    // A huge day for the old league, but outside the window: it no longer counts.
    { league: OLD, hour: outside, markets: 900, divineVolume: 9_000_000 },
    { league: OLD, hour: H0 - CX_HOUR_SECONDS, markets: 400, divineVolume: 20_000 },
    { league: OLD, hour: H0, markets: 400, divineVolume: 20_000 },
    { league: NEW, hour: H0 - CX_HOUR_SECONDS, markets: 100, divineVolume: 15_000 },
    { league: NEW, hour: H0, markets: 200, divineVolume: 30_000 },
  ]);
  const derived = deriveCurrentLeague([OLD, NEW, "Standard", `HC ${NEW}`], nowMs);
  assert.deepEqual(derived, { league: NEW, divineVolume: 45_000, markets: 300, hours: 2 });
  // GGG not listing the new league (yet) means the old one stays the answer.
  assert.equal(deriveCurrentLeague([OLD, "Standard"], nowMs)?.league, OLD);
  // A window that holds nothing for the listed leagues → no claim.
  assert.equal(deriveCurrentLeague([OLD, NEW], nowMs + 10 * 24 * 3_600_000), null);
  const totals = leagueActivitySince(H0 - CX_HOUR_SECONDS).find((t) => t.league === OLD);
  assert.deepEqual(totals, { league: OLD, hours: 2, markets: 800, divineVolume: 40_000 });
}

function testDerivedStart(): void {
  // NEW first traded at H0 − 1h (END boundary) while the record already held earlier hours.
  assert.equal(deriveLeagueStart(NEW), H0 - 2 * CX_HOUR_SECONDS, "reported as the START of its first hour");
  // A league whose first stored hour IS the start of our record may predate it: no claim.
  const { recordFirst } = activityBounds(NEW);
  assert.ok(recordFirst != null);
  recordLeagueActivity([{ league: "LA Ancient League", hour: recordFirst, markets: 5, divineVolume: 10 }]);
  assert.equal(deriveLeagueStart("LA Ancient League"), null);
  assert.equal(deriveLeagueStart("LA Unknown League"), null);
  // The league-start backfill's archive-dated start wins, and HC variants share their base's.
  recordStartHour(DATED, H0 - 100 * CX_HOUR_SECONDS);
  recordLeagueActivity([{ league: DATED, hour: H0, markets: 1, divineVolume: 1 }]);
  assert.equal(deriveLeagueStart(DATED), H0 - 100 * CX_HOUR_SECONDS);
  assert.equal(deriveLeagueStart(`HC ${DATED}`), H0 - 100 * CX_HOUR_SECONDS);
  getDb().prepare("DELETE FROM cx_start_meta WHERE league = ?").run(DATED);
}

/** First boot with the new table: it is filled from the market history already stored. */
function testSeedFromStoredMarkets(): void {
  const db = getDb();
  const marketHours = db.prepare("SELECT COUNT(DISTINCT hour) AS c FROM cx_markets WHERE league = ?").get(FR) as { c: number };
  assert.ok(marketHours.c > 0, "earlier tests stored FR market history");
  const snapshot = db.prepare("SELECT * FROM cx_league_activity").all() as Array<Record<string, unknown>>;
  db.exec("DELETE FROM cx_league_activity");
  ensureCxTables(db);
  const seeded = db.prepare("SELECT COUNT(*) AS c FROM cx_league_activity WHERE league = ?").get(FR) as { c: number };
  assert.equal(seeded.c, marketHours.c, "one activity row per stored FR market hour");
  // Not empty any more → a second boot does not re-seed (or duplicate).
  const before = (db.prepare("SELECT COUNT(*) AS c FROM cx_league_activity").get() as { c: number }).c;
  ensureCxTables(db);
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM cx_league_activity").get() as { c: number }).c, before);
  db.exec("DELETE FROM cx_league_activity");
  const put = db.prepare("INSERT INTO cx_league_activity (league, hour, markets, divine_volume) VALUES (@league, @hour, @markets, @divine_volume)");
  for (const row of snapshot) put.run(row);
}

function testPrune(): void {
  const cutoff = H0 - ACTIVITY_WINDOW_HOURS * CX_HOUR_SECONDS;
  const removed = pruneLeagueActivity(cutoff);
  assert.ok(removed >= 1, "the out-of-window OLD hour goes");
  const left = getDb().prepare("SELECT COUNT(*) AS c FROM cx_league_activity WHERE hour < ?").get(cutoff) as { c: number };
  assert.equal(left.c, 0);
}
