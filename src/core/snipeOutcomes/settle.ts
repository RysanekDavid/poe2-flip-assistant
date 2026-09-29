import type { Listing } from "../../api/tradeListing";
import type { SearchResp } from "../../api/tradeClient";
import { TradeAuthError, TradeHttpError, TradeRateLimitedError } from "../../api/tradeErrors";
import type { TradeQuery } from "../../lib/tradeLink";
import type { Checkpoint, FetchMethodState, OutcomeMethod } from "../../lib/snipeOutcomeContract";
import { ratedDiv, type DivRates } from "../listingPrice";
import { writeAttemptFailure, writeCheck, type CheckWrite, type OutcomeRow } from "../../db/snipeOutcomeQueries";

/** Everything the checker touches outside the DB — injected so tests run it without trade2. */
export interface OutcomeDeps {
  fetchStates: (ids: string[], queryId: string) => Promise<Array<Listing | null>>;
  search: (q: TradeQuery) => Promise<SearchResp>;
  ratesFor: (league: string) => DivRates | null;
  defaultLeague: string; // createSearch always searches this league
  nowMs: number;
  maxFetches: number;
  maxSearches: number;
}

export interface OutcomeRunSummary {
  fetches: number; // /fetch calls attempted this run
  searches: number; // re-searches attempted this run
  fetchedSlots: number; // listing slots the fetches answered
  fetchedGone: number; // …of which came back null
  listed: number;
  gone: number;
  errors: number; // checkpoints settled as error
  retries: number; // failed attempts left for the next run
  deferred: number; // due rows left for a later run (budget spent, trade2 busy, inconclusive)
  missed: number; // checks settled as error because their window had passed
  stale: number; // rows whose search id trade2 no longer served
  fetchMethod: FetchMethodState; // plan A's standing at the end of the run
}

export interface Run {
  deps: OutcomeDeps;
  summary: OutcomeRunSummary;
  busy: boolean; // the shared trade2 budget refused a request — stop spending this run
}

export function newRun(deps: OutcomeDeps, fetchMethod: FetchMethodState): Run {
  return {
    deps,
    busy: false,
    summary: { fetches: 0, searches: 0, fetchedSlots: 0, fetchedGone: 0, listed: 0, gone: 0, errors: 0, retries: 0, deferred: 0, missed: 0, stale: 0, fetchMethod },
  };
}

export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const searchSlotFree = (run: Run): boolean => !run.busy && run.summary.searches < run.deps.maxSearches;

/**
 * How a thrown trade2 call is handled:
 *   busy  — the shared budget can't admit it soon (pacing, not a failure): defer, stop spending
 *   abort — the cred or the rate limit itself is broken: fail the whole run loudly
 *   stale — 400/404 on /fetch: the search id is no longer served
 *   row   — anything else: this row's attempt failed (retried once)
 */
type Failure = { kind: "busy" } | { kind: "abort"; error: unknown } | { kind: "stale"; status: number } | { kind: "row"; message: string };

export function classifyFailure(e: unknown): Failure {
  if (e instanceof TradeRateLimitedError) return { kind: "busy" };
  if (e instanceof TradeAuthError) return { kind: "abort", error: e };
  if (e instanceof TradeHttpError) {
    if (e.status === 429) return { kind: "abort", error: e };
    if (e.status === 400 || e.status === 404) return { kind: "stale", status: e.status };
  }
  return { kind: "row", message: errText(e) };
}

export function settle(run: Run, row: OutcomeRow, cp: Checkpoint, w: CheckWrite): void {
  writeCheck(row.listing_id, cp, w, run.deps.nowMs);
  if (w.state === "listed") run.summary.listed++;
  else if (w.state === "gone") run.summary.gone++;
  else run.summary.errors++;
}

export function settleError(run: Run, row: OutcomeRow, cp: Checkpoint, error: string, method: OutcomeMethod | null): void {
  settle(run, row, cp, { state: "error", ask: null, method, error });
}

/** Settle from an observation: a listing (listed + its ask as stated, and in Divine when ratable) or null (gone). */
export function settleListing(run: Run, row: OutcomeRow, cp: Checkpoint, listing: Listing | null, method: OutcomeMethod): void {
  if (listing == null) {
    settle(run, row, cp, { state: "gone", ask: null, method, error: null });
    return;
  }
  const rates = run.deps.ratesFor(row.league);
  const price = listing.price;
  // an ask we cannot rate (off-ladder currency, no rates) keeps its raw form; its Div is null, never 0
  const ask = price == null ? null : { amount: price.amount, currency: price.currency, div: rates == null ? null : ratedDiv(price, rates) };
  settle(run, row, cp, { state: "listed", ask, method, error: null });
}

/** A failed attempt: the first is retried next run, the second settles the checkpoint as error. */
export function failAttempt(run: Run, row: OutcomeRow, cp: Checkpoint, message: string, method: OutcomeMethod): void {
  if (row.attempts >= 1) {
    settleError(run, row, cp, message, method);
    return;
  }
  writeAttemptFailure(row.listing_id, message);
  run.summary.retries++;
}
