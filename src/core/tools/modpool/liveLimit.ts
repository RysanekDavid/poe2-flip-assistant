/**
 * Per-user cap on click-driven trade2 lookups that actually spend a search: LIVE_VALUES_PER_HOUR per
 * rolling hour, ONE window per user shared by every such feature (Mod pool live values and Market ›
 * Opportunities live listings). Cache hits never count. The shared web governor protects the
 * account-wide budget; this keeps one user clicking down a table from eating everyone's
 * interactive searches.
 *
 * A slot is RESERVED before the search goes out (check and take in one synchronous step, so two
 * concurrent clicks cannot both pass a check at 9 of 10) and handed back when the lookup fails
 * before anything reached trade2. In-memory: one `next start` process sees every request, and a
 * restart only ever errs toward allowing.
 */
export const LIVE_VALUES_PER_HOUR = 10;
const WINDOW_MS = 3_600_000;
/** Bound on tracked users so memory cannot grow without limit. */
const MAX_USERS = 10_000;

export type LiveGate = { allowed: true } | { allowed: false; retryAfterSec: number };
export type LiveReservation = { allowed: true; release: () => void } | { allowed: false; retryAfterSec: number };

export interface LiveLimiter {
  /** Whether a slot is free now, without taking it. */
  check(userId: number): LiveGate;
  /** Take a slot now, or say how long until one frees. */
  reserve(userId: number): LiveReservation;
}

export interface LiveLimiterOptions {
  perHour: number;
  windowMs: number;
  now: () => number;
}

export function createLiveLimiter(overrides: Partial<LiveLimiterOptions> = {}): LiveLimiter {
  const o: LiveLimiterOptions = { perHour: LIVE_VALUES_PER_HOUR, windowMs: WINDOW_MS, now: Date.now, ...overrides };
  // each slot is its own object, so a release removes exactly the slot it took
  const slots = new Map<number, Array<{ at: number }>>();
  const live = (userId: number, now: number): Array<{ at: number }> => {
    const kept = (slots.get(userId) ?? []).filter((s) => s.at > now - o.windowMs);
    if (kept.length === 0) slots.delete(userId);
    else slots.set(userId, kept);
    return kept;
  };
  const gate = (window: ReadonlyArray<{ at: number }>, now: number): LiveGate => {
    if (window.length < o.perHour) return { allowed: true };
    const oldest = window[window.length - o.perHour]?.at ?? now;
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + o.windowMs - now) / 1000)) };
  };
  return {
    check: (userId) => gate(live(userId, o.now()), o.now()),
    reserve(userId) {
      const now = o.now();
      const window = live(userId, now);
      const g = gate(window, now);
      if (!g.allowed) return g;
      if (!slots.has(userId) && slots.size >= MAX_USERS) {
        const oldest = slots.keys().next();
        if (!oldest.done) slots.delete(oldest.value);
      }
      const slot = { at: now };
      slots.set(userId, [...window, slot]);
      let released = false;
      return {
        allowed: true,
        release: () => {
          if (released) return;
          released = true;
          const cur = slots.get(userId);
          if (cur) slots.set(userId, cur.filter((s) => s !== slot));
        },
      };
    },
  };
}

/**
 * Run one live lookup on a reserved slot. Errors known to fire BEFORE anything reaches trade2
 * (`notSpent`: the shared governor being busy, no rates) hand the slot back; any other failure may
 * have spent the search, so the slot stays taken. The error always propagates.
 */
export async function spendReserved<T>(slot: { release: () => void }, notSpent: (e: unknown) => boolean, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e: unknown) {
    if (notSpent(e)) slot.release();
    throw e;
  }
}

/** The one process-wide limiter both live-lookup routes use: a user's clicks share one window. */
export const liveLimiter: LiveLimiter = createLiveLimiter();
