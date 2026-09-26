/**
 * Header-driven trade2 rate limiting. GGG publishes the live policy on every response
 * (pathofexile.com/developer/docs/index#ratelimits):
 *
 *   X-Rate-Limit-Rules:    "Ip,Account"                 — which scopes apply
 *   X-Rate-Limit-Ip:       "8:10:60,15:60:120"         — hits:period:restriction (seconds) per rule
 *   X-Rate-Limit-Ip-State: "3:10:0,7:60:0"             — current hits:period:active-restriction
 *   Retry-After:           "60"                        — on 429, seconds to wait
 *
 * A fixed 6s floor alone can't see a shared budget being drained by another process or a
 * restriction already in force; reading the state lets us stop BEFORE the 429 and honour the
 * penalty window after one.
 */
export interface RateRule {
  hits: number;
  periodSec: number;
  restrictSec: number;
}

export interface RateState {
  hits: number;
  periodSec: number;
  restrictedSec: number;
}

export type HeaderBag = Record<string, unknown>;

/** Fallback wait after a 429 whose Retry-After is missing/garbled. */
const DEFAULT_RETRY_AFTER_SEC = 60;

function triples(value: unknown): Array<[number, number, number]> {
  if (typeof value !== "string" || value.trim() === "") return [];
  return value.split(",").flatMap((part): Array<[number, number, number]> => {
    const nums = part.trim().split(":").map(Number);
    if (nums.length !== 3 || nums.some((n) => !Number.isFinite(n) || n < 0)) return [];
    return [[nums[0]!, nums[1]!, nums[2]!]];
  });
}

/** "8:10:60,15:60:120" → rules. Malformed parts are dropped (never guessed). */
export function parseRules(value: unknown): RateRule[] {
  return triples(value).map(([hits, periodSec, restrictSec]) => ({ hits, periodSec, restrictSec }));
}

/** "3:10:0,7:60:0" → states. */
export function parseStates(value: unknown): RateState[] {
  return triples(value).map(([hits, periodSec, restrictedSec]) => ({ hits, periodSec, restrictedSec }));
}

function header(h: HeaderBag, name: string): unknown {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === lower) return v;
  return undefined;
}

/**
 * Milliseconds to hold off BEFORE the next request, from a response's rate-limit headers.
 * An active restriction wins outright; a rule one hit from its cap waits out its period (we
 * can't see when the oldest hit ages out, so the whole period is the only safe answer).
 */
export function delayFromHeaders(h: HeaderBag): number {
  const scopes = String(header(h, "x-rate-limit-rules") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let waitSec = 0;
  for (const scope of scopes) {
    const rules = parseRules(header(h, `x-rate-limit-${scope}`));
    const states = parseStates(header(h, `x-rate-limit-${scope}-state`));
    for (const state of states) {
      if (state.restrictedSec > 0) waitSec = Math.max(waitSec, state.restrictedSec);
      const rule = rules.find((r) => r.periodSec === state.periodSec);
      if (rule && state.hits >= rule.hits - 1) waitSec = Math.max(waitSec, rule.periodSec);
    }
  }
  return waitSec * 1000;
}

/** Retry-After (seconds) → ms, defaulting conservatively when absent. */
export function retryAfterMs(h: HeaderBag): number {
  const n = Number(header(h, "retry-after"));
  return (Number.isFinite(n) && n > 0 ? n : DEFAULT_RETRY_AFTER_SEC) * 1000;
}

export interface Clock {
  now(): number;
}

export interface RateGovernor {
  /** Feed every trade2 response (success or error) so the next wait reflects live state. */
  observe(status: number | null, headers: HeaderBag): void;
  /** ms the caller must wait before issuing the next request (0 = go). */
  waitMs(): number;
}

/** Stateful governor over an injectable clock (tests drive a fake one). */
export function createRateGovernor(clock: Clock = { now: () => Date.now() }): RateGovernor {
  let blockedUntil = 0;
  return {
    observe(status, headers) {
      const delay = status === 429 ? Math.max(retryAfterMs(headers), delayFromHeaders(headers)) : delayFromHeaders(headers);
      if (delay > 0) blockedUntil = Math.max(blockedUntil, clock.now() + delay);
    },
    waitMs() {
      return Math.max(0, blockedUntil - clock.now());
    },
  };
}
