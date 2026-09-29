import type { Currency, ExchangeRates } from "../../core/priceEngine";
import { CURRENCY_ART } from "../../lib/currencyArt";
import type { Candidate } from "../../lib/discoverContract";

/**
 * One flip row as /api/discover (and /api/spreads, same scoreItem output) returns it — inferred
 * from the discover contract. A row clicked in Top Flips and one clicked in the watchlist carry
 * the same shape, so the flip plan needs nothing else.
 */
export type { Candidate };

/** What opening a flip plan needs: the clicked row plus the rates its table was priced with. */
export interface FlipSelection {
  row: Candidate;
  rates: ExchangeRates | null;
}

export const CCY_SHORT: Record<Currency, string> = { DIVINE: "Div", EXALT: "Ex", CHAOS: "Ch" };

export const CCY_ART: Record<Currency, string> = {
  DIVINE: CURRENCY_ART.div,
  EXALT: CURRENCY_ART.ex,
  CHAOS: CURRENCY_ART.chaos,
};

/** Ninja quotes in Divine — shown the way ninja does, so numbers reconcile at a glance. */
export function fmtMid(div: number): string {
  return Math.abs(div) >= 10 ? Math.round(div).toLocaleString("en-US") : div.toFixed(2);
}
