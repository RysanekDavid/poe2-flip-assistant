import type { ScannedRare } from "../../api/accountScan";
import type { TradeCred } from "../../api/tradeClient";
import { TradeAuthError, TradeRateLimitedError } from "../../api/tradeErrors";
import type { Listing } from "../../api/tradeListing";
import { newMeter, metered, type TradeMeter } from "../../api/tradeMeter";
import type { BalanceItemRow } from "../../db/balanceItemQueries";
import type { TradeQuery } from "../../lib/tradeLink";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import { listingToItem, planValuation, valueFromComparables } from "../comparableValuation";
import { amountInDivine, type DivRates } from "../listingPrice";
import type { CompWrite } from "../../db/listingCompsQueries";

/**
 * "Your listings that won't sell": for the user's own pricier, older listings, one trade2 search
 * of cheapest buyable comparables each → fair value + cheapest competitor. Runs ONLY in the poller
 * (queued by POST /api/wealth/reprice), under the user's own cookie, inside metered().
 *
 * Budget (plan §C): ≤ REPRICE_MAX_SEARCHES searches + one 10-id fetch per search, per user per 6h
 * cooldown — at most 8 + 8 requests, i.e. ≤ 4/h across 3 users. No pseudo-only fallback search:
 * a second search per row would double the budget for the rare that needs it.
 */
export const REPRICE_MAX_SEARCHES = 8;
export const REPRICE_MIN_ASK_DIV = 1;
export const REPRICE_MIN_LISTED_MS = 24 * 60 * 60 * 1000;
/** Comparables fetched per search — exactly one 10-id fetch page. */
export const REPRICE_COMPARABLES = 10;

export interface RepriceCandidate {
  listingId: string;
  itemName: string;
  baseType: string;
  kind: "unique" | "rare";
  unitAskDiv: number;
  rare: ScannedRare | null;
}

function candidateOf(r: BalanceItemRow, rates: DivRates, nowMs: number): RepriceCandidate | null {
  if (r.listing_id == null || r.indexed_at == null) return null;
  if (nowMs - parseSqliteTimestamp(r.indexed_at) < REPRICE_MIN_LISTED_MS) return null;
  const ask = r.ask_amount == null || r.ask_currency == null ? null : amountInDivine(r.ask_amount, r.ask_currency, rates);
  if (ask == null || ask < REPRICE_MIN_ASK_DIV) return null;
  const rarity = (r.rarity ?? "").toLowerCase();
  const base = { listingId: r.listing_id, itemName: r.item_name, baseType: r.base_type ?? "", unitAskDiv: ask };
  if (rarity === "unique") return { ...base, kind: "unique", rare: null };
  // a rare without stored rolls (read before rolls were captured) has nothing to compare on
  if (rarity === "rare" && r.item_json != null) return { ...base, kind: "rare", rare: r.item_json };
  return null;
}

/** The listings worth a search: own, priced ≥ 1 Div per unit, listed > 24h; priciest first. Pure. */
export function pickRepriceCandidates(items: readonly BalanceItemRow[], rates: DivRates, nowMs: number): RepriceCandidate[] {
  return items
    .map((r) => candidateOf(r, rates, nowMs))
    .filter((c): c is RepriceCandidate => c != null)
    .sort((a, b) => b.unitAskDiv - a.unitAskDiv)
    .slice(0, REPRICE_MAX_SEARCHES);
}

/** A stored rare as the Listing shape comparableValuation plans from. */
function rareListing(c: RepriceCandidate, rare: ScannedRare): Listing {
  return {
    listingId: c.listingId, price: null, account: "", online: false, instantBuyout: false, indexed: null, whisper: null,
    itemName: c.itemName, baseType: c.baseType, rarity: "Rare", itemLevel: rare.itemLevel, corrupted: rare.corrupted,
    desecrated: rare.modLines.some((m) => m.desecrated), mirrored: rare.mirrored, icon: null, stackSize: 0,
    mods: rare.modLines.map((m) => m.text), modLines: rare.modLines, unreadableMods: 0, stash: null,
  };
}

export async function repriceQuery(c: RepriceCandidate): Promise<TradeQuery> {
  if (c.kind === "unique") return { name: c.itemName, type: c.baseType || undefined, rarity: "unique", instantBuyout: true };
  if (c.rare == null) throw new Error(`reprice: rare ${c.itemName} has no stored rolls`);
  return (await planValuation(listingToItem(rareListing(c, c.rare)))).query;
}

export interface RepriceDeps {
  search: (q: TradeQuery, cred: TradeCred) => Promise<{ total: number; listings: Listing[]; searchUrl: string }>;
  queryFor: (c: RepriceCandidate) => Promise<TradeQuery>;
  writeComp: (c: CompWrite) => void;
}

export interface RepriceResult {
  checked: number;
  meter: TradeMeter;
  errors: string[];
  /** Why the run stopped early (cookie rejected, shared budget busy); null when it ran through. */
  fatal: string | null;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Your own listings are not competition: drop them by id and by seller account. */
function othersOnly(listings: readonly Listing[], c: RepriceCandidate, account: string): Listing[] {
  const me = account.toLowerCase();
  return listings.filter((l) => l.listingId !== c.listingId && (me === "" || l.account.toLowerCase() !== me));
}

async function checkOne(c: RepriceCandidate, cred: TradeCred, rates: DivRates, deps: RepriceDeps): Promise<void> {
  const res = await deps.search(await deps.queryFor(c), cred);
  const v = valueFromComparables(othersOnly(res.listings, c, cred.account ?? ""), res.total, rates, c.listingId);
  deps.writeComp({
    listingId: c.listingId, itemName: c.itemName, fairDiv: v.valueDiv, cheapestDiv: v.minDiv, samples: v.samples, searchUrl: res.searchUrl,
  });
}

/**
 * Check each candidate within the search budget. A 403 (cookie dead) or a busy shared budget ends
 * the run — every further search would fail the same way; any other per-row failure is recorded
 * and the next row is tried.
 */
export async function runRepriceScan(
  candidates: readonly RepriceCandidate[],
  cred: TradeCred,
  rates: DivRates,
  deps: RepriceDeps,
): Promise<RepriceResult> {
  const meter = newMeter();
  const errors: string[] = [];
  let checked = 0;
  let fatal: string | null = null;
  await metered(meter, async () => {
    for (const c of candidates) {
      if (meter.search >= REPRICE_MAX_SEARCHES) break;
      try {
        await checkOne(c, cred, rates, deps);
        checked++;
      } catch (e: unknown) {
        if (e instanceof TradeAuthError || e instanceof TradeRateLimitedError) {
          fatal = errText(e);
          break;
        }
        errors.push(`${c.itemName}: ${errText(e)}`);
      }
    }
  });
  return { checked, meter, errors, fatal };
}
