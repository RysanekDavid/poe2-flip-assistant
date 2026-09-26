/**
 * Header-driven trade2 rate limiting. GGG publishes the live policy on every response
 * (pathofexile.com/developer/docs/index#ratelimits):
 *
 *   X-Rate-Limit-Rules:    "Ip"                                       — which scopes apply
 *   X-Rate-Limit-Ip:       "5:10:60,15:60:300,30:300:1800,600:21600:3600"  — hits:period:restriction (s)
 *   X-Rate-Limit-Ip-State: "1:10:0,1:60:0,1:300:0,1:21600:0"          — current hits:period:active-restriction
 *   Retry-After:           "60"                                       — on 429, seconds to wait
 *
 * We keep our OWN request timestamps per endpoint kind (search / fetch) and, per rule, wait only
 * until enough of them age out of that rule's window — never a whole period on spec (the first
 * version waited the full 6h period of the 600:21600 rule: a 6× longer lockout than GGG's own
 * penalty). On top of the windows, requests are PACED to the tightest sustained rate the rules
 * allow (600 searches / 6h ≈ one per 36s), so hunts can't burn the long window in the first hour
 * and then sit dead for five.
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

export type TradeEndpoint = "search" | "fetch";

/**
 * Live policies observed 2026-09-26 (search + fetch, per IP). Used until a response tells us the
 * current ones, so the very first request after a restart is already paced correctly.
 */
export const DEFAULT_RULES: Record<TradeEndpoint, RateRule[]> = {
  search: parseRules("5:10:60,15:60:300,30:300:1800,600:21600:3600"),
  fetch: parseRules("12:4:10,16:12:300,50:300:300,1000:21600:1800"),
};

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

