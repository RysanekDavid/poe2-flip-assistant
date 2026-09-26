/**
 * Sliding-window limiter for failed logins, keyed by client IP + normalized username.
 *
 * State is in-memory: production runs a single `next start` process, so one Map sees every
 * login. A restart resets the counters, which only ever errs toward letting a user back in.
 * If the web tier is ever scaled to several processes this must move to SQLite.
 */

export interface LoginRateLimitOptions {
  maxFailures: number;
  windowMs: number;
  /** Upper bound on tracked keys so a spray of random usernames can't grow memory unbounded. */
  maxKeys: number;
  now: () => number;
}

export type LoginGate = { allowed: true } | { allowed: false; retryAfterSec: number };

export interface LoginRateLimiter {
  check(key: string): LoginGate;
  recordFailure(key: string): void;
  recordSuccess(key: string): void;
  size(): number;
}

export const LOGIN_RATE_LIMIT_DEFAULTS: LoginRateLimitOptions = {
  maxFailures: 5,
  windowMs: 15 * 60_000,
  maxKeys: 10_000,
  now: Date.now,
};

export function createLoginRateLimiter(
  overrides: Partial<LoginRateLimitOptions> = {},
): LoginRateLimiter {
  const options = { ...LOGIN_RATE_LIMIT_DEFAULTS, ...overrides };
  const failures = new Map<string, number[]>();

  const recent = (key: string, now: number): number[] => {
    const cutoff = now - options.windowMs;
    const kept = (failures.get(key) ?? []).filter((at) => at > cutoff);
    if (kept.length === 0) failures.delete(key);
    else failures.set(key, kept);
    return kept;
  };

  const evictIfFull = (now: number): void => {
    if (failures.size < options.maxKeys) return;
    for (const key of [...failures.keys()]) recent(key, now);
    // Still full after dropping expired windows: evict the oldest-inserted key (Map order).
    while (failures.size >= options.maxKeys) {
      const oldest = failures.keys().next();
      if (oldest.done) break;
      failures.delete(oldest.value);
    }
  };

  return {
    check(key) {
      const now = options.now();
      const window = recent(key, now);
      if (window.length < options.maxFailures) return { allowed: true };
      const oldest = window[window.length - options.maxFailures] ?? now;
      const retryAfterMs = oldest + options.windowMs - now;
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    },
    recordFailure(key) {
      const now = options.now();
      const window = recent(key, now);
      if (window.length === 0) evictIfFull(now);
      failures.set(key, [...window, now]);
    },
    recordSuccess(key) {
      failures.delete(key);
    },
    size() {
      return failures.size;
    },
  };
}

/**
 * Client IP as seen by Caddy. Caddy does not trust client-supplied X-Forwarded-For by default
 * and sets it to the real peer address, so the rightmost entry is the one our proxy vouches for.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).pop();
  return last ?? "unknown";
}

export function loginRateLimitKey(ip: string, username: string): string {
  // users.name is COLLATE NOCASE, so case variants must share one budget.
  return `${ip}\u0000${username.trim().toLowerCase()}`;
}

const processScope = globalThis as typeof globalThis & { __poe2flipLoginLimiter?: LoginRateLimiter };

/**
 * The process-wide limiter. Held on globalThis because Next inlines this module into every route
 * bundle separately; a module-level instance would give /api/auth/login and /api/auth/password
 * independent Maps, and the password route would not share the login budget.
 */
export const loginRateLimiter: LoginRateLimiter =
  (processScope.__poe2flipLoginLimiter ??= createLoginRateLimiter());
