import { parseSqliteTimestamp } from "../../lib/sqliteTime";

/**
 * "This session": net-worth change since the first snapshot of the current play session. Pure.
 *
 * A session is the unbroken run of snapshots ending at the latest one where no two consecutive
 * snapshots are more than `gapMs` apart — a longer silence means you stopped reading, i.e. stopped
 * playing. Like-with-like: only snapshots of the latest one's source count (a manual entry holds
 * currency only, a trade read adds gear — mixing them reports the gear as a gain).
 *
 * With the scheduled auto-read on (BALANCE_INTERVAL_MIN > 0) reads never go silent, so a session
 * then spans the whole auto-read history; the default deployment has it off.
 */
export const SESSION_GAP_MS = 3 * 60 * 60 * 1000;

export interface SessionSnapshot {
  fetched_at: string;
  net_worth_div: number;
  source: string;
}

export interface SessionDelta {
  startAt: string;
  startDiv: number;
  deltaDiv: number;
  /** Null when the session started at 0 Div (no base to divide by). */
  deltaPct: number | null;
}

/** Null when the session has a single snapshot so far — there is no "since" yet. */
export function sessionDelta(snapshots: readonly SessionSnapshot[], gapMs: number = SESSION_GAP_MS): SessionDelta | null {
  const timed = snapshots.map((s) => ({ s, ms: parseSqliteTimestamp(s.fetched_at) })).sort((a, b) => a.ms - b.ms);
  const latest = timed[timed.length - 1];
  if (latest == null) return null;
  const same = timed.filter((t) => t.s.source === latest.s.source);
  let start = same.length - 1;
  while (start > 0 && same[start]!.ms - same[start - 1]!.ms <= gapMs) start--;
  const first = same[start]!;
  if (first === latest) return null;
  const deltaDiv = latest.s.net_worth_div - first.s.net_worth_div;
  return {
    startAt: first.s.fetched_at,
    startDiv: first.s.net_worth_div,
    deltaDiv,
    deltaPct: first.s.net_worth_div > 0 ? (deltaDiv / first.s.net_worth_div) * 100 : null,
  };
}
