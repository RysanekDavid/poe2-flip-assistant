import type { TradeCred } from "../../api/tradeClient";
import type { Listing } from "../../api/tradeListing";
import type { TradeQuery } from "../../lib/tradeLink";
import type { CraftValueResponse } from "../../lib/tools/craftMovesContract";
import type { ParsedItem } from "../itemParser";
import type { ReferenceValue } from "../priceBook";
import type { ResolvedRates } from "../rates";
import type { PlanContext } from "../wealth/plan";

/**
 * Everything a price check reads, as injectable objects: the routes build them from the DB
 * (wiring.ts), the tests hand in fakes. `trade` holds the only calls that spend trade2 budget —
 * the base check receives them too and must never touch them (a test spies on that).
 */

/** A rare's comparable plan: the relaxed query the live search runs (also the 0-budget trade link). */
export interface RarePlan {
  query: TradeQuery;
  signature: string;
  resolvedMods: number;
}

export interface MarketAges {
  ninjaAgeMin: number | null;
  cxAgeMin: number | null;
  scoutAgeMin: number | null;
}

export interface TradeServices {
  /** One search + one fetch through the web limiter, the craft-moves live value. */
  liveRare(text: string, league: string, cred: TradeCred): Promise<CraftValueResponse>;
  /** One search + one fetch of the cheapest `limit` listings. */
  searchComparables(q: TradeQuery, limit: number, cred: TradeCred): Promise<{ total: number; listings: Listing[]; searchUrl: string }>;
}

/** What the live value needs: enough to classify the paste, gate it and price the comparables. */
export interface LiveServices {
  /** The caller's league: every market read is in it. */
  league: string;
  /** The app default league: the only one trade2 live values search and poe2scout is read for. */
  defaultLeague: string;
  rates: ResolvedRates;
  /** Is this name a poe.ninja exchange line in the caller's league? */
  isExchangeItem(name: string): boolean;
  trade: TradeServices;
}

export interface PriceCheckServices extends LiveServices {
  /** Whether the caller has a usable POESESSID (checked before the live button is offered). */
  hasCred: boolean;
  ages: MarketAges;
  /** Plan context for these lowercased names (ninja + exchange + poe2scout values + competition). */
  planContext(nameKeys: readonly string[]): Promise<{ ctx: PlanContext; warnings: string[] }>;
  /** Comparable plan for a rare (reads the cached trade2 stat catalog — not a search). */
  rarePlan(parsed: ParsedItem): Promise<RarePlan>;
  /** Price-book reference for a rare's roll signature. */
  bookReference(signature: string): ReferenceValue;
}
