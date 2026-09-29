import { recheckQueryOf, type OutcomeRow } from "../../db/snipeOutcomeQueries";
import type { Listing } from "../../api/tradeListing";
import type { SearchResp } from "../../api/tradeClient";
import type { Checkpoint } from "../../lib/snipeOutcomeContract";
import { classifyFailure, errText, failAttempt, settle, settleError, settleListing, type Run } from "./settle";

/**
 * Plan B — ONE fresh search for the seller's copies of the base (listingTradeQuery, stored at
 * alert time) tells whether a listing is still up. Used when the search that found it is no
 * longer served, for every row once the fetch method is broken, and to cross-check the fetch
 * method itself. Capped per run: searches are the scarce trade2 resource.
 */
type Research =
  | { kind: "listed"; listing: Listing | null } // null = found, but its ask could not be read
  | { kind: "gone" }
  | { kind: "unusable"; reason: string } // the re-search cannot answer for this row
  | { kind: "failed"; message: string } // this attempt failed (network, 5xx): says nothing
  | { kind: "busy" };

/** Why this row cannot be re-searched at all, or null when it can. */
export function researchBlocker(run: Run, row: OutcomeRow): string | null {
  if (row.recheck_query == null) return "the seller is unknown — cannot re-search";
  if (row.league !== run.deps.defaultLeague) return `the league changed (${row.league} → ${run.deps.defaultLeague}) — cannot re-search`;
  return null;
}

/** Read the ask of a listing the re-search found. The search already proved it listed, so a failed read only costs the ask. */
async function readAsk(run: Run, row: OutcomeRow, queryId: string): Promise<Research> {
  if (run.summary.fetches >= run.deps.maxFetches) return { kind: "listed", listing: null };
  run.summary.fetches++;
  try {
    const [state] = await run.deps.fetchStates([row.listing_id], queryId);
    return state == null ? { kind: "gone" } : { kind: "listed", listing: state };
  } catch (e) {
    const f = classifyFailure(e);
    if (f.kind === "abort") throw f.error;
    if (f.kind === "busy") run.busy = true;
    console.warn(`[snipe-outcomes] ${row.listing_id}: re-search found it listed, reading the ask failed — ${errText(e)}`);
    return { kind: "listed", listing: null };
  }
}

/** One re-search for one row. The caller checked researchBlocker and the search budget. */
export async function research(run: Run, row: OutcomeRow): Promise<Research> {
  const q = recheckQueryOf(row);
  if (q == null) return { kind: "unusable", reason: "no re-search query stored" };
  run.summary.searches++;
  let resp: SearchResp;
  try {
    resp = await run.deps.search(q);
  } catch (e) {
    const f = classifyFailure(e);
    if (f.kind === "abort") throw f.error;
    if (f.kind === "busy") {
      run.busy = true;
      return { kind: "busy" };
    }
    return { kind: "failed", message: `re-search: ${errText(e)}` };
  }
  const ids = resp.result ?? [];
  if (ids.includes(row.listing_id)) return readAsk(run, row, resp.id);
  // absent from a truncated page proves nothing: the seller has more copies than one page shows
  if ((resp.total ?? ids.length) > ids.length) {
    return { kind: "unusable", reason: `re-search matched ${resp.total} listings, more than one page — absence proves nothing` };
  }
  return { kind: "gone" };
}

/** Settle a checkpoint from a plan-B re-search result. */
export function applyResearch(run: Run, row: OutcomeRow, cp: Checkpoint, r: Research): void {
  switch (r.kind) {
    case "listed":
      if (r.listing == null) settle(run, row, cp, { state: "listed", ask: null, method: "search", error: null });
      else settleListing(run, row, cp, r.listing, "search");
      return;
    case "gone":
      settleListing(run, row, cp, null, "search");
      return;
    case "unusable":
      settleError(run, row, cp, r.reason, "search");
      return;
    case "failed":
      failAttempt(run, row, cp, r.message, "search");
      return;
    case "busy":
      run.summary.deferred++;
      return;
  }
}
