import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { config } from "../config/env";
import { pickBusiestChallengeLeague, type DerivedLeague } from "../core/leagueDerivation";
import type { LeagueListSnapshot } from "../core/leagueList";
import { clearLeagueCache, getDefaultLeague, setActiveLeague } from "../core/leagueState";
import type { LeagueActivityTotal } from "../db/cxActivityQueries";
import { readLeagueState } from "../db/leagueQueries";
import { checkLeagueOnce, detectCurrentLeague, type LeagueSources } from "../scheduler/leagueWatcher";

/** GGG's list as trade2 /data/leagues returns it (see fixtures/trade2-leagues.json). */
const GGG_LIST = ["Forbidden Rites", "HC Forbidden Rites", "Runes of Aldur", "HC Runes of Aldur", "Standard", "Hardcore"];

// Deliberately not a real league name: the fixture must differ from LEAGUE_NAME in .env.local,
// whatever the developer running this has configured.
const DETECTED = "Detected Test League";

const db = new Database(":memory:");
db.pragma("foreign_keys = ON");
db.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));
db.prepare(`
  INSERT INTO users (id, name, password_hash, api_key, role)
  VALUES (?, ?, 'hash', ?, 'owner')
`).run(1, "owner", "pk_owner");
db.prepare(`
  INSERT INTO users (id, name, password_hash, api_key, role)
  VALUES (?, ?, 'hash', ?, 'member')
`).run(2, "member", "pk_member");

main()
  .then(() => {
    db.close();
    console.log("ALL PASS — league derivation, detection, alert dedupe and runtime league switching");
  })
  .catch((error: unknown) => {
    db.close();
    console.error(error);
    process.exit(1);
  });

async function main(): Promise<void> {
  testDerivationRule();
  await testDetection();
  await testAlertDedupe();
  await testActiveLeagueResolution();
  testSwitchRetainsMarketHistory();
  testSetActiveLeagueValidation();
  testCacheIsNotPoisonedByAnExplicitDb();
}

function activity(league: string, divineVolume: number, markets = 10, hours = 24): LeagueActivityTotal {
  return { league, divineVolume, markets, hours };
}

/**
 * Both GGG inputs faked — this suite never touches the network or the CX tables. `derived` is
 * what the stored exchange history would rank first among the listed leagues.
 */
function sources(list: string[] | Error, derived: string | null, staleReason: string | null = null): LeagueSources {
  return {
    leagueList: async (): Promise<LeagueListSnapshot> => {
      if (list instanceof Error) throw list;
      return { names: list, fetchedAt: Date.UTC(2026, 9, 2), staleReason };
    },
    derive: (listed): DerivedLeague | null =>
      derived == null ? null : pickBusiestChallengeLeague(listed, [activity(derived, 5000)]),
    start: () => Date.UTC(2026, 8, 20) / 1000,
  };
}

/** The ranking: most Divine traded among GGG-listed SOFTCORE CHALLENGE leagues, nothing else. */
function testDerivationRule(): void {
  const live = [activity("Forbidden Rites", 250_000, 900), activity("Runes of Aldur", 40_000, 700), activity("Standard", 3_000, 300)];
  assert.equal(pickBusiestChallengeLeague(GGG_LIST, live)?.league, "Forbidden Rites");

  // Standard / Hardcore / HC / SSF / Ruthless never win, however busy.
  const permanentBusier = [activity("Standard", 9e9), activity("HC Forbidden Rites", 9e9), activity("SSF Forbidden Rites", 9e9), activity("Runes of Aldur", 1)];
  assert.equal(
    pickBusiestChallengeLeague([...GGG_LIST, "SSF Forbidden Rites", "Ruthless Forbidden Rites"], permanentBusier)?.league,
    "Runes of Aldur",
  );

  // A league GGG does not list (ended, private, typo) never wins, even with the most volume.
  assert.equal(pickBusiestChallengeLeague(GGG_LIST, [activity("Dawn of the Hunt", 9e9), activity("Runes of Aldur", 5)])?.league, "Runes of Aldur");

  // Launch day: the new league overtakes the old one as soon as more Divine trades there.
  const launch = [activity("Runes of Aldur", 40_000), activity("Brand New League", 41_000, 50, 3)];
  assert.equal(pickBusiestChallengeLeague([...GGG_LIST, "Brand New League"], launch)?.league, "Brand New League");

  // No evidence → no claim.
  assert.equal(pickBusiestChallengeLeague(GGG_LIST, []), null);
  assert.equal(pickBusiestChallengeLeague(GGG_LIST, [activity("Forbidden Rites", 0, 0, 0)]), null);
  assert.equal(pickBusiestChallengeLeague(GGG_LIST, [activity("Standard", 100)]), null);

  // Digest names match case-insensitively; GGG's trade2 spelling is returned.
  assert.equal(pickBusiestChallengeLeague(GGG_LIST, [activity("forbidden rites", 10)])?.league, "Forbidden Rites");
  // Equal Divine volume: the league with more traded markets wins.
  const tie = [activity("Forbidden Rites", 100, 5), activity("Runes of Aldur", 100, 9)];
  assert.equal(pickBusiestChallengeLeague(GGG_LIST, tie)?.league, "Runes of Aldur");
  console.log("PASS  derived current league = most CX Divine volume among listed softcore challenge leagues");
}

