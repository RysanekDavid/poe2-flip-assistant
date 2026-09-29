/* Snipe outcome tracking against the TEMP DB of test:snipe's DB half (testSnipeDb.ts runs this):
 * recording, due selection, checkpoints, the retry-once rule, plan A (fetch) with the plan B
 * (re-search) fallback, the budget caps, and the route's view. No network: trade2 is faked. */
import { getDb } from "../db/database";
import { dueOutcomes, recheckQueryOf, recordSnipeOutcome, type NewSnipeOutcome, type OutcomeRow } from "../db/snipeOutcomeQueries";
import { checkOutcomes } from "../core/snipeOutcomes/check";
import type { OutcomeDeps } from "../core/snipeOutcomes/settle";
import { buildOutcomesResponse } from "../core/snipeOutcomes/view";
import { parseListing, type Listing } from "../api/tradeListing";
import { TradeHttpError, type SearchResp } from "../api/tradeClient";
import { TradeAuthError, TradeRateLimitedError } from "../api/tradeErrors";
import { SnipeOutcomesResponseSchema } from "../lib/snipeOutcomeContract";
import type { TradeQuery } from "../lib/tradeLink";
import { subsystemSpecs } from "../core/subsystems";
import { config } from "../config/env";

type Ok = (name: string, cond: boolean, extra?: string) => void;

const H = 3_600_000;
const NOW = Date.parse("2026-09-29T12:00:00Z");
const L = "League Alpha";

function listing(id: string, amount: number, currency = "exalted"): Listing {
  const l = parseListing({ id, listing: { price: { amount, currency }, account: { name: "Seller" } }, item: { baseType: "Vaal Gauntlets", rarity: "Rare" } });
  if (l == null) throw new Error("fixture listing did not parse");
  return l;
}

function track(id: string, ageH: number, queryId = "q1", recheck: TradeQuery | null = { type: "Vaal Gauntlets", online: false, account: "Seller" }): void {
  const o: NewSnipeOutcome = {
    listingId: id, league: L, profile: "gloves", baseType: "Vaal Gauntlets", itemName: "Doom Grip",
    askDiv: 1, valueDiv: 2, marginPct: 50, samples: 8, queryId, recheckQuery: recheck, alertedAt: NOW - ageH * H,
  };
  if (!recordSnipeOutcome(o)) throw new Error(`fixture ${id} already tracked`);
}

const row = (id: string): OutcomeRow => {
  const r = getDb().prepare("SELECT * FROM snipe_outcomes WHERE listing_id = ?").get(id) as OutcomeRow | undefined;
  if (!r) throw new Error(`no row ${id}`);
  return r;
};

interface Fake {
  deps: OutcomeDeps;
  fetches: Array<{ ids: string[]; queryId: string }>;
  searches: TradeQuery[];
}

function fake(over: Partial<OutcomeDeps> = {}): Fake {
  const fetches: Fake["fetches"] = [];
  const searches: Fake["searches"] = [];
  const base: OutcomeDeps = {
    fetchStates: async (ids) => ids.map(() => null),
    search: async (): Promise<SearchResp> => ({ id: "fresh", result: [], total: 0 }),
    ratesFor: () => ({ exaltPerDivine: 100, chaosPerDivine: 20 }),
    defaultLeague: L,
    nowMs: NOW,
    maxFetches: 5,
    maxSearches: 3,
    ...over,
  };
  const deps: OutcomeDeps = {
    ...base,
    fetchStates: (ids, queryId) => {
      fetches.push({ ids, queryId });
      return base.fetchStates(ids, queryId);
    },
    search: (q) => {
      searches.push(q);
      return base.search(q);
    },
  };
  return { deps, fetches, searches };
}

const reset = (): void => {
  getDb().exec("DELETE FROM snipe_outcomes");
};

function recordAndDue(ok: Ok): void {
  reset();
  track("a", 1);
  ok("outcome: once per listing", !recordSnipeOutcome({ listingId: "a", league: L, profile: "p", baseType: "b", itemName: "i", askDiv: 1, valueDiv: 2, marginPct: 50, samples: 5, queryId: "q", recheckQuery: null, alertedAt: NOW }));
  ok("outcome: re-search query round-trips", recheckQueryOf(row("a"))?.account === "Seller");
  track("b", 3);
  track("c", 30);
  getDb().prepare("UPDATE snipe_outcomes SET check_2h = 'listed', check_2h_at = ? WHERE listing_id = 'c'").run(NOW);
  track("d", 30);
  getDb().prepare("UPDATE snipe_outcomes SET check_2h = 'gone', check_2h_at = ? WHERE listing_id = 'd'").run(NOW);
  const due = dueOutcomes(NOW, 100);
  ok("due: 1 h old not due, 3 h old due at 2 h", due.due2h.map((r) => r.listing_id).join() === "b");
  ok("due: 24 h waits for the 2 h check and skips a gone listing", due.due24h.map((r) => r.listing_id).join() === "c");
}

