import type { Denom } from "../../core/treasury";
import type { Currency, ExchangeRates } from "../../core/priceEngine";
import { CURRENCY_ART } from "../../lib/currencyArt";
import type { FlipEdgeInfo } from "../FlipEdge";

/**
 * One flip row as /api/discover and /api/spreads return it (core/flipModel FlipRow, the fields the
 * UI reads). Both routes serialise the same scoreItem output, so a row clicked in Top Flips and one
 * clicked in the watchlist carry the same shape — the flip plan needs nothing else.
 */
export interface Candidate extends FlipEdgeInfo {
  itemId: string;
  item: string;
  category: string;
  icon: string | null;
  buyExalt: number;
  sellChaos: number;
  /** The trade legs: your Ange prices in REAL mode, the market legs otherwise. */
  buyDisp: Denom;
  sellDisp: Denom;
  /** Always the market legs, whatever the mode. */
  marketBuyDisp: Denom;
  marketSellDisp: Denom;
  mode: "REAL" | "RECO";
  marginPct: number;
  midDivine: number;
  volume: number;
  change7d: number | null;
  change24h: number | null;
  spark: number[] | null;
  profitChaos: number;
  profitDiv: number;
  throughputDivDay: number;
  oscScore: number;
  worthScore: number;
  /** REAL only: your observed mid vs ninja's (%); negative = live below ninja. */
  liveVsNinjaPct: number | null;
  risk: "PUMP" | "DECLINE" | null;
  stable: boolean;
}

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
