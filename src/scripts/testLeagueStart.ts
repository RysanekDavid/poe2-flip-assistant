/* League-start mode: day folding, curves, signals, the view, presets and the daily alert, against
 * the TEMP DB of npm run test:cx (called from testCxHistory.ts). NO NETWORK — digests come from a
 * synthetic world built on the captured fixture's base-currency markets. */
import assert from "node:assert/strict";
import { CX_HOUR_SECONDS, type CxDigest, type CxMarket } from "../api/cxClient";
import { foldDays, leagueStartProblem, resetLeagueStartState, syncLeagueStart } from "../core/cx/leagueStart/backfill";
import { leagueRatio, curveRatio, toCurve, type LeagueCurve } from "../core/cx/leagueStart/curves";
import { dailyMessage, fireLeagueStartAlerts, leagueStartAlertId } from "../core/cx/leagueStart/dailyAlert";
import { sampleHours, SAMPLES_PER_DAY } from "../core/cx/leagueStart/dayFold";
import { MAX_FAILURES, RETRY_AFTER_MS } from "../core/cx/leagueStart/digestFetch";
import { applySellNowPreset } from "../core/cx/leagueStart/preset";
import { classify, isModeActive, leagueDay } from "../core/cx/leagueStart/signals";
import { loadLeagueStartView } from "../core/cx/leagueStart/view";
import { CX_MAX_FETCHES_PER_RUN, CX_REQUEST_GAP_MS, ingestCxDigest, type CxHistorySources } from "../core/cx/cxIngest";
import { clearUserLeagueCache } from "../core/leagueUsers";
import { getDb } from "../db/database";
import { getStartMeta, startDays, startIngestCount } from "../db/cxStartQueries";
import { insertSnapshots } from "../db/marketQueries";
import { leagueStartResponseSchema } from "../lib/leagueStartContract";
import { IDS, REAL_DIGEST, crossMarkets, leagueDigest, near, stubNames } from "./cxTestFixtures";
import { runStartSearchTests } from "./testLeagueStartSearch";

const H = CX_HOUR_SECONDS;
const DAY = 24 * H;
const PAST_A = "LS Past A";
const PAST_B = "LS Past B";
const LIVE = "LS Live";
const ANCIENT = "LS Ancient";
/** Live league launched at 17:00 UTC; the past ones 60 and 120 days earlier at odd hours. */
const START: Readonly<Record<string, number>> = {
  [LIVE]: 1_790_442_000 + 17 * H,
  [PAST_B]: 1_790_442_000 + 17 * H - 60 * DAY + 3 * H,
  [PAST_A]: 1_790_442_000 + 17 * H - 120 * DAY - 6 * H,
};
/** A ended after 60 days (dated via the "not listed now" path); the others still run. */
const A_END = START[PAST_A]! + 60 * DAY;
/** Before this the archive answers "nothing for this hour" — ANCIENT is anchored before it. */
const DEPTH = START[PAST_A]! - 20 * DAY;
/** A one-hour hole in B's listing, exactly where the day-step walk back from its anchor lands. */
const B_ANCHOR = START[PAST_B]! + 3 * DAY + 5 * H;
const B_GAP = B_ANCHOR - DAY;
/** B day 3 sample 2: the archive has nothing. A day 4 sample 3: the CDN always fails. */
const B_EMPTY = START[PAST_B]! + 3 * DAY + 8 * H;
const A_BROKEN = START[PAST_A]! + 4 * DAY + 12 * H;
/** Ten minutes into league day index 2 (day 3) of the live league. */
const NOW = (START[LIVE]! + 2 * DAY + 600) * 1000;

function curveOf(league: string, days: number, mids: Record<string, number[]>, hours = 6, units = 100): LeagueCurve {
  const rows = Object.entries(mids).flatMap(([item, series]) =>
    series.slice(0, days).map((midDiv, day) => ({ day, item, midDiv, volumeUnits: units, hours })),
  );
  return toCurve(league, days, rows);
}