async function planAChecks(ok: Ok): Promise<void> {
  reset();
  track("x1", 2.5);
  track("x2", 2.5);
  track("y1", 2.5, "q2");
  track("late", 5);
  const f = fake({ maxFetches: 1, fetchStates: async (ids) => ids.map((id) => (id === "x1" ? listing(id, 50) : null)) });
  const s = await checkOutcomes(f.deps);
  ok("plan A: one fetch per query id, ≤10 ids", f.fetches.length === 1 && f.fetches[0]?.queryId === "q1" && f.fetches[0]?.ids.join() === "x1,x2");
  ok("plan A: served → listed + rated ask, null → gone, method fetch", row("x1").check_2h === "listed" && row("x1").check_2h_ask_div === 0.5 && row("x2").check_2h === "gone" && row("x2").check_2h_method === "fetch");
  ok("budget: a second query id waits for the next run", row("y1").check_2h === null && s.deferred === 1 && s.fetches === 1);
  ok("window: a 2 h check reached at 5 h is an error, not an observation", row("late").check_2h === "error" && /missed the 2 h window/.test(row("late").last_error ?? "") && s.missed === 1);
  const unrated = fake({ fetchStates: async (ids) => ids.map((id) => listing(id, 3, "mirror")) });
  await checkOutcomes(unrated.deps);
  ok("plan A: an unrated ask is stored as null, never 0", row("y1").check_2h === "listed" && row("y1").check_2h_ask_div === null);
}

async function retryAndErrors(ok: Ok): Promise<void> {
  reset();
  track("r1", 2.5);
  const boom = fake({ fetchStates: async () => Promise.reject(new Error("socket hang up")) });
  await checkOutcomes(boom.deps);
  ok("retry: first failure leaves the check open, counts the attempt", row("r1").check_2h === null && row("r1").attempts === 1 && /socket hang up/.test(row("r1").last_error ?? ""));
  await checkOutcomes(boom.deps);
  ok("retry: second failure settles as error", row("r1").check_2h === "error" && row("r1").attempts === 0);
  track("s1", 2.5);
  await checkOutcomes(fake({ fetchStates: async () => Promise.reject(new TradeHttpError("gone query", 400)) }).deps);
  ok("stale id at 2 h: error, no re-search (24 h only)", row("s1").check_2h === "error" && row("s1").check_2h_method === "fetch");
  track("b1", 2.5, "qb");
  track("b2", 2.5, "qc");
  const busy = fake({ fetchStates: async () => Promise.reject(new TradeRateLimitedError("fetch", 300_000)) });
  const s = await checkOutcomes(busy.deps);
  ok("busy budget: deferred, not an attempt, and stops spending", busy.fetches.length === 1 && s.deferred === 2 && row("b1").attempts === 0 && row("b1").check_2h === null);
  let threw = false;
  await checkOutcomes(fake({ fetchStates: async () => Promise.reject(new TradeAuthError("get", "/fetch")) }).deps).catch(() => {
    threw = true; // the assertion IS that an auth failure fails the run
  });
  ok("expired cookie fails the whole run loudly", threw && row("b1").attempts === 0);
}

function at24h(id: string, queryId: string, recheck: TradeQuery | null = { type: "Vaal Gauntlets", online: false, account: "Seller" }): void {
  track(id, 25, queryId, recheck);
  getDb().prepare("UPDATE snipe_outcomes SET check_2h = 'listed', check_2h_at = ? WHERE listing_id = ?").run(NOW - 23 * H, id);
}

