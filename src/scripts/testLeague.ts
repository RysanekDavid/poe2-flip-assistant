import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { parseNinjaLeagues } from "../api/ninjaClient";
import { parseScoutLeagues } from "../api/scoutClient";
import type { LeagueOption } from "../api/types";
import { config } from "../config/env";
import { clearLeagueCache, getActiveLeague, setActiveLeague } from "../core/leagueState";
import { readLeagueState } from "../db/leagueQueries";
import {
  agreeOnLeague,
  checkLeagueOnce,
  currentChallengeLeagues,
  detectCurrentLeague,
  pickOrderedLeague,
  type LeagueSources,
} from "../scheduler/leagueWatcher";

/**
 * Captured from the live poe.ninja endpoint (2026-09): a flat list with NO current/active flag
 * of any kind, ordered newest league first. That ordering is the only signal ninja gives.
 */
const NINJA_RAW: unknown = [
  { id: "Forbidden Rites", name: "Forbidden Rites" },
  { id: "Runes of Aldur", name: "Runes of Aldur" },
  { id: "HC Forbidden Rites", name: "HC Forbidden Rites" },
  { id: "HC Runes of Aldur", name: "HC Runes of Aldur" },
  { id: "Standard", name: "Standard" },
  { id: "Hardcore", name: "Hardcore" },
];

/**
 * Captured verbatim from https://api.poe2scout.com/poe2/Leagues (2026-09). Note the two traps
 * this fixture exists to pin: HC variants are their OWN `Value` (not a shared one), and FOUR
 * leagues carry IsCurrent — the new league and the previous one — so "the flagged league" is
 * not a single answer. Extra keys are included on purpose; the schema must tolerate them.
 */
const SCOUT_RAW: unknown = [
  {
    Value: "Forbidden Rites",
    ShortName: "forbiddenrites",
    IsCurrent: true,
    DivinePrice: 453.9403608264729,
    ChaosDivinePrice: 9.600850488995723,
    BaseCurrencyText: "Exalted Orb",
    BaseCurrencyIconUrl: "https://web.poecdn.com/exalted.png",
    DefaultCurrency: { Text: "Exalted Orb", ApiId: "exalted" },
  },
  { Value: "HC Forbidden Rites", ShortName: "forbiddenriteshc", IsCurrent: true, DivinePrice: 173.28, ChaosDivinePrice: 8.53 },
  { Value: "Dawn of the Hunt", ShortName: "hunt", IsCurrent: false, DivinePrice: 1828.43, ChaosDivinePrice: 20.31 },
  { Value: "Rise of the Abyssal", ShortName: "abyssal", IsCurrent: false, DivinePrice: 1000, ChaosDivinePrice: 25.64 },
  { Value: "Standard", ShortName: "standard", IsCurrent: false, DivinePrice: 178.97, ChaosDivinePrice: 2.23 },
  { Value: "Hardcore", ShortName: "hardcore", IsCurrent: false, DivinePrice: 80, ChaosDivinePrice: 2 },
  { Value: "Runes of Aldur", ShortName: "runes", IsCurrent: true, DivinePrice: 509.41, ChaosDivinePrice: 11.28 },
  { Value: "HC Runes of Aldur", ShortName: "runeshc", IsCurrent: true, DivinePrice: 472, ChaosDivinePrice: 21.45 },
];

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
    console.log("ALL PASS — league detection agreement, alert dedupe and runtime league switching");
  })
  .catch((error: unknown) => {
    db.close();
    console.error(error);
    process.exit(1);
  });

async function main(): Promise<void> {
  testRealResponseShapes();
  testAgreementRule();
  testNameFiltering();
  await testSourceAgreement();
  await testAlertDedupe();
  await testActiveLeagueResolution();
  testSwitchPurgesMarketHistory();
  testSetActiveLeagueValidation();
  testCacheIsNotPoisonedByAnExplicitDb();
}

function leagues(...rows: Array<[string, boolean | null]>): LeagueOption[] {
  return rows.map(([name, current]) => ({ name, current }));
}

