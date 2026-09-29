import { dueOutcomes, getFetchMethodState, HOUR_MS, recordFetchVerdict, writeDeferral, type OutcomeRow } from "../../db/snipeOutcomeQueries";
import type { Listing } from "../../api/tradeListing";
import type { Checkpoint } from "../../lib/snipeOutcomeContract";
import { classifyFailure, failAttempt, newRun, searchSlotFree, settleError, settleListing, type OutcomeDeps, type OutcomeRunSummary, type Run } from "./settle";
import { applyResearch, research, researchBlocker } from "./research";

/**
 * Snipe outcome checker. Every alerted listing is re-checked ~2 h and ~24 h after its alert:
 *
 *   plan A (default) — /fetch the listing ids against the search that FOUND them (query_id,
 *     recorded at alert time), ≤10 ids per fetch, ≤maxFetches per run. A served entry = listed
 *     (+ its current ask), a null slot = gone.
 *   plan B — one fresh seller+base re-search per row, ≤maxSearches per run: at 24 h when trade2
 *     answers 400/404 for the old search id (or none was stored), and at both checkpoints once
 *     plan A is known to be broken.
 *
 * Plan A verifies itself. Nobody could probe whether trade2 answers an hours-old search id with
 * real states or with nulls, so a fetch that reports a WHOLE chunk (≥2 rows) gone is cross-checked
 * by re-searching one of its rows — this spends one search from the same per-run cap:
 *   - the re-search does not find it either → the method agrees (unverified → verified);
 *   - it finds the listing → the fetch served nulls for a live listing: the method is broken
 *     (sticky), every later check re-searches, and past fetch-based "gone" results read as unverified;
 *   - it fails (network, 5xx) → nothing is settled; the chunk is retried next run.
 * At 2 h the cross-check runs while the method is unverified and a search slot is free (else the
 * fetch stands). At 24 h it always runs — a search id that works at 2 h may still expire into
 * nulls later — so a 24 h chunk of ≥2 rows is only fetched when a search slot is free for it.
 * One-row chunks are never cross-checked: the search would cost as much as the answer is worth.
 */

/** A 2 h check run later than this is not a 2 h observation any more. */
const TWO_H_WINDOW_MS = 4 * HOUR_MS;
/** …nor a 24 h check run more than a day late. */
const DAY_WINDOW_MS = 48 * HOUR_MS;
/** Due rows read per run — far above what the fetch budget can settle. */
const DUE_LIMIT = 200;
const CHUNK = 10;

/** Rows grouped by the search id they must quote, ≤10 per group, oldest first. */
function chunkByQuery(rows: readonly OutcomeRow[]): Array<{ queryId: string; rows: OutcomeRow[] }> {
  const groups = new Map<string, OutcomeRow[]>();
  for (const r of rows) {
    if (r.query_id == null) continue;
    const list = groups.get(r.query_id) ?? [];
    list.push(r);
    groups.set(r.query_id, list);
  }
  const chunks: Array<{ queryId: string; rows: OutcomeRow[] }> = [];
  for (const [queryId, list] of groups) {
    for (let i = 0; i < list.length; i += CHUNK) chunks.push({ queryId, rows: list.slice(i, i + CHUNK) });
  }
  return chunks;
}

const wantsCrossCheck = (run: Run, cp: Checkpoint, rows: readonly OutcomeRow[]): boolean =>
  rows.length >= 2 && (cp === "24h" || run.summary.fetchMethod === "unverified");

async function fetchChunk(run: Run, cp: Checkpoint, queryId: string, rows: OutcomeRow[]): Promise<"done" | "stale" | "deferred" | Array<Listing | null>> {
  const needsSearch = cp === "24h" && wantsCrossCheck(run, cp, rows);
  if (run.busy || run.summary.fetches >= run.deps.maxFetches || (needsSearch && !searchSlotFree(run))) {
    run.summary.deferred += rows.length;
    return "deferred";
  }
  run.summary.fetches++;
  try {
    const states = await run.deps.fetchStates(rows.map((r) => r.listing_id), queryId);
    if (states.length !== rows.length) throw new Error(`fetchStates answered ${states.length} states for ${rows.length} ids`);
    run.summary.fetchedSlots += states.length;
    run.summary.fetchedGone += states.filter((s) => s == null).length;
    return states;
  } catch (e) {
    const f = classifyFailure(e);
    if (f.kind === "abort") throw f.error;
    if (f.kind === "busy") {
      run.busy = true;
      run.summary.deferred += rows.length;
      return "deferred";
    }
    if (f.kind === "stale") {
      run.summary.stale += rows.length;
      return "stale";
    }
    for (const r of rows) failAttempt(run, r, cp, `fetch: ${f.message}`, "fetch");
    return "done";
  }
}

/** Put a whole chunk off to the next run without settling it or counting an attempt. */
function deferChunk(run: Run, rows: readonly OutcomeRow[], reason: string | null): void {
  if (reason != null) writeDeferral(rows.map((r) => r.listing_id), reason);
  run.summary.deferred += rows.length;
}

/**
 * The fetch said every row of the chunk is gone: confirm on one re-searchable row (see the
 * module doc). Returns the rows plan B must answer instead (after a contradiction).
 */
