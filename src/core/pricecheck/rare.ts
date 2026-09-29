import type { TradeCred } from "../../api/tradeClient";
import type { PriceCheckLiveResponse } from "../../lib/priceCheckContract";
import { tradeSearchUrl } from "../../lib/tradeLink";
import type { ParsedItem } from "../itemParser";
import { hintFromValue } from "./hint";
import type { PriceCheckServices, RareBook } from "./services";
import type { PricedFields } from "./stackable";

/**
 * Rares: the price-book reference for the item's roll signature at once (no search budget — the
 * stat catalog it needs is the cached /data/stats read), and on click the craft-moves live value
 * (one search + one fetch of relaxed comparables).
 */

export interface RareFields extends PricedFields {
  resolvedMods: number | null;
  bookError: string | null;
}

async function readBook(parsed: ParsedItem, s: PriceCheckServices): Promise<{ book: RareBook | null; bookError: string | null }> {
  try {
    return { book: await s.rareBook(parsed), bookError: null };
  } catch (e: unknown) {
    // the stat catalog read failed: the paste still gets a trade link and a live button, and the
    // failure is shown beside them rather than failing the whole check
    const bookError = e instanceof Error ? e.message : String(e);
    console.error(`[pricecheck] book reference failed: ${bookError}`);
    return { book: null, bookError };
  }
}

export async function priceRare(parsed: ParsedItem, s: PriceCheckServices): Promise<RareFields> {
  // the book only holds clean rares — a corrupted or mirrored one would read another item's price
  const inBook = !parsed.corrupted && !parsed.mirrored;
  const { book, bookError } = inBook ? await readBook(parsed, s) : { book: null, bookError: null };
  const unitDiv = book?.ref.valueDiv ?? null;
  const warnings = inBook ? [] : [`${parsed.corrupted ? "corrupted" : "mirrored"} items are not in the price book — value it live`];
  return {
    name: parsed.name,
    baseType: parsed.baseType,
    icon: null,
    qty: 1,
    unitDiv,
    totalDiv: unitDiv,
    confidence: { source: unitDiv == null ? null : "book", samples: book?.ref.samples ?? null, ageMin: null },
    hint: hintFromValue(unitDiv, s.rates.rates, "price-book reference"),
    tradeUrl: tradeSearchUrl(s.league, book?.query ?? { type: parsed.baseType, rarity: "rare" }),
    warnings,
    resolvedMods: book?.resolvedMods ?? null,
    bookError,
  };
}

export async function liveRare(text: string, s: PriceCheckServices, cred: TradeCred): Promise<PriceCheckLiveResponse> {
  const v = await s.trade.liveRare(text, s.defaultLeague, cred);
  return {
    kind: "rare",
    valueDiv: v.valueDiv,
    minDiv: v.minDiv,
    samples: v.samples,
    total: v.total,
    dropped: v.dropped,
    unrated: v.unrated,
    searchUrl: v.searchUrl,
    method: `${v.searchedStats} stats searched · median of the cheapest comparables, bait asks trimmed`,
    hint: hintFromValue(v.valueDiv, s.rates.rates, "live comparables"),
  };
}
