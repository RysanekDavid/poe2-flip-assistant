import type { ListingCompetition, TradeListingQuote } from "../../lib/wealthContract";
import type { Currency, ExchangeRates } from "../priceEngine";
import { denominate, type Denom } from "../treasury";

/**
 * Selling through a trade2 listing (stash-tab price note). Pure.
 *
 * The multipliers are HEURISTICS, not observed fills: v1 spends no trade2 searches, so there is no
 * live order book to anchor on. Quick undercuts the market value enough to sit at the front of the
 * listings; patient asks the premium a buyer who wants it now tends to pay.
 */
export const TRADE_QUICK_MULT = 0.9;
export const TRADE_PATIENT_MULT = 1.1;

/** More live listings than this for one unique means you are competing on price, not presence. */
export const CROWDED_LISTINGS = 30;
/** poe2scout's sell-through proxy below this reads as a slow market. */
export const SLOW_SELL_THROUGH = 0.05;

/** The trade site's currency ids, which the stash note must use. */
const NOTE_CURRENCY: Readonly<Record<Currency, string>> = { DIVINE: "divine", EXALT: "exalted", CHAOS: "chaos" };

/** A note price the game accepts and a buyer reads at a glance: whole orbs, 0.1 Div under 10 Div. */
export function noteAmount(d: Denom): number {
  if (d.unit === "DIVINE" && d.amount < 10) return Math.max(0.1, Math.round(d.amount * 10) / 10);
  return Math.max(1, Math.round(d.amount));
}

/**
 * `~price N divine` for one unit worth `unitDiv`. A stash note on a stack prices ONE unit (Maxroll
 * bulk-selling guide; PoE2 forum thread 3688218), so the same note serves a stack of any size.
 */
export function stashNote(unitDiv: number, rates: ExchangeRates): { note: string; denom: Denom } {
  const raw = denominate(unitDiv, rates);
  const denom: Denom = { amount: noteAmount(raw), unit: raw.unit };
  return { note: `~price ${denom.amount} ${NOTE_CURRENCY[denom.unit]}`, denom };
}

function competitionNote(c: ListingCompetition | null): string | null {
  if (c == null) return null;
  const parts: string[] = [];
  if (c.listed > CROWDED_LISTINGS) parts.push(`${c.listed} listed — price to the front, expect to undercut`);
  if (c.samples > 0 && c.sellThrough < SLOW_SELL_THROUGH) parts.push("slow sell-through — patient price may sit for days");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Listing prices for one unit worth `valueDiv`. `qty` is only validated: every figure and the note
 * are per unit, which is how a stash note on a stack is read. `competition` is poe2scout's
 * live-listing count for a unique; null when there is none.
 */
export function tradeListingQuote(
  valueDiv: number,
  qty: number,
  competition: ListingCompetition | null,
  rates: ExchangeRates,
): TradeListingQuote {
  if (!(valueDiv > 0)) throw new Error(`tradeListingQuote needs a positive value, got ${valueDiv}`);
  if (!(qty >= 1)) throw new Error(`tradeListingQuote needs qty ≥ 1, got ${qty}`);
  const { note, denom } = stashNote(valueDiv, rates);
  return {
    quickDiv: valueDiv * TRADE_QUICK_MULT,
    fairDiv: valueDiv,
    patientDiv: valueDiv * TRADE_PATIENT_MULT,
    note,
    noteDenom: denom,
    competition,
    competitionNote: competitionNote(competition),
  };
}
