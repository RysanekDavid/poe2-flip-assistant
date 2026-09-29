import { clearQueryId, dueOutcomes, HOUR_MS, type OutcomeRow } from "../../db/snipeOutcomeQueries";
import type { Listing } from "../../api/tradeListing";
import type { Checkpoint } from "../../lib/snipeOutcomeContract";
import { classifyFailure, failAttempt, newRun, settle, settleListing, type OutcomeDeps, type OutcomeRunSummary, type Run } from "./settle";
import { applyResearch, research, researchBlocker } from "./research";

/**
 * Snipe outcome checker. Every alerted listing is re-checked ~2 h and ~24 h after its alert:
 *
 *   plan A (default) — /fetch the listing ids against the search that FOUND them (query_id,
 *     recorded at alert time), ≤10 ids per fetch, ≤maxFetches per run. A served entry = listed
 *     (+ its current ask), a null slot = gone.
 *   plan B (fallback, 24 h only) — when trade2 answers 400/404 for that search id (expired), or
 *     no id was stored: one fresh seller+base search per row, ≤maxSearches per run.
 *
 * Which plan produced each outcome is stored with it (check_*_method). Plan A is unverified for
 * days-old search ids (the probe never ran), so a 24 h fetch that reports a WHOLE chunk gone is
 * cross-checked with one re-search: if that finds a listing listed, the id is serving nulls, the
 * chunk's ids are dropped and those rows fall to plan B.
 */

/** A 2 h check run later than this is not a 2 h observation any more. */
export const TWO_H_WINDOW_MS = 4 * HOUR_MS;
/** Due rows read per run — far above what the fetch budget can settle. */
const DUE_LIMIT = 200;
const CHUNK = 10;

type ChunkResult = "done" | "stale" | "deferred";

/** Rows grouped by the search id they must quote, ≤10 per group, oldest first. */
export function chunkByQuery(rows: readonly OutcomeRow[]): Array<{ queryId: string; rows: OutcomeRow[] }> {
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

async function fetchChunk(run: Run, cp: Checkpoint, queryId: string, rows: OutcomeRow[]): Promise<ChunkResult | Array<Listing | null>> {
  if (run.busy || run.summary.fetches >= run.deps.maxFetches) {
    run.summary.deferred += rows.length;
    return "deferred";
  }
  run.summary.fetches++;
  try {
    return await run.deps.fetchStates(rows.map((r) => r.listing_id), queryId);
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

/**
 * A 24 h fetch said every row of the chunk is gone. Confirm on one re-searchable row: listed →
 * the search id serves nulls, so settle that row from the re-search, drop the chunk's id and hand
 * the rest to plan B (returned); gone or inconclusive → the fetch stands.
 */
async function crossCheckAllGone(run: Run, rows: OutcomeRow[]): Promise<OutcomeRow[]> {
  const probe = rows.find((r) => researchBlocker(run, r) == null);
  if (probe != null && (run.busy || run.summary.searches >= run.deps.maxSearches)) {
    run.summary.deferred += rows.length;
    return [];
  }
  const verdict = probe != null ? await research(run, probe) : null;
  if (verdict?.kind === "busy") {
    run.summary.deferred += rows.length;
    return [];
  }
  if (probe != null && verdict?.kind === "listed") {
    console.warn(`[snipe-outcomes] search ${probe.query_id ?? "?"} served null for listing ${probe.listing_id}, which a re-search found listed — its ids fall back to re-search`);
    applyResearch(run, probe, verdict);
    const rest = rows.filter((r) => r !== probe);
    clearQueryId(rest.map((r) => r.listing_id));
    run.summary.stale += rest.length;
    return rest;
  }
  for (const r of rows) settleListing(run, r, "24h", null, "fetch");
  return [];
}

/** Plan A for one checkpoint; returns the rows whose search id turned out stale. */
async function planA(run: Run, cp: Checkpoint, rows: OutcomeRow[]): Promise<OutcomeRow[]> {
  const stale: OutcomeRow[] = [];
  for (const { queryId, rows: chunk } of chunkByQuery(rows)) {
    const res = await fetchChunk(run, cp, queryId, chunk);
    if (res === "stale") stale.push(...chunk);
    if (typeof res === "string") continue;
    if (res.length !== chunk.length) throw new Error(`fetchStates answered ${res.length} states for ${chunk.length} ids`);
    if (cp === "24h" && res.every((s) => s == null)) {
      stale.push(...(await crossCheckAllGone(run, chunk)));
      continue;
    }
    chunk.forEach((r, i) => settleListing(run, r, cp, res[i] ?? null, "fetch"));
  }
  return stale;
}

async function checkpoint2h(run: Run, rows: OutcomeRow[]): Promise<void> {
  const live: OutcomeRow[] = [];
  for (const r of rows) {
    const lateH = (run.deps.nowMs - r.alerted_at) / HOUR_MS;
    if (run.deps.nowMs - r.alerted_at > TWO_H_WINDOW_MS) {
      settle(run, r, "2h", { state: "error", askDiv: null, method: null, error: `missed the 2 h window (checker reached it at ${lateH.toFixed(1)} h)` });
      run.summary.missed++;
    } else if (r.query_id == null) {
      settle(run, r, "2h", { state: "error", askDiv: null, method: null, error: "no search id recorded — the 2 h check needs one" });
    } else {
      live.push(r);
    }
  }
  const stale = await planA(run, "2h", live);
  // plan B is 24 h only: an expired id at 2 h is an observation failure, not a retryable one
  for (const r of stale) {
    settle(run, r, "2h", { state: "error", askDiv: null, method: "fetch", error: "search id no longer served at the 2 h check (re-search runs at 24 h only)" });
  }
}

async function planB(run: Run, rows: OutcomeRow[]): Promise<void> {
  for (const r of rows) {
    const blocker = researchBlocker(run, r);
    if (blocker != null) {
      settle(run, r, "24h", { state: "error", askDiv: null, method: null, error: blocker });
    } else if (run.busy || run.summary.searches >= run.deps.maxSearches) {
      run.summary.deferred++;
    } else {
      applyResearch(run, r, await research(run, r));
    }
  }
}

async function checkpoint24h(run: Run, rows: OutcomeRow[]): Promise<void> {
  const noId = rows.filter((r) => r.query_id == null);
  const stale = await planA(run, "24h", rows.filter((r) => r.query_id != null));
  await planB(run, [...noId, ...stale]);
}

/** One checker run over every due row, within the run's fetch/search budget. */
export async function checkOutcomes(deps: OutcomeDeps): Promise<OutcomeRunSummary> {
  const run = newRun(deps);
  const { due2h, due24h } = dueOutcomes(deps.nowMs, DUE_LIMIT);
  await checkpoint2h(run, due2h);
  await checkpoint24h(run, due24h);
  return run.summary;
}