async function crossCheckAllGone(run: Run, cp: Checkpoint, rows: OutcomeRow[]): Promise<OutcomeRow[]> {
  const probe = rows.find((r) => researchBlocker(run, r) == null);
  if (probe == null || !searchSlotFree(run)) {
    for (const r of rows) settleListing(run, r, cp, null, "fetch"); // no independent check possible: the fetch stands
    return [];
  }
  const verdict = await research(run, probe);
  if (verdict.kind === "busy") {
    deferChunk(run, rows, null);
    return [];
  }
  if (verdict.kind === "failed") {
    console.warn(`[snipe-outcomes] cross-check of ${probe.listing_id} failed — ${verdict.message}; chunk retried next run`);
    deferChunk(run, rows, `cross-check pending: ${verdict.message}`);
    return [];
  }
  if (verdict.kind === "listed") {
    run.summary.fetchMethod = recordFetchVerdict("contradicts", `search ${probe.query_id ?? "?"} served null for ${probe.listing_id}, which a re-search found listed`, run.deps.nowMs);
    console.error(`[snipe-outcomes] fetch method BROKEN: search ${probe.query_id ?? "?"} served null for listing ${probe.listing_id}, which a re-search found listed — every check re-searches from now on`);
    applyResearch(run, probe, cp, verdict);
    return rows.filter((r) => r !== probe);
  }
  if (verdict.kind === "gone") {
    run.summary.fetchMethod = recordFetchVerdict("agrees", `re-search agreed ${probe.listing_id} is gone`, run.deps.nowMs);
  }
  for (const r of rows) settleListing(run, r, cp, null, "fetch"); // agreed, or the re-search was inconclusive
  return [];
}

/** Plan A for one checkpoint; returns the rows plan B must answer (stale ids / method broken). */
async function planA(run: Run, cp: Checkpoint, rows: OutcomeRow[]): Promise<{ stale: OutcomeRow[]; toPlanB: OutcomeRow[] }> {
  const stale: OutcomeRow[] = [];
  const toPlanB: OutcomeRow[] = [];
  for (const { queryId, rows: chunk } of chunkByQuery(rows)) {
    if (run.summary.fetchMethod === "broken") {
      toPlanB.push(...chunk);
      continue;
    }
    const res = await fetchChunk(run, cp, queryId, chunk);
    if (res === "stale") stale.push(...chunk);
    if (typeof res === "string") continue;
    if (res.every((s) => s == null) && wantsCrossCheck(run, cp, chunk)) {
      toPlanB.push(...(await crossCheckAllGone(run, cp, chunk)));
      continue;
    }
    chunk.forEach((r, i) => settleListing(run, r, cp, res[i] ?? null, "fetch"));
  }
  return { stale, toPlanB };
}

async function planB(run: Run, cp: Checkpoint, rows: readonly OutcomeRow[]): Promise<void> {
  for (const r of rows) {
    const blocker = researchBlocker(run, r);
    if (blocker != null) settleError(run, r, cp, `no fetch answer and ${blocker}`, null);
    else if (!searchSlotFree(run)) run.summary.deferred++;
    else applyResearch(run, r, cp, await research(run, r));
  }
}

/** Settle rows whose window passed; return the rest. */
function withinWindow(run: Run, cp: Checkpoint, rows: readonly OutcomeRow[], windowMs: number): OutcomeRow[] {
  const live: OutcomeRow[] = [];
  for (const r of rows) {
    const ageMs = run.deps.nowMs - r.alerted_at;
    if (ageMs <= windowMs) {
      live.push(r);
      continue;
    }
    settleError(run, r, cp, `missed the ${cp === "2h" ? "2 h" : "24 h"} window (checker reached it at ${(ageMs / HOUR_MS).toFixed(1)} h)`, null);
    run.summary.missed++;
  }
  return live;
}

async function checkpoint2h(run: Run, rows: OutcomeRow[]): Promise<void> {
  const live = withinWindow(run, "2h", rows, TWO_H_WINDOW_MS);
  const noId = live.filter((r) => r.query_id == null);
  const { stale, toPlanB } = await planA(run, "2h", live.filter((r) => r.query_id != null));
  // plan B at 2 h only replaces a broken fetch method; an expired id or a missing one is an observation failure
  for (const r of [...noId, ...stale]) {
    if (run.summary.fetchMethod === "broken") toPlanB.push(r);
    else settleError(run, r, "2h", r.query_id == null ? "no search id recorded — the 2 h check needs one" : "search id no longer served at the 2 h check (re-search runs at 24 h only)", r.query_id == null ? null : "fetch");
  }
  await planB(run, "2h", toPlanB);
}

async function checkpoint24h(run: Run, rows: OutcomeRow[]): Promise<void> {
  const live = withinWindow(run, "24h", rows, DAY_WINDOW_MS);
  const noId = live.filter((r) => r.query_id == null);
  const { stale, toPlanB } = await planA(run, "24h", live.filter((r) => r.query_id != null));
  await planB(run, "24h", [...noId, ...stale, ...toPlanB]);
}

/** One checker run over every due row, within the run's fetch/search budget. */
export async function checkOutcomes(deps: OutcomeDeps): Promise<OutcomeRunSummary> {
  const run = newRun(deps, getFetchMethodState());
  const { due2h, due24h } = dueOutcomes(deps.nowMs, DUE_LIMIT);
  await checkpoint2h(run, due2h);
  await checkpoint24h(run, due24h);
  return run.summary;
}
