/* League-start mode: start dating, day folding, curves, signals, the view, presets and the daily
 * alert, against the TEMP DB of npm run test:cx (called from testCxHistory.ts). NO NETWORK —
 * digests come from a synthetic world built on the captured fixture's base-currency markets. */
import assert from "node:assert/strict";
import { CX_HOUR_SECONDS, type CxDigest, type CxMarket } from "../api/cxClient";
import { config } from "../config/env";
import { leagueStartProblem, resetLeagueStartState, syncLeagueStart } from "../core/cx/leagueStart/backfill";
import { leagueRatio, curveRatio, toCurve, type LeagueCurve } from "../core/cx/leagueStart/curves";
import { dailyMessage, fireLeagueStartAlerts, leagueStartAlertId } from "../core/cx/leagueStart/dailyAlert";
import { sampleHours, SAMPLES_PER_DAY } from "../core/cx/leagueStart/dayFold";
import { applySellNowPreset } from "../core/cx/leagueStart/preset";
import { classify, isModeActive, leagueDay } from "../core/cx/leagueStart/signals";
import { anchorHourOf, planStartSearch } from "../core/cx/leagueStart/startSearch";
import { loadLeagueStartView } from "../core/cx/leagueStart/view";
import { CX_MAX_FETCHES_PER_RUN, CX_REQUEST_GAP_MS, ingestCxDigest, type CxHistorySources } from "../core/cx/cxIngest";
import { clearUserLeagueCache } from "../core/leagueUsers";
import { getDb } from "../db/database";
import { getStartMeta, startDays, startIngestCount } from "../db/cxStartQueries";
import { insertSnapshots } from "../db/marketQueries";
import { leagueStartResponseSchema } from "../lib/leagueStartContract";
import { IDS, crossMarkets, leagueDigest, near, stubNames } from "./cxTestFixtures";

const H = CX_HOUR_SECONDS;
const DAY = 24 * H;
const PAST_A = "LS Past A";
const PAST_B = "LS Past B";
const LIVE = "LS Live";
/** Live league launched at 17:00 UTC; the past ones 60 and 120 days earlier at odd hours. */
const START: Readonly<Record<string, number>> = {
  [LIVE]: 1_790_442_000 + 17 * H,
  [PAST_B]: 1_790_442_000 + 17 * H - 60 * DAY + 3 * H,
  [PAST_A]: 1_790_442_000 + 17 * H - 120 * DAY - 6 * H,
};
/** A one-hour hole in B's listing, exactly where the day-step walk back lands. */
const B_ANCHOR = START[PAST_B]! + 3 * DAY + 5 * H;
const B_GAP = B_ANCHOR - DAY;
/** Ten minutes into league day 2 of the live league. */
const NOW = (START[LIVE]! + 2 * DAY + 600) * 1000;

/** Presence-driven planner run to completion against a synthetic listing. */
function runPlanner(anchor: number, newest: number, listed: (h: number) => boolean): { step: ReturnType<typeof planStartSearch>; fetches: number } {
  const known = new Map<number, boolean>();
  for (let fetches = 0; fetches < 200; fetches++) {
    const step = planStartSearch(known, anchor, newest);
    if (step.kind !== "fetch") return { step, fetches };
    assert.ok(!known.has(step.hour), `planner re-asked hour ${step.hour}`);
    known.set(step.hour, listed(step.hour));
  }
  throw new Error("planner did not converge");
}

