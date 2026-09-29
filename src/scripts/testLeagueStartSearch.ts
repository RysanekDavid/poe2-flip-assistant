/* League-start dating planner (pure): which digest hour to ask next, and when the start is known.
 * Run via npm run test:cx (testLeagueStart.ts calls it). NO NETWORK, NO DB. */
import assert from "node:assert/strict";
import { CX_HOUR_SECONDS } from "../api/cxClient";
import { anchorHourOf, planStartSearch, type StartStep } from "../core/cx/leagueStart/startSearch";

const H = CX_HOUR_SECONDS;
const DAY = 24 * H;
/** A launch at 17:00 UTC. */
const S = 1_790_442_000 + 17 * H;

/** Presence-driven planner run to completion against a synthetic listing. */
function runPlanner(anchor: number, newest: number, listed: (h: number) => boolean): { step: StartStep; fetches: number } {
  const known = new Map<number, boolean>();
  for (let fetches = 0; fetches < 200; fetches++) {
    const step = planStartSearch(known, anchor, newest);
    if (step.kind !== "fetch") return { step, fetches };
    assert.ok(!known.has(step.hour), `planner re-asked hour ${step.hour}`);
    known.set(step.hour, listed(step.hour));
  }
  throw new Error("planner did not converge");
}

const listedFrom =
  (start: number, holes: readonly number[] = [], end = Infinity) =>
  (h: number): boolean =>
    h >= start && h < end && !holes.includes(h);

const found = { kind: "found", startHour: S } as const;

function testLiveLeague(): void {
  const newest = S + 3 * DAY;
  const midnight = runPlanner(S - 17 * H, newest, listedFrom(S));
  assert.deepEqual(midnight.step, found, "seeded midnight anchor before launch");
  assert.ok(midnight.fetches <= 12, `live league dated in ${midnight.fetches} probes (one poll cycle)`);
  const early = runPlanner(S - 10 * DAY, newest, listedFrom(S));
  assert.deepEqual(early.step, found, "a source listed it 10 days before launch — found via 'listed now'");
  assert.ok(early.fetches <= 14, `${early.fetches} probes`);
  const late = runPlanner(S + 2 * DAY + 5 * H, newest, listedFrom(S, [S + DAY + 5 * H]));
  assert.deepEqual(late.step, found, "stamp after launch: a mid-league hole where the day walk lands is not the start");
  // the first bisect midpoint of (anchor, newest] is a hole: re-bisect below it
  const anchor = S - 17 * H;
  const firstMid = anchor + Math.floor((newest - anchor) / 2 / H) * H;
  assert.deepEqual(runPlanner(anchor, newest, listedFrom(S, [firstMid])).step, found, "hole hit by bisect");
  console.log(`PASS  dating a live league: ${midnight.fetches} probes from a midnight stamp, ${early.fetches} from a stamp 10 days early, holes skipped`);
}

function testEndedAndMissing(): void {
  const ended = runPlanner(S - 17 * H, S + 120 * DAY, listedFrom(S, [], S + 90 * DAY));
  assert.deepEqual(ended.step, found, "ended league (not listed now): forward from the anchor, then back");
  const notYet = runPlanner(S - 17 * H, S - 5 * H, listedFrom(S));
  assert.equal(notYet.step.kind, "wait", "launch not published yet → wait, never a guess");
  const never = runPlanner(S, S + 30 * DAY, () => false);
  assert.equal(never.step.kind, "not-found");
  assert.ok(never.fetches <= 9, "never listed: the newest hour + 8 daily probes, then a verdict");
  assert.equal(anchorHourOf("2026-09-05T00:00:00Z"), Date.parse("2026-09-05T00:00:00Z") / 1000);
  assert.equal(anchorHourOf("2026-09-05 13:45:10"), Date.parse("2026-09-05T13:00:00Z") / 1000, "SQLite stamps are UTC, floored");
  assert.throws(() => planStartSearch(new Map(), S + 1, S + DAY), /hour boundary/);
  console.log("PASS  dating an ended league, not-yet-launched → wait, never listed → not-found");
}

export function runStartSearchTests(): void {
  testLiveLeague();
  testEndedAndMissing();
}