function testCurvesAndSignals(): void {
  const a = curveOf("A", 14, { x: [10, 9, 8, 7, 6, 5, 4, 3, 3, 3, 3, 3, 3, 3] });
  const b = curveOf("B", 10, { x: [10, 10, 10, 10, 10, 10, 10, 10, 12, 20] });
  assert.ok(near(leagueRatio(a, "x", 0, 7), 0.3));
  assert.ok(near(leagueRatio(b, "x", 2, 7), 2));
  assert.equal(leagueRatio(b, "x", 5, 7), null, "day 12 not recorded → no ratio, never a clamped 4-day one");
  assert.equal(leagueRatio(a, "x", 0, 14), null, "a 14-day ratio needs day 14");
  assert.ok(near(curveRatio([a, b, curveOf("C", 14, { x: Array(14).fill(10) })], "x", 0, 7).ratio, 1), "median of 0.3, 1.0, 1.0");
  const thin = curveOf("T", 14, { x: Array(14).fill(10) }, 2);
  assert.equal(leagueRatio(thin, "x", 0, 7), null, "2 sampled hours is thin");
  const trickle = curveOf("V", 14, { x: Array(14).fill(0.001) }, 6, 50);
  assert.equal(leagueRatio(trickle, "x", 0, 7), null, "0.05 Div traded is thin");
  assert.equal(toCurve("P", 1, [{ day: 1, item: "x", midDiv: 1, volumeUnits: 9, hours: 6 }]).points.size, 0, "rows past the folded prefix ignored");

  assert.equal(classify(0.69, 2), "sell-now");
  assert.equal(classify(0.7, 2), "drift");
  assert.equal(classify(0.85, 2), "hold");
  assert.equal(classify(1.15, 3), "hold");
  assert.equal(classify(1.2, 2), "drift");
  assert.equal(classify(1.31, 2), "rising");
  assert.equal(classify(0.2, 1), "unknown", "one league is an anecdote");
  assert.equal(classify(null, 4), "unknown");
  const s = START[LIVE]!;
  assert.equal(isModeActive(s, s + 14 * DAY - H, 14), true);
  assert.equal(isModeActive(s, s + 14 * DAY, 14), false, "off after 14 days");
  assert.equal(isModeActive(s, s - H, 14), false);
  assert.equal(leagueDay(s, s + 2 * DAY + 5 * H), 2);
  assert.equal(leagueDay(s, s - H), null);
  console.log("PASS  curves (median, strict horizons, thin) + signal bands + active window");
}

/** Past-league prices on league day `day` at sample `i`: Simulacrum −7%/day, Kulemak +5%/day. */
function pastMarkets(league: string, day: number, i: number): CxMarket[] {
  const sim = 40 * 0.93 ** day * (league === PAST_A && day === 2 && i === 1 ? 5 : 1); // one dumped hour
  const kul = 10 * 1.05 ** day;
  const extra = league === PAST_A ? crossMarkets(IDS.vaalSiphoner, 3, 0, undefined, league) : [];
  return [...crossMarkets(IDS.simulacrum, sim, 0, undefined, league), ...crossMarkets(IDS.kulemak, kul, 0, undefined, league), ...extra];
}

const isListed = (league: string, start: number, hour: number): boolean =>
  hour >= start && !(league === PAST_B && hour === B_GAP) && !(league === PAST_A && hour >= A_END);

function worldDigest(hour: number): CxDigest {
  if (hour < DEPTH || hour === B_EMPTY) return { ...REAL_DIGEST, next_change_id: hour, markets: [] }; // the archive's "nothing"
  const listed = Object.entries(START)
    .filter(([league, start]) => isListed(league, start, hour))
    .map(([league, start]) => {
      const offset = hour - start;
      const extra =
        league === LIVE ? crossMarkets(IDS.simulacrum, 50, 0, undefined, league) : pastMarkets(league, Math.floor(offset / DAY), Math.floor((offset % DAY) / H / 4));
      return { league, extra };
    });
  // Standard trades every hour, so a digest inside the archive's depth is never empty.
  return leagueDigest(hour, [{ league: "Standard", extra: [] }, ...listed]);
}

interface Recorder {
  fetched: number[];
  slept: number[];
}

function worldSources(rec: Recorder, fail: (h: number) => boolean = (h) => h === A_BROKEN): CxHistorySources {
  return {
    digestAt: async (hour) => {
      rec.fetched.push(hour);
      if (fail(hour)) throw new Error(`stub CDN 503 for ${hour}`);
      return worldDigest(hour);
    },
    sleep: async (ms) => {
      rec.slept.push(ms);
    },
    resolveNames: stubNames,
  };
}

function seedRegistry(): void {
  const db = getDb();
  db.exec("DELETE FROM cx_start_days; DELETE FROM cx_start_ingest; DELETE FROM cx_start_meta; DELETE FROM league_registry;");
  const put = db.prepare("INSERT INTO league_registry (league, first_seen_at) VALUES (?, ?)");
  const iso = (sec: number): string => new Date(sec * 1000).toISOString();
  put.run(PAST_A, iso(START[PAST_A]! - 17 * H));
  put.run(PAST_B, iso(B_ANCHOR));
  put.run(LIVE, iso(START[LIVE]! - 5 * H));
  put.run(ANCIENT, iso(DEPTH - 30 * DAY)); // like Dawn of the Hunt: before the archive's depth
  put.run("Standard", iso(START[PAST_A]! - 400 * DAY));
}