function testStartSearch(): void {
  const s = START[LIVE]!;
  const newest = s + 30 * DAY;
  const listedFrom = (start: number, gaps: readonly number[] = []) => (h: number) => h >= start && !gaps.includes(h);
  const before = runPlanner(s - 17 * H, newest, listedFrom(s));
  assert.deepEqual(before.step, { kind: "found", startHour: s }, "seeded midnight anchor before launch");
  assert.ok(before.fetches <= 10, `dated in ${before.fetches} probes`);
  const after = runPlanner(s + 3 * DAY + 5 * H, newest, listedFrom(s, [s + 2 * DAY + 5 * H]));
  assert.deepEqual(after.step, { kind: "found", startHour: s }, "live stamp after launch, a mid-league hole is not the start");
  const early = runPlanner(s - 17 * H, s - 5 * H, listedFrom(s));
  assert.equal(early.step.kind, "wait", "launch not published yet → wait, never a guess");
  const never = runPlanner(s, newest, () => false);
  assert.equal(never.step.kind, "not-found");
  assert.equal(anchorHourOf("2026-09-05T00:00:00Z"), Date.parse("2026-09-05T00:00:00Z") / 1000);
  assert.equal(anchorHourOf("2026-09-05 13:45:10"), Date.parse("2026-09-05T13:00:00Z") / 1000, "SQLite stamps are UTC, floored");
  assert.throws(() => planStartSearch(new Map(), s + 1, newest), /hour boundary/);
  console.log("PASS  start dating: before/after anchor, hole mid-league, not yet launched, never listed");
}

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
  assert.ok(near(leagueRatio(b, "x", 5, 7), 2), "min(d+7, last): B's last day is 9");
  assert.equal(leagueRatio(b, "x", 9, 7), null, "no day after the last one");
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
  assert.equal(isModeActive(s, s + 14 * DAY, 14), false, "off at day 14");
  assert.equal(isModeActive(s, s - H, 14), false);
  assert.equal(leagueDay(s, s + 2 * DAY + 5 * H), 2);
  assert.equal(leagueDay(s, s - H), null);
  console.log("PASS  curves (median, clamp, thin) + signal bands + active window");
}

/** Price of each tracked item on league day `day` at sample `i` in a past league. */
function pastMarkets(league: string, day: number, i: number): CxMarket[] {
  const sim = 40 * (1 - 0.05 * day) * (league === PAST_A && day === 2 && i === 1 ? 5 : 1); // one dumped hour
  const kul = 10 * (1 + 0.06 * day);
  const extra = league === PAST_A ? crossMarkets(IDS.vaalSiphoner, 3, 0, undefined, league) : [];
  return [...crossMarkets(IDS.simulacrum, sim, 0, undefined, league), ...crossMarkets(IDS.kulemak, kul, 0, undefined, league), ...extra];
}

function worldDigest(hour: number): CxDigest {
  const listed = Object.entries(START)
    .filter(([league, start]) => hour >= start && !(league === PAST_B && hour === B_GAP))
    .map(([league, start]) => {
      const offset = hour - start;
      const day = Math.floor(offset / DAY);
      const sample = Math.floor((offset % DAY) / H / 4);
      const extra = league === LIVE ? crossMarkets(IDS.simulacrum, 50, 0, undefined, league) : pastMarkets(league, day, sample);
      return { league, extra };
    });
  // Standard trades every hour, so a digest before any challenge league is never empty.
  return leagueDigest(hour, [{ league: "Standard", extra: [] }, ...listed]);
}

interface Recorder {
  fetched: number[];
  slept: number[];
}

function worldSources(rec: Recorder, fail: (h: number) => boolean = () => false): CxHistorySources {
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
  put.run("Standard", iso(START[PAST_A]! - 400 * DAY));
}

async function testBackfill(): Promise<void> {
  seedRegistry();
  resetLeagueStartState();
  let runs = 0;
  for (; runs < 60; runs++) {
    const rec: Recorder = { fetched: [], slept: [] };
    const r = await syncLeagueStart(worldSources(rec), NOW);
    assert.ok(rec.fetched.length <= CX_MAX_FETCHES_PER_RUN, `run ${runs} fetched ${rec.fetched.length}`);
    assert.deepEqual(rec.slept, rec.fetched.slice(1).map(() => CX_REQUEST_GAP_MS), "2 s between requests");
    assert.equal(r.failed, 0);
    if (rec.fetched.length === 0) break;
  }
  assert.ok(runs < 60, "backfill converges");
  for (const league of [PAST_A, PAST_B, LIVE]) assert.equal(getStartMeta(league)?.startHour, START[league], `${league} dated to the hour`);
  assert.equal(getStartMeta("Standard"), null, "permanent leagues are never dated");
  const a = getStartMeta(PAST_A);
  assert.equal(a?.daysAvailable, config.leagueStart.days);
  assert.equal(a?.backfilledAt, NOW, "complete curve stamped");
  assert.equal(startIngestCount(PAST_A), config.leagueStart.days * SAMPLES_PER_DAY);
  const live = getStartMeta(LIVE);
  assert.deepEqual([live?.daysAvailable, live?.backfilledAt], [2, null], "live league: only complete days, still recording");
  const simDay2 = startDays(PAST_A).find((r) => r.day === 2 && r.item === IDS.simulacrum);
  assert.ok(near(simDay2?.midDiv, 36), "median shrugs off one dumped hour");
  assert.equal(simDay2?.hours, SAMPLES_PER_DAY);
  assert.ok(!startDays(PAST_A).some((r) => r.item === IDS.divine), "Divine is the unit, never a row");
  assert.deepEqual(sampleHours(START[LIVE]!, 1).map((h) => (h - START[LIVE]!) / H), [24, 28, 32, 36, 40, 44]);
  console.log(`PASS  backfill: ${runs} bounded runs date 3 starts, fold 14+14+2 days, live league waits for complete days`);
}

