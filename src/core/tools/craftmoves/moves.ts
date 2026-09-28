import { searchListingsLinked, type TradeCred } from "../../../api/tradeClient";
import { getMaterialPrices } from "../../../db/craftQueries";
import { planValuation, valueFromComparables } from "../../comparableValuation";
import { parseItem, type ParsedItem } from "../../itemParser";
import { bookReference } from "../../priceBookFeed";
import { resolveRates, type ResolvedRates } from "../../rates";
import {
  RULES_PATCH,
  RULES_REVERIFY_AFTER,
  type CraftMovesResponse,
  type CraftValueResponse,
} from "../../../lib/tools/craftMovesContract";
import { loadCraftCatalog, type CraftCatalog } from "./catalog";
import { classifyItem, type ItemState } from "./classify";
import { readItemMeta } from "./itemMeta";
import { evaluateRules } from "./rules";
import { tierGates } from "./gates";
import { ninjaIdsOf, priceMoves, type SnapshotPrice } from "./cost";

/**
 * Paste → next craft moves. Zero trade2 SEARCH budget: classification, rules and gates are local;
 * costs come from ninja snapshots; the value is the price-book reference (the trade2 stat catalog
 * it needs is the cached /data/stats read, not a search). The live comparable value is a separate,
 * explicit call (liveValue) that spends exactly one search + one fetch.
 */

/** Third-party odds estimators. Plain links: neither documents a prefill URL format we could verify. */
export const ODDS_LINKS = [
  { label: "Craft of Exile (PoE2) — odds: third-party estimate", url: "https://www.craftofexile.com/?game=poe2" },
  { label: "POE2_HTC — odds: third-party estimate", url: "https://github.com/Dboire9/POE2_HTC" },
] as const;

export class NotAnItemError extends Error {
  constructor() {
    super("that text is not a PoE2 item — copy it in game with Ctrl+C (Ctrl+Alt+C for affix headers)");
    this.name = "NotAnItemError";
  }
}

type BookValue = NonNullable<CraftMovesResponse["bookValue"]>;

/** Everything except the price book: pure given its inputs, so the tests drive it without a DB. */
export function assembleMoves(
  state: ItemState,
  cat: CraftCatalog,
  prices: ReadonlyMap<string, SnapshotPrice>,
  rates: ResolvedRates | null,
): Omit<CraftMovesResponse, "league" | "bookValue" | "bookError"> {
  const ev = evaluateRules(state);
  return {
    state,
    locked: ev.locked,
    moves: priceMoves(ev.moves, prices, rates?.rates ?? null),
    blocked: ev.blocked,
    gates: tierGates(state, cat),
    patch: { rules: RULES_PATCH, data: cat.gameDataPatch, repoe: cat.repoeVersion, reverifyAfter: RULES_REVERIFY_AFTER },
    rates: { exaltPerDivine: rates?.rates.exaltPerDivine ?? null, source: rates?.source ?? null },
    odds: ODDS_LINKS.map((l) => ({ ...l })),
  };
}

/** Price-book reference for a rare (the book only holds rare signatures); null for anything else. */
async function bookValueOf(parsed: ParsedItem, state: ItemState, league: string): Promise<BookValue | null> {
  if (state.rarity !== "Rare" || state.corrupted || state.mirrored || state.unidentified) return null;
  const plan = await planValuation(parsed);
  const ref = bookReference(league, plan.signature, null);
  return { valueDiv: ref.valueDiv, minDiv: ref.minDiv, samples: ref.samples, resolvedMods: plan.resolvedCount };
}

function parseOrThrow(text: string): ParsedItem {
  const parsed = parseItem(text);
  if (!parsed) throw new NotAnItemError();
  return parsed;
}

/** Classify, list legal moves with live material costs, tier gates and the book value. */
export async function nextMoves(text: string, league: string): Promise<CraftMovesResponse> {
  const cat = loadCraftCatalog();
  const parsed = parseOrThrow(text);
  const state = classifyItem(parsed, readItemMeta(text), cat);
  const ev = evaluateRules(state);
  const prices = getMaterialPrices(league, ninjaIdsOf(ev.moves));
  const rates = resolveRates(league);
  // the book value needs the (cached) trade2 stat catalog; when that read fails the moves still
  // stand on their own, so the failure is returned beside them instead of failing the request
  let bookValue: BookValue | null = null;
  let bookError: string | null = null;
  try {
    bookValue = await bookValueOf(parsed, state, league);
  } catch (e: unknown) {
    bookError = e instanceof Error ? e.message : String(e);
    console.error(`[craft-moves] book value failed: ${bookError}`);
  }
  return { league, ...assembleMoves(state, cat, prices, rates), bookValue, bookError };
}

export class RatesUnavailableError extends Error {
  constructor(league: string) {
    super(`no exchange rates for ${league} yet — comparables priced in exalts/chaos cannot be converted`);
    this.name = "RatesUnavailableError";
  }
}

/** trade2 fetches 10 listings per call — capping here keeps the live value at 1 search + 1 fetch. */
const LIVE_COMPARABLES = 10;

/** The live comparable value: exactly one trade2 search + one fetch, through the web limiter. */
export async function liveValue(text: string, league: string, cred: TradeCred): Promise<CraftValueResponse> {
  const parsed = parseOrThrow(text);
  const rates = resolveRates(league);
  if (!rates) throw new RatesUnavailableError(league); // checked first: never spend a search we can't price
  const plan = await planValuation(parsed);
  const res = await searchListingsLinked(plan.query, LIVE_COMPARABLES, cred);
  const v = valueFromComparables(res.listings, res.total, rates.rates);
  return {
    valueDiv: v.valueDiv,
    minDiv: v.minDiv,
    samples: v.samples,
    dropped: v.dropped,
    unrated: v.unrated,
    total: v.total,
    searchUrl: res.searchUrl,
    searchedStats: plan.searchStats.length,
  };
}
