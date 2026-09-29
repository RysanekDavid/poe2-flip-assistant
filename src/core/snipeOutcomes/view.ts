import type { OutcomeRow } from "../../db/snipeOutcomeQueries";
import type { OutcomeCheck, OutcomeMethod, OutcomeState, SnipeOutcomeView, SnipeOutcomesResponse } from "../../lib/snipeOutcomeContract";
import { isPending, outcomeStats } from "./stats";

function checkOf(state: OutcomeState | null, at: number | null, askDiv: number | null, method: OutcomeMethod | null): OutcomeCheck | null {
  if (state == null) return null;
  if (at == null) throw new Error(`outcome check "${state}" has no timestamp`);
  // askDiv is only ever written from ratedDiv (> 0 or null); the response schema rejects anything else
  return { state, at, askDiv, method };
}

export function outcomeView(r: OutcomeRow): SnipeOutcomeView {
  return {
    listingId: r.listing_id,
    profile: r.profile,
    alertedAt: r.alerted_at,
    check2h: checkOf(r.check_2h, r.check_2h_at, r.check_2h_ask_div, r.check_2h_method),
    check24h: checkOf(r.check_24h, r.check_24h_at, r.check_24h_ask_div, r.check_24h_method),
    lastError: r.last_error,
  };
}

/**
 * The route body: every row's view (cards may show another league's alert), stats and the
 * pending count for `league` only — the scanner's league, where the hit rates mean something.
 */
export function buildOutcomesResponse(
  rows: readonly OutcomeRow[],
  opts: { league: string; windowDays: number; labels: ReadonlyMap<string, string> },
): SnipeOutcomesResponse {
  const byListing: Record<string, SnipeOutcomeView> = {};
  for (const r of rows) byListing[r.listing_id] = outcomeView(r);
  const inLeague = rows.filter((r) => r.league === opts.league);
  return {
    league: opts.league,
    windowDays: opts.windowDays,
    byListing,
    profiles: outcomeStats(inLeague, opts.labels),
    pending: inLeague.filter(isPending).length,
  };
}
