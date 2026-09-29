import type { TradeCred } from "../../api/tradeClient";
import type { PriceCheckLiveResponse } from "../../lib/priceCheckContract";
import { tradeSearchUrl } from "../../lib/tradeLink";
import type { ParsedItem } from "../itemParser";
import { hintFromValue } from "./hint";
import type { LiveServices, PriceCheckServices, RarePlan } from "./services";
import type { PricedFields } from "./stackable";
import { NO_LIVE_COMPARABLES } from "./unique";

/**
 * Rares: the price-book reference for the item's roll signature at once (no search budget — the
 * stat catalog it needs is the cached /data/stats read), and on click the craft-moves live value
 * (one search + one fetch of relaxed comparables).
 */

export interface RareFields extends PricedFields {
  resolvedMods: number | null;
  bookError: string | null;
}

async function readPlan(parsed: ParsedItem, s: PriceCheckServices): Promise<{ plan: RarePlan | null; bookError: string | null }> {
  try {
    return { plan: await s.rarePlan(parsed), bookError: null };
  } catch (e: unknown) {
    // the stat catalog read failed: the paste still gets a trade link and a live button, and the
    // failure is shown beside them rather than failing the whole check
    const bookError = e instanceof Error ? e.message : String(e);
    console.error(`[pricecheck] rare comparable plan failed: ${bookError}`);
    return { plan: null, bookError };
  }
}

export async function priceRare(parsed: ParsedItem, s: PriceCheckServices): Promise<RareFields> {
  const { plan, bookError } = await readPlan(parsed, s);
  // the book only holds clean rares — a corrupted or mirrored one would read another item's price
  const inBook = !parsed.corrupted && !parsed.mirrored;
  const ref = plan != null && inBook ? s.bookReference(plan.signature) : null;
  const unitDiv = ref?.valueDiv ?? null;
  const warnings = inBook ? [] : [`${parsed.corrupted ? "corrupted" : "mirrored"} items are not in the price book — value it live`];
  return {
    name: parsed.name,
    baseType: parsed.baseType,
    icon: null,
    qty: 1,
    unitDiv,
    totalDiv: unitDiv,
    confidence: { source: unitDiv == null ? null : "book", samples: ref?.samples ?? null, ageMin: null },
    hint: hintFromValue(unitDiv, s.rates.rates, "price-book reference", "no price-book reference — value it live (1 search) or open the trade link"),
    tradeUrl: tradeSearchUrl(s.league, plan?.query ?? { type: parsed.baseType, rarity: "rare" }),
    warnings,
    resolvedMods: plan?.resolvedMods ?? null,
    bookError,
  };
}

export async function liveRare(text: string, s: LiveServices, cred: TradeCred): Promise<PriceCheckLiveResponse> {
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
    hint: hintFromValue(v.valueDiv, s.rates.rates, "live comparables", NO_LIVE_COMPARABLES),
  };
}
