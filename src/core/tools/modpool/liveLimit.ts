import { createLoginRateLimiter, type LoginGate, type LoginRateLimitOptions } from "../../../auth/loginRateLimit";

/**
 * Per-user cap on mod-pool live values that actually spend a trade2 search: 10 per rolling hour.
 * Cache hits never count. The shared web limiter already protects the account-wide budget; this
 * keeps one user clicking down a 31-row table from eating everyone's interactive searches.
 *
 * Reuses the login limiter's in-memory sliding window (one `next start` process sees every request;
 * a restart only ever errs toward allowing). Its "failure" is simply "one spent search" here.
 */
export const LIVE_VALUES_PER_HOUR = 10;

export interface LiveLimiter {
  check(userId: number): LoginGate;
  recordSpend(userId: number): void;
}

export function createLiveLimiter(overrides: Partial<LoginRateLimitOptions> = {}): LiveLimiter {
  const inner = createLoginRateLimiter({ maxFailures: LIVE_VALUES_PER_HOUR, windowMs: 3_600_000, ...overrides });
  const key = (userId: number): string => `mod-pool-live:${userId}`;
  return {
    check: (userId) => inner.check(key(userId)),
    recordSpend: (userId) => inner.recordFailure(key(userId)),
  };
}

/**
 * Run one live value and count it against the user. Errors that are known to fire BEFORE anything
 * reaches trade2 (`notSpent`: the shared limiter being busy, no rates) are not counted; any other
 * failure may have spent the search, so it counts. The error always propagates.
 */
export async function meteredSpend<T>(limiter: LiveLimiter, userId: number, notSpent: (e: unknown) => boolean, run: () => Promise<T>): Promise<T> {
  try {
    const out = await run();
    limiter.recordSpend(userId);
    return out;
  } catch (e: unknown) {
    if (!notSpent(e)) limiter.recordSpend(userId);
    throw e;
  }
}

/** The process-wide limiter the value route uses. */
export const liveLimiter: LiveLimiter = createLiveLimiter();