async function testDetection(): Promise<void> {
  const found = await detectCurrentLeague(sources([...GGG_LIST, DETECTED], DETECTED));
  assert.equal(found.agreed, DETECTED);
  assert.match(found.reports.trade2 ?? "", /^7 leagues, fetched 2026-10-02/);
  assert.match(found.reports.cxVolume ?? "", /5000 Divine over 24 digest hour\(s\), first traded 2026-09-20/);

  // Exchange activity for a league GGG no longer lists → no detection.
  const unlisted = await detectCurrentLeague(sources(GGG_LIST, DETECTED));
  assert.equal(unlisted.agreed, null);
  assert.equal(unlisted.reports.cxVolume, null);

  // A stale list still detects, and says it is stale.
  const stale = await detectCurrentLeague(sources([...GGG_LIST, DETECTED], DETECTED, "HTTP 503"));
  assert.equal(stale.agreed, DETECTED);
  assert.match(stale.reports.trade2 ?? "", /STALE: HTTP 503/);

  // No list at all (nothing cached) → detection throws; the watcher pass survives it.
  await assert.rejects(detectCurrentLeague(sources(new Error("nothing cached"), DETECTED)), /nothing cached/);
  console.log("PASS  detection = GGG list x stored exchange activity; stale and missing lists handled");
}

async function testAlertDedupe(): Promise<void> {
  clearLeagueCache();
  const agreeing = sources([...GGG_LIST, DETECTED], DETECTED);

  const first = await checkLeagueOnce(agreeing, db);
  assert.equal(first.agreed, DETECTED);
  assert.equal(first.alerted, true);
  assert.equal(alertCount(), 2); // market-wide news: one row per user
  assert.equal(readLeagueState(db)?.detected_current, DETECTED);
  assert.equal(readLeagueState(db)?.alerted_league, DETECTED);

  // The same detection 6h later must not re-alert.
  const second = await checkLeagueOnce(agreeing, db);
  assert.equal(second.alerted, false);
  assert.equal(alertCount(), 2);

  // A failed check leaves the recorded detection untouched and fires nothing.
  const down = await checkLeagueOnce(sources(new Error("trade2 down, nothing cached"), DETECTED), db);
  assert.equal(down.agreed, null);
  assert.equal(readLeagueState(db)?.detected_current, DETECTED);
  assert.equal(alertCount(), 2);
}

async function testActiveLeagueResolution(): Promise<void> {
  clearLeagueCache();
  assert.equal(getDefaultLeague(db), config.league); // nothing stored → env fallback

  clearLeagueCache();
  assert.deepEqual(setActiveLeague(`  ${DETECTED}  `, db), { league: DETECTED, changed: true });
  assert.equal(getDefaultLeague(db), DETECTED); // stored setting beats env

  // Switching clears the banner: the target league counts as already alerted…
  assert.equal(readLeagueState(db)?.alerted_league, DETECTED);
  // …and detection of the now-tracked league is no longer news.
  clearLeagueCache();
  const after = await checkLeagueOnce(sources([...GGG_LIST, DETECTED], DETECTED), db);
  assert.equal(after.alerted, false);
  assert.equal(alertCount(), 2);
}

function testSetActiveLeagueValidation(): void {
  clearLeagueCache();
  assert.throws(() => setActiveLeague("   ", db), /must not be empty/);
  assert.throws(() => setActiveLeague("L".repeat(61), db), /at most 60/);
  // Control characters would ride into the Coach system prompt and trade2 URLs.
  assert.throws(() => setActiveLeague("Forbidden\nRites", db), /control characters/);
  assert.throws(() => setActiveLeague(`Forbidden${String.fromCharCode(0)}Rites`, db), /control characters/);
  assert.equal(getDefaultLeague(db), DETECTED); // rejected writes changed nothing
  assert.equal(setActiveLeague("L".repeat(60), db).league.length, 60);
}