/** Both network sources faked — this test suite never touches poe.ninja or poe2scout. */
function sources(scout: LeagueOption[] | Error, ninja: LeagueOption[] | Error): LeagueSources {
  const source =
    (rows: LeagueOption[] | Error) =>
    async (): Promise<LeagueOption[]> => {
      if (rows instanceof Error) throw rows;
      return rows;
    };
  return { scout: source(scout), ninja: source(ninja) };
}

/** The real payloads, through the real parsers, through the real pickers. */
function testRealResponseShapes(): void {
  const ninja = parseNinjaLeagues(NINJA_RAW);
  assert.equal(ninja.length, 6);
  assert.deepEqual(ninja[0], { name: "Forbidden Rites", current: null }); // ninja has NO flag
  assert.equal(pickOrderedLeague(ninja), "Forbidden Rites");
  // Nothing in a ninja payload is ever flagged — a flag-based read of it finds nothing at all.
  assert.deepEqual(currentChallengeLeagues(ninja), []);

  const scout = parseScoutLeagues(SCOUT_RAW);
  assert.equal(scout.length, 8);
  assert.equal(scout[0]?.current, true);
  // Scout flags the new league AND the previous one; HC variants drop out by name.
  assert.deepEqual(currentChallengeLeagues(scout), ["Forbidden Rites", "Runes of Aldur"]);

  // ninja proposes the newest, scout confirms it is live → this is the alerting case.
  assert.equal(agreeOnLeague(pickOrderedLeague(ninja), currentChallengeLeagues(scout)), "Forbidden Rites");

  // Garbage (an HTML error page, a moved host) fails loud rather than reporting "no league".
  assert.throws(() => parseNinjaLeagues({ error: "not found" }), /shape mismatch/);
  assert.throws(() => parseScoutLeagues([{ Value: "X" }]), /shape mismatch/);
}

function testAgreementRule(): void {
  // ninja names a league scout does not flag as live → no agreement, no alert.
  assert.equal(agreeOnLeague("Ghost League", ["Forbidden Rites", "Runes of Aldur"]), null);
  // Scout's spelling wins, because scoutClient matches leagues on that exact `Value`.
  assert.equal(agreeOnLeague("forbidden rites", ["Forbidden Rites"]), "Forbidden Rites");
  // Either source silent → nothing to agree on.
  assert.equal(agreeOnLeague(null, ["Forbidden Rites"]), null);
  assert.equal(agreeOnLeague("Forbidden Rites", []), null);
}

function testNameFiltering(): void {
  // Permanent + parallel leagues are never the current challenge league, however they are flagged.
  assert.deepEqual(
    currentChallengeLeagues(
      leagues(
        ["Standard", true],
        ["Hardcore", true],
        ["HC Forbidden Rites", true],
        ["SSF Forbidden Rites", true],
        ["Ruthless Forbidden Rites", true],
        ["Forbidden Rites", true],
      ),
    ),
    ["Forbidden Rites"],
  );
  // The order-based read skips the same permanent/parallel names.
  assert.equal(
    pickOrderedLeague(leagues(["Standard", null], ["HC Forbidden Rites", null], ["Forbidden Rites", null])),
    "Forbidden Rites",
  );
  // Unflagged rows are not "current" — scout must say so explicitly.
  assert.deepEqual(currentChallengeLeagues(leagues(["Forbidden Rites", null], ["Runes of Aldur", null])), []);
  assert.deepEqual(currentChallengeLeagues([]), []);
  assert.equal(pickOrderedLeague(leagues(["Standard", null], ["Hardcore", null])), null);
  assert.equal(pickOrderedLeague([]), null);
}

async function testSourceAgreement(): Promise<void> {
  const agree = await detectCurrentLeague(sources(leagues([DETECTED, true]), leagues([DETECTED.toLowerCase(), null])));
  assert.equal(agree.agreed, DETECTED); // scout spelling wins — it is the one scout matches on

  const disagree = await detectCurrentLeague(sources(leagues([DETECTED, true]), leagues(["Runes of Aldur", null])));
  assert.equal(disagree.agreed, null);
  assert.deepEqual(disagree.reports, { poe2scout: DETECTED, ninja: "Runes of Aldur" });

  // One source down → no agreement, and no throw.
  const halfDown = await detectCurrentLeague(sources(leagues([DETECTED, true]), new Error("poe.ninja 403")));
  assert.equal(halfDown.agreed, null);
  assert.equal(halfDown.reports.ninja, null);

  const bothDown = await detectCurrentLeague(sources(new Error("scout down"), new Error("ninja down")));
  assert.equal(bothDown.agreed, null);

  // The real-world case: scout flags the new league AND the previous one, ninja's ordering
  // breaks the tie. Both flagged names are recorded so the stored sources_json stays honest.
  const overlap = await detectCurrentLeague(
    sources(leagues([DETECTED, true], ["Runes of Aldur", true]), leagues([DETECTED, null], ["Runes of Aldur", null])),
  );
  assert.equal(overlap.agreed, DETECTED);
  assert.equal(overlap.reports.poe2scout, `${DETECTED} | Runes of Aldur`);
}