async function planBFallback(ok: Ok): Promise<void> {
  reset();
  at24h("f1", "old");
  at24h("f2", "old");
  at24h("f3", "old", null);
  at24h("f4", "old");
  const f = fake({
    maxSearches: 2,
    fetchStates: async (ids, queryId) => (queryId === "old" ? Promise.reject(new TradeHttpError("expired", 404)) : ids.map((id) => listing(id, 20))),
    search: async (): Promise<SearchResp> => ({ id: "fresh", result: ["f1", "zz"], total: 2 }),
  });
  const s = await checkOutcomes(f.deps);
  ok("fallback: expired id → one re-search per row, capped per run", f.searches.length === 2 && f.searches[0]?.account === "Seller" && s.stale === 4);
  ok("fallback: found by the re-search → listed, ask read via the fresh id", row("f1").check_24h === "listed" && row("f1").check_24h_method === "search" && row("f1").check_24h_ask_div === 0.2 && f.fetches.some((x) => x.queryId === "fresh"));
  ok("fallback: absent from a complete page → gone (method search)", row("f2").check_24h === "gone" && row("f2").check_24h_method === "search");
  ok("fallback: unknown seller → error, no search spent", row("f3").check_24h === "error" && /seller is unknown/.test(row("f3").last_error ?? ""));
  ok("fallback: search budget spent → next run", row("f4").check_24h === null && s.deferred === 1);
  at24h("f5", "old2");
  await checkOutcomes(fake({ fetchStates: async () => Promise.reject(new TradeHttpError("expired", 400)), search: async () => ({ id: "fresh", result: ["zz"], total: 250 }) }).deps);
  ok("fallback: absent from a truncated page proves nothing → error", row("f5").check_24h === "error" && /more than one page/.test(row("f5").last_error ?? ""));
}

async function crossCheck(ok: Ok): Promise<void> {
  reset();
  at24h("n1", "qn");
  at24h("n2", "qn");
  const f = fake({ maxSearches: 1, search: async () => ({ id: "fresh", result: ["n1"], total: 1 }), fetchStates: async (ids, q) => (q === "qn" ? ids.map(() => null) : ids.map((id) => listing(id, 10))) });
  await checkOutcomes(f.deps);
  ok("cross-check: an all-null 24 h fetch is verified by one re-search", f.searches.length === 1 && row("n1").check_24h === "listed" && row("n1").check_24h_method === "search");
  ok("cross-check: the id served nulls → dropped, the rest wait for plan B", row("n2").check_24h === null && row("n2").query_id === null);
  const next = fake({ search: async () => ({ id: "fresh", result: [], total: 0 }) });
  await checkOutcomes(next.deps);
  ok("cross-check: next run re-searches it without a fetch", next.fetches.length === 0 && row("n2").check_24h === "gone" && row("n2").check_24h_method === "search");
  at24h("g1", "qg");
  const agree = fake({ search: async () => ({ id: "fresh", result: [], total: 0 }) });
  await checkOutcomes(agree.deps);
  ok("cross-check: re-search agrees → the fetch's gone stands", row("g1").check_24h === "gone" && row("g1").check_24h_method === "fetch");
}

function routeView(ok: Ok): void {
  const rows = getDb().prepare("SELECT * FROM snipe_outcomes").all() as OutcomeRow[];
  const body = buildOutcomesResponse(rows, { league: L, windowDays: 30, labels: new Map([["gloves", "Gloves"]]) });
  const parsed = SnipeOutcomesResponseSchema.safeParse(body);
  ok("route body passes its schema", parsed.success, parsed.success ? "" : parsed.error.message);
  ok("route body: stats labelled, every listing keyed", body.profiles[0]?.label === "Gloves" && Object.keys(body.byListing).length === rows.length);
  const other = buildOutcomesResponse(rows, { league: "Other", windowDays: 30, labels: new Map() });
  ok("route body: stats and pending only for the scanner's league", other.profiles.length === 0 && other.pending === 0);
}

function subsystemGate(ok: Ok): void {
  const spec = (outcomes: boolean, snipe: boolean) =>
    subsystemSpecs({ ...config, snipeOutcomes: { ...config.snipeOutcomes, enabled: outcomes }, autoSnipe: { ...config.autoSnipe, enabled: snipe } })["snipe-outcomes"];
  ok("subsystem: on only while autosnipe is on too, every 30 min", spec(true, true).enabled && !spec(true, false).enabled && !spec(false, true).enabled && spec(true, true).expectedSec === 1800);
}

export async function snipeOutcomeTests(ok: Ok): Promise<void> {
  subsystemGate(ok);
  recordAndDue(ok);
  await planAChecks(ok);
  await retryAndErrors(ok);
  await planBFallback(ok);
  await crossCheck(ok);
  routeView(ok);
}