/** "5:10:60,15:60:300" → rules. Malformed parts are dropped (never guessed). */
export function parseRules(value: unknown): RateRule[] {
  return triples(value)
    .filter(([hits, periodSec]) => hits > 0 && periodSec > 0)
    .map(([hits, periodSec, restrictSec]) => ({ hits, periodSec, restrictSec }));
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

/** Every (rule, state) pair a response reports, across all its scopes (Ip, Account, …). */
export function readPolicy(h: HeaderBag): { rules: RateRule[]; states: Array<{ rule: RateRule | null; state: RateState }> } {
  const scopes = String(header(h, "x-rate-limit-rules") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rules: RateRule[] = [];
  const states: Array<{ rule: RateRule | null; state: RateState }> = [];
  for (const scope of scopes) {
    const scopeRules = parseRules(header(h, `x-rate-limit-${scope}`));
    rules.push(...scopeRules);
    for (const state of parseStates(header(h, `x-rate-limit-${scope}-state`))) {
      states.push({ rule: scopeRules.find((r) => r.periodSec === state.periodSec) ?? null, state });
    }
  }
  return { rules, states };
}

/** Retry-After (seconds) → ms, defaulting conservatively when absent. */
export function retryAfterMs(h: HeaderBag): number {
  const n = Number(header(h, "retry-after"));
  return (Number.isFinite(n) && n > 0 ? n : DEFAULT_RETRY_AFTER_SEC) * 1000;
}

/** One request of headroom under every cap: the other process may have one in flight. */
const capOf = (rule: RateRule): number => Math.max(1, rule.hits - 1);

/** Sustained-rate spacing: the slowest per-request pace any rule allows (36s for 600/6h). */
export function paceMs(rules: RateRule[]): number {
  return rules.reduce((mx, r) => Math.max(mx, (r.periodSec * 1000) / r.hits), 0);
}

/**
 * Pure: ms to wait before the next request, given our own request timestamps (ascending), the
 * rules and any active restriction. Window rule: wait until enough of the requests inside the
 * window age out to get back under the cap. Pace: wait until `paceMs` after the latest request.
 */
export function computeWaitMs(now: number, hitsAsc: number[], rules: RateRule[], blockedUntil: number): number {
  let wait = Math.max(0, blockedUntil - now);
  for (const rule of rules) {
    const periodMs = rule.periodSec * 1000;
    const inWindow = hitsAsc.filter((t) => t > now - periodMs);
    const cap = capOf(rule);
    if (inWindow.length >= cap) {
      const mustAge = inWindow[inWindow.length - cap]!; // oldest request that keeps us at the cap
      wait = Math.max(wait, mustAge + periodMs - now);
    }
  }
  const last = hitsAsc[hitsAsc.length - 1];
  if (last != null) wait = Math.max(wait, last + paceMs(rules) - now);
  return Math.max(0, Math.ceil(wait));
}

/** Longest window among the rules — how far back request timestamps must be kept. */
export const horizonMs = (rules: RateRule[]): number => rules.reduce((mx, r) => Math.max(mx, r.periodSec * 1000), 0);

/** Persistence for the governor — the DB in production (shared by web + poller), memory in tests. */
export interface RateStore {
  /** Run `fn` atomically across processes (BEGIN IMMEDIATE in SQLite). */
  atomically<T>(fn: () => T): T;
  hits(kind: TradeEndpoint, sinceMs: number): number[];
  addHits(kind: TradeEndpoint, atMs: number, count: number): void;
  policy(kind: TradeEndpoint): { rules: RateRule[]; blockedUntil: number } | null;
  savePolicy(kind: TradeEndpoint, rules: RateRule[], blockedUntil: number): void;
  prune(kind: TradeEndpoint, beforeMs: number): void;
}

export interface Clock {
  now(): number;
}

export interface RateGovernor {
  /** Atomically: if the request may go now, record it and return 0; otherwise the ms to wait. */
  reserve(kind: TradeEndpoint): number;
  /** Feed every trade2 response (success or error) so the next wait reflects live state. */
  observe(kind: TradeEndpoint, status: number | null, headers: HeaderBag): void;
}

function currentPolicy(store: RateStore, kind: TradeEndpoint): { rules: RateRule[]; blockedUntil: number } {
  const p = store.policy(kind);
  return p && p.rules.length > 0 ? p : { rules: DEFAULT_RULES[kind], blockedUntil: p?.blockedUntil ?? 0 };
}

/**
 * Governor over a store + clock. `observe` also reconciles with GGG's own count: when a state
 * reports more hits than we logged (a restart, another consumer on this IP), the difference is
 * logged as requests made as recently as that window allows — we can't know when they really
 * happened, so they age out late, which errs on the safe side without ever exceeding one window.
 */
export function createRateGovernor(store: RateStore, clock: Clock = { now: () => Date.now() }): RateGovernor {
  return {
    reserve(kind) {
      return store.atomically(() => {
        const now = clock.now();
        const { rules, blockedUntil } = currentPolicy(store, kind);
        const horizon = horizonMs(rules);
        store.prune(kind, now - horizon);
        const wait = computeWaitMs(now, store.hits(kind, now - horizon), rules, blockedUntil);
        if (wait === 0) store.addHits(kind, now, 1);
        return wait;
      });
    },
    observe(kind, status, headers) {
      store.atomically(() => {
        const now = clock.now();
        const prev = currentPolicy(store, kind);
        const { rules, states } = readPolicy(headers);
        let blockedUntil = prev.blockedUntil;
        let shorterMs = 0; // states are reconciled shortest window first
        for (const { rule, state } of [...states].sort((a, b) => a.state.periodSec - b.state.periodSec)) {
          if (state.restrictedSec > 0) blockedUntil = Math.max(blockedUntil, now + state.restrictedSec * 1000);
          if (!rule) continue;
          const own = store.hits(kind, now - rule.periodSec * 1000).length;
          // unexplained hits are logged just OUTSIDE the next-shorter window, so a 6h rule's backlog
          // doesn't also count against the 10s/60s rules (their own states pad those)
          if (state.hits > own) store.addHits(kind, now - shorterMs, state.hits - own);
          shorterMs = rule.periodSec * 1000;
        }
        if (status === 429) blockedUntil = Math.max(blockedUntil, now + retryAfterMs(headers));
        store.savePolicy(kind, rules.length > 0 ? rules : prev.rules, blockedUntil);
      });
    },
  };
}

/** In-memory store (tests; also a fallback shape reference for the DB store). */
export function memoryRateStore(): RateStore {
  const hits = new Map<TradeEndpoint, number[]>();
  const policies = new Map<TradeEndpoint, { rules: RateRule[]; blockedUntil: number }>();
  return {
    atomically: (fn) => fn(),
    hits: (kind, since) => (hits.get(kind) ?? []).filter((t) => t > since).sort((a, b) => a - b),
    addHits: (kind, at, count) => hits.set(kind, [...(hits.get(kind) ?? []), ...Array.from({ length: count }, () => at)]),
    policy: (kind) => policies.get(kind) ?? null,
    savePolicy: (kind, rules, blockedUntil) => policies.set(kind, { rules, blockedUntil }),
    prune: (kind, before) => hits.set(kind, (hits.get(kind) ?? []).filter((t) => t >= before)),
  };
}