const done = (): boolean =>
  [PAST_A, PAST_B].every((l) => getStartMeta(l)?.daysAvailable === foldDays()) && getStartMeta(LIVE)?.daysAvailable === 2;

/** Poll cycles until converged; the clock only moves (31 min) while every due hour is backed off. */
async function runUntilDone(): Promise<{ runs: number; problems: Array<string | null>; fetched: number[] }> {
  let t = NOW;
  const problems: Array<string | null> = [];
  const fetched: number[] = [];
  for (let runs = 1; runs <= 150; runs++) {
    const rec: Recorder = { fetched: [], slept: [] };
    const r = await syncLeagueStart(worldSources(rec), t);
    assert.ok(rec.fetched.length <= CX_MAX_FETCHES_PER_RUN, `run ${runs} fetched ${rec.fetched.length}`);
    assert.deepEqual(rec.slept, rec.fetched.slice(1).map(() => CX_REQUEST_GAP_MS), "2 s between requests");
    problems.push(leagueStartProblem(r));
    fetched.push(...rec.fetched);
    if (done() && rec.fetched.length === 0) return { runs, problems, fetched };
    if (rec.fetched.length === 0) t += RETRY_AFTER_MS + 60_000;
  }
  throw new Error("backfill did not converge");
}

async function testBackfill(): Promise<void> {
  seedRegistry();
  resetLeagueStartState();
  const { runs, problems, fetched } = await runUntilDone();
  for (const league of [PAST_A, PAST_B, LIVE]) assert.equal(getStartMeta(league)?.startHour, START[league], `${league} dated to the hour`);
  assert.equal(getStartMeta("Standard"), null, "permanent leagues are never dated");
  assert.equal(getStartMeta(ANCIENT), null, "before the archive's depth: undated");
  assert.equal(problems.filter((p) => p?.includes(ANCIENT)).length, 1, "the undated league is reported once");
  assert.equal(problems[problems.length - 1], null, "…and the heartbeat is green afterwards");
  assert.equal(foldDays(), 28, "14-day window + a full 14-day follow-up");
  assert.ok(getStartMeta(PAST_A)?.backfilledAt != null, "complete curve stamped");
  assert.equal(startIngestCount(PAST_A), foldDays() * SAMPLES_PER_DAY);
  const live = getStartMeta(LIVE);
  assert.deepEqual([live?.daysAvailable, live?.backfilledAt], [2, null], "live league: only settled days, still recording");
  const days = (league: string, day: number) => startDays(league).find((r) => r.day === day && r.item === IDS.simulacrum);
  assert.ok(near(days(PAST_A, 2)?.midDiv, 40 * 0.93 ** 2), "median shrugs off one dumped hour");
  assert.equal(days(PAST_A, 2)?.hours, SAMPLES_PER_DAY);
  assert.ok(!startDays(PAST_A).some((r) => r.item === IDS.divine), "Divine is the unit, never a row");
  assert.equal(fetched.filter((h) => h === A_BROKEN).length, MAX_FAILURES, "a failing hour is retried MAX_FAILURES times, then given up");
  const marketsAt = (league: string, hour: number) =>
    (getDb().prepare("SELECT markets FROM cx_start_ingest WHERE league = ? AND hour = ?").get(league, hour) as { markets: number } | undefined)?.markets;
  assert.deepEqual([marketsAt(PAST_A, A_BROKEN), days(PAST_A, 4)?.hours], [0, 5], "given-up sample folded as a 0-market hour");
  assert.deepEqual([marketsAt(PAST_B, B_EMPTY), days(PAST_B, 3)?.hours], [0, 5], "an empty archive hour folded as 0 markets, never retried");
  assert.equal(fetched.filter((h) => h === B_EMPTY).length, 1);
  assert.deepEqual(sampleHours(START[LIVE]!, 1).map((h) => (h - START[LIVE]!) / H), [24, 28, 32, 36, 40, 44]);
  console.log(`PASS  backfill: ${runs} bounded runs date 3 starts, fold 28+28+2 days, missing samples folded, ancient league reported once`);
}

async function testFailureIsLoud(): Promise<void> {
  getDb().prepare("INSERT INTO league_registry (league, first_seen_at) VALUES (?, ?)").run("LS Broken", new Date(NOW - DAY * 1000).toISOString());
  const r = await syncLeagueStart(worldSources({ fetched: [], slept: [] }, () => true), NOW);
  assert.equal(r.failed, 1);
  assert.match(leagueStartProblem(r) ?? "", /1 of 1 digest\(s\) failed.*stub CDN 503/);
  const again = await syncLeagueStart(worldSources({ fetched: [], slept: [] }, () => true), NOW);
  assert.deepEqual([again.fetched, leagueStartProblem(again)], [0, null], "a failed hour backs off instead of hammering");
  getDb().prepare("DELETE FROM league_registry WHERE league = 'LS Broken'").run();
  console.log("PASS  CDN failure → red heartbeat, then back-off");
}