async function testFailureIsLoud(): Promise<void> {
  getDb().prepare("INSERT INTO league_registry (league, first_seen_at) VALUES (?, ?)").run("LS Broken", new Date(NOW - DAY * 1000).toISOString());
  const rec: Recorder = { fetched: [], slept: [] };
  const r = await syncLeagueStart(worldSources(rec, () => true), NOW);
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

function testViewPresetAndAlert(): void {
  const userId = seedLiveMarket();
  const view = leagueStartResponseSchema.parse(loadLeagueStartView(LIVE, NOW));
  assert.deepEqual([view.active, view.day, view.basedOn, view.recordedDays], [true, 2, 2, 2]);
  const [first, second] = view.items;
  assert.equal(first?.signal, "sell-now");
  assert.equal(first?.watchItemId, "simulacrum");
  assert.equal(first?.icon, "sim.png");
  assert.ok(near(first?.ratio7, (40 * 0.55) / (40 * 0.9)), "mid(9)/mid(2), median of A and B");
  assert.ok(near(first?.nowDiv, 50) && near(first?.expected7Div, 50 * (0.55 / 0.9)));
  assert.equal(second?.signal, "rising");
  assert.equal(second?.nowDiv, null, "not traded in the live league's newest hour → null, never 0");
  assert.ok(!view.items.some((i) => i.baseId === IDS.vaalSiphoner), "an item one league saw is not a signal");
  const standard = loadLeagueStartView("Standard", NOW);
  assert.equal(standard.active, false);
  assert.match(standard.note ?? "", /permanent league/);

  const added = applySellNowPreset(userId, LIVE, NOW);
  assert.deepEqual(added, { kind: "added", body: { added: ["Simulacrum"], alreadyWatched: 0 } });
  assert.deepEqual(applySellNowPreset(userId, LIVE, NOW), { kind: "added", body: { added: [], alreadyWatched: 1 } }, "re-run keeps the user's row");
  assert.equal(applySellNowPreset(userId, LIVE, NOW + 20 * DAY * 1000).kind, "nothing", "mode off → nothing to add");

  assert.match(dailyMessage(view) ?? "", /day 2: 1 item\(s\).*Simulacrum -39%.*2 past league starts/);
  assert.deepEqual(fireLeagueStartAlerts([LIVE, "Standard"], NOW), [LIVE]);
  assert.deepEqual(fireLeagueStartAlerts([LIVE], NOW), [], "once per league-day");
  const rows = getDb().prepare("SELECT COUNT(*) AS c FROM alerts WHERE type = 'LEAGUE' AND item_id = ?").get(leagueStartAlertId(LIVE, 2)) as { c: number };
  const users = getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  assert.equal(rows.c, users.c, "one row per user");
  console.log("PASS  view contract, sell-now/rising ranking, null-not-0 prices, per-user preset, daily one-shot alert");
}

export async function runLeagueStartTests(): Promise<void> {
  testStartSearch();
  testCurvesAndSignals();
  await testBackfill();
  await testFailureIsLoud();
  testViewPresetAndAlert();
}