async function testAlertDedupe(): Promise<void> {
  clearLeagueCache();
  const agreeing = sources(leagues([DETECTED, true]), leagues([DETECTED, null]));

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
  const down = await checkLeagueOnce(sources(new Error("scout down"), new Error("ninja down")), db);
  assert.equal(down.agreed, null);
  assert.equal(readLeagueState(db)?.detected_current, DETECTED);
  assert.equal(alertCount(), 2);
}

async function testActiveLeagueResolution(): Promise<void> {
  clearLeagueCache();
  assert.equal(getActiveLeague(db), config.league); // nothing stored → env fallback

  clearLeagueCache();
  assert.deepEqual(setActiveLeague(`  ${DETECTED}  `, db), { league: DETECTED, changed: true });
  assert.equal(getActiveLeague(db), DETECTED); // stored setting beats env

  // Switching clears the banner: the target league counts as already alerted…
  assert.equal(readLeagueState(db)?.alerted_league, DETECTED);
  // …and detection of the now-tracked league is no longer news.
  clearLeagueCache();
  const after = await checkLeagueOnce(sources(leagues([DETECTED, true]), leagues([DETECTED, null])), db);
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
  assert.equal(getActiveLeague(db), DETECTED); // rejected writes changed nothing
  assert.equal(setActiveLeague("L".repeat(60), db).league.length, 60);
}

/**
 * Market history has no league column, so a switch must drop it in the same transaction —
 * otherwise the trend engine compares two different markets' prices for ~24h.
 */
function testSwitchPurgesMarketHistory(): void {
  clearLeagueCache();
  setActiveLeague(DETECTED, db);
  seedMarketHistory();
  assert.deepEqual(historyCounts(), { price_snapshots: 1, item_spark: 1, item_values: 1 });

  // Same league (differing only by surrounding space) → not a switch, history survives.
  assert.deepEqual(setActiveLeague(`  ${DETECTED}  `, db), { league: DETECTED, changed: false });
  assert.deepEqual(historyCounts(), { price_snapshots: 1, item_spark: 1, item_values: 1 });

  // A real switch purges all three tables; the poller refills them on its next tick.
  clearLeagueCache();
  setActiveLeague("Another Test League", db);
  assert.deepEqual(historyCounts(), { price_snapshots: 0, item_spark: 0, item_values: 0 });
  assert.equal(getActiveLeague(db), "Another Test League");

  // Leave the fixture on DETECTED for the checks that follow.
  clearLeagueCache();
  setActiveLeague(DETECTED, db);
}

function seedMarketHistory(): void {
  db.prepare(
    "INSERT INTO price_snapshots (item_id, item_name, category, chaos_equiv, volume) VALUES ('divine', 'Divine Orb', 'Currency', 1, 10)",
  ).run();
  db.prepare("INSERT INTO item_spark (item_id, spark_7d, change_7d) VALUES ('divine', '[1,2]', 5)").run();
  db.prepare("INSERT INTO item_values (name_key, value_div, source) VALUES ('igniferis', 2.5, 'scout')").run();
}

function historyCounts(): Record<string, number> {
  const count = (table: string): number =>
    (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
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
  const tracked = getActiveLeague(db);
  assert.equal(getActiveLeague(other), "Other DB League");
  assert.equal(getActiveLeague(db), tracked); // would be "Other DB League" if the read were cached
  other.close();
}

function alertCount(): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE type = 'LEAGUE'").get() as {
    count: number;
  };
  return row.count;
}
