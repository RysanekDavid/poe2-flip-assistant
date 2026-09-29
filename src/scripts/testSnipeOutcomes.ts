/* Snipe outcome tracking against the TEMP DB of test:snipe's DB half (testSnipeDb.ts runs this):
 * recording, due selection, plan A checkpoints, the budget cap, the retry-once rule, the
 * heartbeat problem and the route's view. The fetch method's self-verification and the plan B
 * fallback live in testSnipeOutcomeMethod.ts. No network: trade2 is faked. */
import { getDb } from "../db/database";
import { dueOutcomes, recheckQueryOf, recordSnipeOutcome, type OutcomeRow } from "../db/snipeOutcomeQueries";
import { checkOutcomes } from "../core/snipeOutcomes/check";
import { snipeOutcomesProblem } from "../core/snipeOutcomes/run";
import { buildOutcomesResponse } from "../core/snipeOutcomes/view";
import { TradeAuthError, TradeHttpError, TradeRateLimitedError } from "../api/tradeErrors";
import { SnipeOutcomesResponseSchema } from "../lib/snipeOutcomeContract";
import { subsystemSpecs } from "../core/subsystems";
import { config } from "../config/env";
import { fake, L, listing, NOW, reset, row, track, type Ok } from "./snipeOutcomeFixtures";
import { fetchMethodTests } from "./testSnipeOutcomeMethod";

function subsystemGate(ok: Ok): void {
  const spec = (outcomes: boolean, snipe: boolean) =>
    subsystemSpecs({ ...config, snipeOutcomes: { ...config.snipeOutcomes, enabled: outcomes }, autoSnipe: { ...config.autoSnipe, enabled: snipe } })["snipe-outcomes"];
  ok("subsystem: on only while autosnipe is on too, every 30 min", spec(true, true).enabled && !spec(true, false).enabled && !spec(false, true).enabled && spec(true, true).expectedSec === 1800);
}

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
  const x1 = row("x1");
  ok("plan A: served → listed with the raw ask + its Div, method fetch", x1.check_2h === "listed" && x1.check_2h_ask_amount === 50 && x1.check_2h_ask_currency === "exalted" && x1.check_2h_ask_div === 0.5 && x1.check_2h_method === "fetch");
  ok("plan A: null slot → gone; a mixed chunk needs no cross-check", row("x2").check_2h === "gone" && f.searches.length === 0);
  ok("budget: a second query id waits for the next run", row("y1").check_2h === null && s.deferred === 1 && s.fetches === 1);
  ok("window: a 2 h check reached at 5 h is an error, not an observation", row("late").check_2h === "error" && /missed the 2 h window/.test(row("late").last_error ?? "") && s.missed === 1);
  await checkOutcomes(fake({ fetchStates: async (ids) => ids.map((id) => listing(id, 3, "mirror")) }).deps);
  const y1 = row("y1");
  ok("plan A: an unrated ask keeps its raw form, its Div is null (never 0)", y1.check_2h === "listed" && y1.check_2h_ask_currency === "mirror" && y1.check_2h_ask_div === null);
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

async function heartbeatProblem(ok: Ok): Promise<void> {
  reset();
  track("h1", 2.5);
  const s = await checkOutcomes(fake().deps); // one row: never cross-checked, the null stands
  ok("heartbeat: all fetched slots gone while unverified → problem", s.fetchMethod === "unverified" && /unverified/.test(snipeOutcomesProblem(s) ?? ""));
  ok("heartbeat: same run with a verified method → fine", snipeOutcomesProblem({ ...s, fetchMethod: "verified" }) === null);
}

function routeView(ok: Ok): void {
  const rows = getDb().prepare("SELECT * FROM snipe_outcomes").all() as OutcomeRow[];
  const body = buildOutcomesResponse(rows, { league: L, windowDays: 30, labels: new Map([["gloves", "Gloves"]]), fetchMethod: "unverified" });
  const parsed = SnipeOutcomesResponseSchema.safeParse(body);
  ok("route body passes its schema", parsed.success, parsed.success ? "" : parsed.error.message);
  ok("route body: stats labelled, every listing keyed, method state carried", body.profiles[0]?.label === "Gloves" && Object.keys(body.byListing).length === rows.length && body.fetchMethod === "unverified");
  const other = buildOutcomesResponse(rows, { league: "Other", windowDays: 30, labels: new Map<string, string>(), fetchMethod: "verified" });
  ok("route body: stats and pending only for the scanner's league", other.profiles.length === 0 && other.pending === 0);
}

export async function snipeOutcomeTests(ok: Ok): Promise<void> {
  subsystemGate(ok);
  recordAndDue(ok);
  await planAChecks(ok);
  await retryAndErrors(ok);
  await heartbeatProblem(ok);
  routeView(ok);
  await fetchMethodTests(ok);
}