/**
 * The purge is GONE. Market tables carry a league column, so a switch must leave every row
 * where it is — the previous behaviour emptied the dashboard and flipped the Coach to
 * "sources unavailable" the moment the owner changed league.
 */
function testSwitchRetainsMarketHistory(): void {
  clearLeagueCache();
  setActiveLeague(DETECTED, db);
  seedMarketHistory(DETECTED);
  assert.deepEqual(historyCounts(DETECTED), { price_snapshots: 1, item_spark: 1, item_values: 1 });

  // Same league (differing only by surrounding space) → not a switch.
  assert.deepEqual(setActiveLeague(`  ${DETECTED}  `, db), { league: DETECTED, changed: false });
  assert.deepEqual(historyCounts(DETECTED), { price_snapshots: 1, item_spark: 1, item_values: 1 });

  // A real switch keeps every row; the newly tracked league simply starts empty.
  const other = "Another Test League";
  clearLeagueCache();
  setActiveLeague(other, db);
  assert.equal(getDefaultLeague(db), other);
  assert.deepEqual(historyCounts(DETECTED), { price_snapshots: 1, item_spark: 1, item_values: 1 });
  assert.deepEqual(historyCounts(other), { price_snapshots: 0, item_spark: 0, item_values: 0 });

  // Two leagues coexist, and a per-league read never sees the other league's rows.
  seedMarketHistory(other);
  assert.deepEqual(historyCounts(other), { price_snapshots: 1, item_spark: 1, item_values: 1 });
  assert.deepEqual(historyCounts(DETECTED), { price_snapshots: 1, item_spark: 1, item_values: 1 });
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM price_snapshots").get() as { count: number }).count,
    2,
  );

  // The rebuilt keys are (league, item_id) / (league, name_key): the same id in a second league
  // inserted fine above, and a repeat WITHIN one league must still collide.
  assert.throws(() => seedSpark(DETECTED), /UNIQUE|PRIMARY KEY/i);
  assert.throws(() => seedValue(other), /UNIQUE|PRIMARY KEY/i);

  // Switching back finds the first league's history exactly as it was left.
  clearLeagueCache();
  setActiveLeague(DETECTED, db);
  assert.deepEqual(historyCounts(DETECTED), { price_snapshots: 1, item_spark: 1, item_values: 1 });
}

function seedSpark(league: string): void {
  db.prepare(
    "INSERT INTO item_spark (league, item_id, spark_7d, change_7d) VALUES (?, 'divine', '[1,2]', 5)",
  ).run(league);
}

function seedValue(league: string): void {
  db.prepare(
    "INSERT INTO item_values (league, name_key, value_div, source) VALUES (?, 'igniferis', 2.5, 'scout')",
  ).run(league);
}

function seedMarketHistory(league: string): void {
  db.prepare(
    `INSERT INTO price_snapshots (league, item_id, item_name, category, chaos_equiv, volume)
     VALUES (?, 'divine', 'Divine Orb', 'Currency', 1, 10)`,
  ).run(league);
  seedSpark(league);
  seedValue(league);
}

function historyCounts(league: string): Record<string, number> {
  const count = (table: string): number =>
    (db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE league = ?`).get(league) as { count: number }).count;
  return {
    price_snapshots: count("price_snapshots"),
    item_spark: count("item_spark"),
    item_values: count("item_values"),
  };
}


/**
 * The module cache is not keyed by connection, so it must never be populated from an explicit
 * database — otherwise one maintenance/test read hands the wrong league to every production
 * caller for the next 60s.
 */
function testCacheIsNotPoisonedByAnExplicitDb(): void {
  const other = new Database(":memory:");
  other.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));
  other.prepare("INSERT INTO app_settings (key, value) VALUES ('league', 'Other DB League')").run();

  clearLeagueCache();
  const tracked = getDefaultLeague(db);
  assert.equal(getDefaultLeague(other), "Other DB League");
  assert.equal(getDefaultLeague(db), tracked); // would be "Other DB League" if the read were cached
  other.close();
}

function alertCount(): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE type = 'LEAGUE'").get() as {
    count: number;
  };
  return row.count;
}