function seedLiveMarket(): number {
  const newestId = Math.floor(NOW / 1000 / H) * H;
  ingestCxDigest(worldDigest(newestId - H), [LIVE], stubNames);
  const icon = (id: string) => `${id}.png`;
  insertSnapshots(LIVE, [
    { itemId: "simulacrum", itemName: "Simulacrum", category: "Fragments", baseValue: 50, volume: 600, change7d: null, spark7d: null, icon: icon("sim") },
    { itemId: "kulemaks-invitation", itemName: "Kulemak's Invitation", category: "Fragments", baseValue: 12, volume: 90, change7d: null, spark7d: null, icon: icon("kul") },
  ]);
  const db = getDb();
  db.prepare("DELETE FROM users WHERE name = 'ls-tester'").run();
  db.prepare("DELETE FROM alerts WHERE type = 'LEAGUE' AND item_id LIKE 'league-start:LS %'").run(); // the temp DB outlives a run
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (name, password_hash, api_key, role, league) VALUES ('ls-tester', 'x', 'ls-test-key', 'member', ?)")
    .run(LIVE);
  clearUserLeagueCache();
  return Number(lastInsertRowid);
}

function testView(): void {
  const view = leagueStartResponseSchema.parse(loadLeagueStartView(LIVE, NOW));
  assert.deepEqual([view.active, view.day, view.basedOn, view.recordedDays], [true, 2, 2, 2]);
  const [first, second] = view.items;
  assert.equal(first?.signal, "sell-now");
  assert.equal(first?.watchItemId, "simulacrum");
  assert.equal(first?.icon, "sim.png");
  assert.ok(near(first?.ratio7, 0.93 ** 7), "mid(9)/mid(2), median of A and B");
  assert.ok(near(first?.ratio14, 0.93 ** 14), "a real 14-day ratio from the folded follow-up");
  assert.ok(near(first?.nowDiv, 50) && near(first?.expected7Div, 50 * 0.93 ** 7));
  assert.equal(second?.signal, "rising");
  assert.equal(second?.nowDiv, null, "not traded in the live league's newest hour → null, never 0");
  assert.ok(!view.items.some((i) => i.baseId === IDS.vaalSiphoner), "an item one league saw is not a signal");
  const standard = loadLeagueStartView("Standard", NOW);
  assert.deepEqual([standard.active, standard.items.length], [false, 0]);
  assert.match(standard.note ?? "", /permanent league/);
  const late = loadLeagueStartView(LIVE, NOW + 20 * DAY * 1000);
  assert.deepEqual([late.active, late.day, late.items.length], [false, 22, 0]);
  assert.match(late.note ?? "", /on day 23; .*first 14 days/, "1-based day in every text");
  console.log("PASS  view contract, sell-now/rising ranking, strict horizons, null-not-0 prices, inactive early return");
}

function testPresetAndAlert(): void {
  const userId = seedLiveMarket();
  const view = loadLeagueStartView(LIVE, NOW);
  assert.deepEqual(applySellNowPreset(userId, LIVE, NOW), { kind: "added", body: { added: ["Simulacrum"], alreadyWatched: 0 } });
  assert.deepEqual(applySellNowPreset(userId, LIVE, NOW), { kind: "added", body: { added: [], alreadyWatched: 1 } }, "re-run keeps the user's row");
  assert.equal(applySellNowPreset(userId, LIVE, NOW + 20 * DAY * 1000).kind, "nothing", "mode off → nothing to add");

  assert.match(dailyMessage(view) ?? "", /day 3 of 14: 1 item\(s\).*Simulacrum -40%.*2 past league starts/);
  assert.deepEqual(fireLeagueStartAlerts([LIVE, `HC ${LIVE}`, "Standard"], NOW), [LIVE], "SC + HC of one league → one alert");
  assert.deepEqual(fireLeagueStartAlerts([`HC ${LIVE}`], NOW), [], "once per league-day");
  const rows = getDb().prepare("SELECT COUNT(*) AS c FROM alerts WHERE type = 'LEAGUE' AND item_id = ?").get(leagueStartAlertId(LIVE, 2)) as { c: number };
  const users = getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  assert.equal(rows.c, users.c, "one row per user");
  console.log("PASS  per-user preset, daily one-shot alert deduped across SC/HC");
}

export async function runLeagueStartTests(): Promise<void> {
  runStartSearchTests();
  testCurvesAndSignals();
  await testBackfill();
  await testFailureIsLoud();
  seedLiveMarket();
  testView();
  testPresetAndAlert();
}
