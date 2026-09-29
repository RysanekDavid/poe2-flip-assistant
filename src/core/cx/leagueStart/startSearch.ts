import { CX_HOUR_SECONDS } from "../../../api/cxClient";

/**
 * When did a league start trading? A pure planner over what digests have told us so far.
 *
 * The anchor is the league registry's first-seen stamp, which is approximate either way: seeded
 * launch dates are midnight UTC of launch day (the league went live hours later), and a live
 * stamp lands whenever the watcher first heard of the league (before or after launch). So:
 *   1. find a digest hour that lists the league — the anchor, else daily steps forward;
 *   2. step back a day at a time until one does not list it;
 *   3. binary-search that one day to the hour;
 *   4. confirm with a SECOND absent hour before it (plan rule: absent in 2 consecutive digests).
 *      If that one lists the league, the absence was a gap mid-league: keep walking back from it.
 * Every call re-derives the plan from `known`, so it resumes across poll cycles for free.
 */

const DAY = 24 * CX_HOUR_SECONDS;
/** A live registry stamp can precede launch (sources list a league before it opens). */
export const FORWARD_DAYS = 7;
/** Past this the anchor is not near the launch at all — a data problem to report, not to chase. */
export const BACK_DAYS = 60;
/** Mid-league gaps tolerated before giving up (each one restarts the walk further back). */
const MAX_GAPS = 5;

/** Hour → does that digest list the league. Only hours actually fetched are present. */
export type Presence = ReadonlyMap<number, boolean>;

export type StartStep =
  | { kind: "fetch"; hour: number }
  | { kind: "found"; startHour: number }
  /** Nothing to fetch yet (the next candidate hour is not published) — ask again later. */
  | { kind: "wait"; reason: string }
  | { kind: "not-found"; reason: string };

type Probe = { kind: "fetch"; hour: number } | { kind: "known"; present: boolean } | { kind: "future" };

function probe(known: Presence, hour: number, newestHour: number): Probe {
  if (hour > newestHour) return { kind: "future" };
  const present = known.get(hour);
  return present == null ? { kind: "fetch", hour } : { kind: "known", present };
}

/** Step 1: the first daily candidate from the anchor that lists the league. */
function findPresent(known: Presence, anchor: number, newestHour: number): StartStep | number {
  for (let i = 0; i <= FORWARD_DAYS; i++) {
    const p = probe(known, anchor + i * DAY, newestHour);
    if (p.kind === "fetch") return p;
    if (p.kind === "future") return { kind: "wait", reason: `not listed in the ${i} published day(s) since first seen` };
    if (p.present) return anchor + i * DAY;
  }
  return { kind: "not-found", reason: `not listed within ${FORWARD_DAYS} days after first seen` };
}

/** Step 2: from a present hour, the (absent, present] day that holds the start. */
function bracket(known: Presence, present: number, newestHour: number): StartStep | { lo: number; hi: number } {
  let hi = present;
  for (let j = 1; j <= BACK_DAYS; j++) {
    const p = probe(known, present - j * DAY, newestHour);
    if (p.kind === "fetch") return p;
    if (p.kind === "known" && !p.present) return { lo: present - j * DAY, hi };
    hi = present - j * DAY;
  }
  return { kind: "not-found", reason: `still listed ${BACK_DAYS} days before the hour it was found at` };
}

/** Step 3: first listed hour in (lo, hi], assuming the league stays listed once it started. */
function bisect(known: Presence, lo: number, hi: number, newestHour: number): StartStep | number {
  let a = lo;
  let b = hi;
  while (b - a > CX_HOUR_SECONDS) {
    const mid = a + Math.floor((b - a) / 2 / CX_HOUR_SECONDS) * CX_HOUR_SECONDS;
    const p = probe(known, mid, newestHour);
    if (p.kind === "fetch") return p;
    if (p.kind === "future") return { kind: "wait", reason: "bisect hour not published" };
    if (p.present) b = mid;
    else a = mid;
  }
  return b;
}

/** The next digest hour to fetch, or the start hour once `known` pins it down. Pure. */
export function planStartSearch(known: Presence, anchorHour: number, newestHour: number): StartStep {
  if (anchorHour % CX_HOUR_SECONDS !== 0) throw new Error(`anchor ${anchorHour} is not an hour boundary`);
  const first = findPresent(known, anchorHour, newestHour);
  if (typeof first !== "number") return first;
  let present = first;
  for (let gap = 0; gap <= MAX_GAPS; gap++) {
    const range = bracket(known, present, newestHour);
    if ("kind" in range) return range;
    const start = bisect(known, range.lo, range.hi, newestHour);
    if (typeof start !== "number") return start;
    const before = probe(known, start - 2 * CX_HOUR_SECONDS, newestHour);
    if (before.kind === "fetch") return before;
    if (before.kind === "known" && before.present) {
      present = start - 2 * CX_HOUR_SECONDS; // a one-hour hole mid-league, not the start
      continue;
    }
    return { kind: "found", startHour: start };
  }
  return { kind: "not-found", reason: `more than ${MAX_GAPS} unlisted hours inside the league — digest too patchy to date its start` };
}

/** Registry stamp (ISO) → the hour boundary at or before it. Throws on an unparseable stamp. */
export function anchorHourOf(firstSeenIso: string): number {
  // SQLite CURRENT_TIMESTAMP-style stamps carry no zone; they are UTC.
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(firstSeenIso) ? firstSeenIso : `${firstSeenIso.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`league registry stamp "${firstSeenIso}" is not a date`);
  return Math.floor(ms / 1000 / CX_HOUR_SECONDS) * CX_HOUR_SECONDS;
}
