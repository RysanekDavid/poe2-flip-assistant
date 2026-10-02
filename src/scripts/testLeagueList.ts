import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import Database from "better-sqlite3";
import { parseTradeLeagues, TradeLeaguesError } from "../api/tradeLeagues";
import { getLeagueList, LEAGUE_LIST_RETRY_MS, LEAGUE_LIST_TTL_MS, leagueListStatus, type LeagueListDeps } from "../core/leagueList";
import { leagueListHealth } from "../core/systemHealth";
import { leagueFirstSeen } from "../db/leagueQueries";

/**
 * GGG's trade2 league list: parsing, the shared cache, the stale-list fallback and the loud
 * failure, plus a sweep proving no league-list call to poe.ninja or poe2scout remains.
 * Run: part of `npm run test:league`. NO NETWORK — every fetch is a fake.
 *
 * FIXTURE PROVENANCE: src/scripts/fixtures/trade2-leagues.json follows the documented trade API
 * shape ({ result: [{ id, realm, text }] }) with the leagues GGG listed on 2026-10-02. It was
 * assembled, not captured: this environment refused the outbound request. Replace it with a
 * trimmed live capture when one is available — the parser is deliberately tolerant of extra keys.
 */

const FIXTURE: unknown = JSON.parse(readFileSync(join(process.cwd(), "src/scripts/fixtures/trade2-leagues.json"), "utf8"));
const T0 = Date.UTC(2026, 9, 2, 12);

const db = new Database(":memory:");
db.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));

main()
  .then(() => {
    db.close();
    console.log("ALL PASS — trade2 league list parse, cache, stale fallback, loud failure, no ninja/scout league calls");
  })
  .catch((error: unknown) => {
    db.close();
    console.error(error);
    process.exit(1);
  });

async function main(): Promise<void> {
  testParse();
  await testNothingCachedFailsLoudly();
  await testFreshFetchIsCachedAndRegistered();
  await testStaleListServedOnFailure();
  await testRetryAfterIsHonoured();
  testNoNinjaOrScoutLeagueCalls();
}

