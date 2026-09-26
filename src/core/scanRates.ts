import { resolveRates } from "./rates";
import { getDefaultLeague } from "./leagueState";
import type { DivRates } from "./listingPrice";

/**
 * Exchange rates for the shared trade2 scanners (hunts, autosnipe). They used to `await
 * fetchScout()` first, so a poe2scout outage killed every hunt. resolveRates walks the
 * cx → ninja → scout ladder from our own DB instead; only when ALL are stale do we fail — loudly.
 */
export function scanRates(league: string = getDefaultLeague()): DivRates {
  const resolved = resolveRates(league);
  if (!resolved) throw new Error(`no fresh exchange rates for "${league}" (cx, ninja and scout all stale/missing)`);
  return resolved.rates;
}
