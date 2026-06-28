import { searchListings, type TradeCred } from "../api/tradeClient";
import { fetchScout, type ScoutRates } from "../api/scoutClient";
import { config } from "../config/env";
import { fireAlert } from "./alertEngine";
import { credForUser } from "../auth/credForUser";
import { listUsers } from "../db/userQueries";
import {
  getHunts,
  touchHuntScan,
  recentHitSig,
  recentHitByListing,
  insertHit,
  recordObservation,
  observedPrices,
  type Hunt,
} from "../db/queries";
import { modSignature, summarizePrices, snipeVerdict } from "./priceBook";
import type { TradeQuery, StatFilter, Rarity } from "../lib/tradeLink";

/** Convert a listing price to Divine, or NaN for currencies we don't rate. */
export function toDivine(amount: number, ccy: string, r: ScoutRates): number {
  if (ccy === "divine") return amount;
  if (ccy === "exalted" || ccy === "exalt") return amount / r.exaltPerDivine;
  if (ccy === "chaos") return amount / r.chaosPerDivine;
  return NaN;
}

export function huntToQuery(h: Hunt): TradeQuery {
  const stats: StatFilter[] | undefined = h.stats_json ? (JSON.parse(h.stats_json) as StatFilter[]) : undefined;
  return {
    name: h.item_name ?? undefined,
    type: h.base_type ?? undefined,
    rarity: (h.rarity as Rarity | null) ?? undefined,
    stats,
    maxPrice:
      h.max_amount && h.max_ccy
        ? { amount: h.max_amount, currency: h.max_ccy as "divine" | "exalted" | "chaos" }
        : undefined,
    online: true,
  };
}

export interface ScanSummary {
  scanned: number;
  hits: number;
  errors: Array<{ hunt: string; error: string }>;
}

/** Scan one hunt: fetch cheapest live listings (already ≤ trigger via the query's
 *  max-price filter), record any new ones, and desktop-alert genuine new hits. */
async function scanHunt(h: Hunt, rates: ScoutRates, cred: TradeCred): Promise<number> {
  const { listings } = await searchListings(huntToQuery(h), config.hunt.perScan, "asc", cred);
  let newHits = 0;

  for (const l of listings) {
    if (!l.price) continue;
    const priceDiv = toDivine(l.price.amount, l.price.currency, rates);

    // feed the price book, then snipe-check this listing against the accumulated distribution
    if (Number.isFinite(priceDiv) && l.baseType) {
      const sig = modSignature(l.baseType, l.mods);
      recordObservation(sig, l.baseType, priceDiv, l.listingId);
      const verdict = snipeVerdict(sig, priceDiv, summarizePrices(observedPrices(sig)));
      if (verdict.isSnipe) {
        // fireAlert de-dupes by itemId+type within the cooldown, so the same listing won't re-ping
        fireAlert(h.user_id, {
          type: "SNIPE",
          itemId: l.listingId || `snipe-${sig}`,
          itemName: l.itemName,
          message: `${verdict.discountPct?.toFixed(0)}% under market — ${priceDiv.toFixed(0)} vs ~${verdict.valueDiv?.toFixed(0)} Div (${verdict.samples} samples)`,
          value: verdict.discountPct ?? 0,
          threshold: config.snipe.discountPct,
          whisper: l.whisper, // paste in-game to whisper the seller
        });
      }
    }

    const sig = `${h.id}|${l.account}|${l.price.amount}|${l.price.currency}`;
    if (recentHitByListing(h.user_id, l.listingId) || recentHitSig(h.user_id, sig, config.alertCooldownMin)) continue;

    const marginPct =
      h.target_div != null && priceDiv > 0 ? ((h.target_div - priceDiv) / priceDiv) * 100 : null;

    insertHit(h.user_id, {
      hunt_id: h.id,
      item_name: l.itemName,
      base_type: l.baseType || h.base_type,
      price_amount: l.price.amount,
      price_ccy: l.price.currency,
      price_div: Number.isFinite(priceDiv) ? priceDiv : 0,
      margin_pct: marginPct,
      account: l.account,
      whisper: l.whisper,
      listing_id: l.listingId,
      seller_online: l.online ? 1 : 0,
      listed_at: l.indexed,
      sig,
    });
    newHits++;
  }

  if (newHits > 0) {
    const cheapest = listings[0]!;
    const marginTxt =
      h.target_div != null && cheapest.price
        ? ` (~${(((h.target_div - toDivine(cheapest.price.amount, cheapest.price.currency, rates)) / toDivine(cheapest.price.amount, cheapest.price.currency, rates)) * 100).toFixed(0)}% vs target)`
        : "";
    fireAlert(h.user_id, {
      type: h.mode,
      itemId: `hunt-${h.id}`,
      itemName: h.label,
      message: `${newHits} new — cheapest ${cheapest.price?.amount} ${cheapest.price?.currency}${marginTxt}`,
      value: newHits,
      threshold: 0,
    });
  }

  touchHuntScan(h.id, newHits > 0);
  return newHits;
}

/**
 * Scan active hunts, each with ITS OWNER's POESESSID. Pass `only` to scan a single user's hunts
 * with a supplied cred (manual route trigger); omit it to scan everyone's (the poller backstop),
 * resolving each user's stored cred and skipping users who haven't connected one. One hunt's
 * failure doesn't abort the rest.
 */
export async function scanAll(only?: { userId: number; cred: TradeCred }): Promise<ScanSummary> {
  const all = getHunts(true);
  const hunts = only ? all.filter((h) => h.user_id === only.userId) : all;
  if (hunts.length === 0) return { scanned: 0, hits: 0, errors: [] };

  const { rates } = await fetchScout();

  // one cred per user: provided directly for a manual scan, else resolved from stored creds
  const credByUser = new Map<number, TradeCred | null>();
  if (only) credByUser.set(only.userId, only.cred);
  else for (const u of listUsers()) credByUser.set(u.id, credForUser(u));

  let hits = 0;
  let scanned = 0;
  const errors: ScanSummary["errors"] = [];

  for (const h of hunts) {
    const cred = credByUser.get(h.user_id) ?? null;
    if (!cred) continue; // user hasn't connected a POESESSID — skip their hunts
    try {
      hits += await scanHunt(h, rates, cred);
      scanned++;
    } catch (e) {
      errors.push({ hunt: h.label, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { scanned, hits, errors };
}