/** A fake GGG: `answers` are consumed per call, an Error answer throws. */
function fakeDeps(answers: Array<string[] | Error>, clock: { now: number }): LeagueListDeps & { calls: () => number } {
  let calls = 0;
  return {
    database: db,
    now: () => clock.now,
    calls: () => calls,
    fetch: async () => {
      const answer = answers[calls++];
      if (answer == null) throw new Error("test asked GGG more often than expected");
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

function testParse(): void {
  assert.deepEqual(parseTradeLeagues(FIXTURE), [
    "Forbidden Rites",
    "HC Forbidden Rites",
    "Runes of Aldur",
    "HC Runes of Aldur",
    "Standard",
    "Hardcore",
  ]);
  // Another realm's rows are not ours; duplicates collapse case-insensitively; extra keys pass.
  assert.deepEqual(
    parseTradeLeagues({
      result: [
        { id: "Mercenaries", realm: "pc", text: "Mercenaries" },
        { id: " Forbidden Rites ", realm: "poe2", text: "Forbidden Rites", extra: 1 },
        { id: "forbidden rites", realm: "poe2" },
        { id: "Standard" },
      ],
    }),
    ["Forbidden Rites", "Standard"],
  );
  // Garbage or an empty list fails loud rather than emptying the league picker.
  assert.throws(() => parseTradeLeagues({ error: { code: 1 } }), /shape mismatch/);
  assert.throws(() => parseTradeLeagues({ result: [] }), /no poe2 leagues/);
  assert.throws(() => parseTradeLeagues({ result: [{ id: "Mercenaries", realm: "pc" }] }), /no poe2 leagues/);
  console.log("PASS  trade2 /data/leagues fixture through the real parser");
}

async function testNothingCachedFailsLoudly(): Promise<void> {
  const clock = { now: T0 };
  const deps = fakeDeps([new Error("ECONNRESET")], clock);
  await assert.rejects(getLeagueList(deps), /unavailable and nothing cached: ECONNRESET/);
  assert.equal(leagueListStatus(db).lastError, "ECONNRESET");
  // Inside the back-off the remembered failure is thrown again WITHOUT asking GGG.
  clock.now += 60_000;
  await assert.rejects(getLeagueList(deps), /nothing cached/);
  assert.equal(deps.calls(), 1);
  console.log("PASS  unreachable trade2 with no cached list throws (and backs off)");
}

async function testFreshFetchIsCachedAndRegistered(): Promise<void> {
  const clock = { now: T0 + LEAGUE_LIST_RETRY_MS + 1 };
  const names = parseTradeLeagues(FIXTURE);
  const deps = fakeDeps([names], clock);
  const first = await getLeagueList(deps);
  assert.deepEqual(first, { names, fetchedAt: clock.now, staleReason: null });
  assert.equal(leagueListStatus(db).lastError, null, "a good fetch clears the remembered failure");
  // HC variants register under their base name, so the dropdown chronology covers every league.
  assert.ok(leagueFirstSeen(db).has("forbidden rites"));
  assert.ok(leagueFirstSeen(db).has("runes of aldur"));

  // Within the TTL both processes read the shared cache — GGG is not asked again.
  clock.now += LEAGUE_LIST_TTL_MS - 1;
  assert.deepEqual((await getLeagueList(deps)).names, names);
  assert.equal(deps.calls(), 1);
  console.log("PASS  fresh list cached for the TTL and registered in league_registry");
}

async function testStaleListServedOnFailure(): Promise<void> {
  const fetchedAt = leagueListStatus(db).fetchedAt;
  assert.ok(fetchedAt != null);
  const clock = { now: fetchedAt + LEAGUE_LIST_TTL_MS + 1 };
  const deps = fakeDeps([new Error("HTTP 503")], clock);
  const stale = await getLeagueList(deps);
  assert.equal(stale.staleReason, "HTTP 503");
  assert.equal(stale.fetchedAt, fetchedAt, "the last good list keeps its own age");
  assert.equal(stale.names.length, 6);

  // System Health shows the list's age and the failure that made it stale.
  const health = leagueListHealth(db, clock.now);
  assert.equal(health.leagues, 6);
  assert.equal(health.ageSec, Math.round((LEAGUE_LIST_TTL_MS + 1) / 1000));
  assert.equal(health.lastError, "HTTP 503");
  assert.equal(health.fetchedAt, new Date(fetchedAt).toISOString());
  console.log("PASS  failed refresh serves the last good list with its age surfaced to System Health");
}

async function testRetryAfterIsHonoured(): Promise<void> {
  const status = leagueListStatus(db);
  assert.ok(status.lastErrorAt != null && status.fetchedAt != null);
  const clock = { now: status.lastErrorAt + LEAGUE_LIST_RETRY_MS + 1 };
  const hourMs = 60 * 60_000;
  const deps = fakeDeps([new TradeLeaguesError("HTTP 429", hourMs), ["Standard"]], clock);
  assert.equal((await getLeagueList(deps)).staleReason, "HTTP 429");
  // Past our own 5-minute back-off but inside GGG's Retry-After: still no request.
  clock.now += LEAGUE_LIST_RETRY_MS + 1;
  assert.equal((await getLeagueList(deps)).staleReason, "HTTP 429");
  assert.equal(deps.calls(), 1);
  clock.now += hourMs;
  assert.deepEqual((await getLeagueList(deps)).names, ["Standard"]);
  assert.equal(deps.calls(), 2);
  console.log("PASS  a 429's Retry-After is honoured before asking GGG again");
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** The league list has ONE origin: GGG. Ninja/scout stay only for prices (and scout's rate fallback). */
function testNoNinjaOrScoutLeagueCalls(): void {
  const root = join(process.cwd(), "src");
  const files = walk(root).map((path) => ({ rel: relative(root, path).split(sep).join("/"), text: readFileSync(path, "utf8") }));
  const self = "scripts/testLeagueList.ts";

  const ninja = files.find((f) => f.rel === "api/ninjaClient.ts");
  assert.ok(ninja != null);
  assert.doesNotMatch(ninja.text, /\/leagues\b/, "poe.ninja league endpoint must not be called");
  for (const f of files.filter((x) => x.rel !== self)) {
    assert.doesNotMatch(f.text, /\b(fetchNinjaLeagues|parseNinjaLeagues)\b/, `${f.rel} still uses the poe.ninja league list`);
  }

  // scout's /Leagues rows survive ONLY as rateSync's rate fallback.
  const scoutUsers = files.filter((f) => f.rel !== self && f.rel !== "api/scoutClient.ts" && /\bfetchScoutLeagues\b/.test(f.text));
  assert.deepEqual(scoutUsers.map((f) => f.rel), ["core/rateSync.ts"]);

  const leagueModules = [
    "api/tradeLeagues.ts",
    "core/leagueList.ts",
    "core/leagueDerivation.ts",
    "core/leagueSwitch.ts",
    "scheduler/leagueWatcher.ts",
    "app/api/settings/league/route.ts",
    "app/api/league/status/route.ts",
  ];
  for (const rel of leagueModules) {
    const f = files.find((x) => x.rel === rel);
    assert.ok(f != null, `${rel} exists`);
    assert.doesNotMatch(f.text, /from "[./]*\/?api\/(ninjaClient|scoutClient)"/, `${rel} must not import ninja/scout`);
  }
  console.log("PASS  no poe.ninja / poe2scout league-list calls remain");
}
