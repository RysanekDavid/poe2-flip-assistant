import type { OutcomeRow } from "../../db/snipeOutcomeQueries";
import type { FetchMethodState, OutcomeCheck, OutcomeMethod, OutcomeState, SnipeOutcomeView, SnipeOutcomesResponse } from "../../lib/snipeOutcomeContract";
import { isPending, outcomeStats } from "./stats";

function checkOf(state: OutcomeState | null, at: number | null, amount: number | null, currency: string | null, method: OutcomeMethod | null): OutcomeCheck | null {
  if (state == null) return null;
  if (at == null) throw new Error(`outcome check "${state}" has no timestamp`);
  if ((amount == null) !== (currency == null)) throw new Error(`outcome check "${state}" has a half-stored ask`);
  return { state, at, ask: amount != null && currency != null ? { amount, currency } : null, method };
}

function outcomeView(r: OutcomeRow): SnipeOutcomeView {
  return {
    listingId: r.listing_id,
    profile: r.profile,
    alertedAt: r.alerted_at,
    check2h: checkOf(r.check_2h, r.check_2h_at, r.check_2h_ask_amount, r.check_2h_ask_currency, r.check_2h_method),
    check24h: checkOf(r.check_24h, r.check_24h_at, r.check_24h_ask_amount, r.check_24h_ask_currency, r.check_24h_method),
    lastError: r.last_error,
  };
}

/**
 * The route body: every row's view (cards may show another league's alert), stats and the
 * pending count for `league` only — the scanner's league, where the hit rates mean something.
 * While the fetch method is broken the stats still go out; the UI hides the percentages.
 */
export function buildOutcomesResponse(
  rows: readonly OutcomeRow[],
  opts: { league: string; windowDays: number; labels: ReadonlyMap<string, string>; fetchMethod: FetchMethodState },
): SnipeOutcomesResponse {
  const byListing: Record<string, SnipeOutcomeView> = {};
  for (const r of rows) byListing[r.listing_id] = outcomeView(r);
  const inLeague = rows.filter((r) => r.league === opts.league);
  return {
    league: opts.league,
    windowDays: opts.windowDays,
    fetchMethod: opts.fetchMethod,
    byListing,
    profiles: outcomeStats(inLeague, opts.labels),
    pending: inLeague.filter(isPending).length,
  };
}
