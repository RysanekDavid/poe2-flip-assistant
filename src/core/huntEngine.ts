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
  setRuntime,
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
    // recency feed, not a catalogue: without this, a price-asc scan surfaces week-old
    // zombie/bait listings — a hunt is "tell me when something NEW appears under my price"
    indexedWindow: "1day",
  };
}

/** Age of a listing in minutes from its trade `indexed` timestamp; Infinity if unknown. */
function listingAgeMin(indexed: string | null): number {
  if (!indexed) return Infinity;
  const ms = Date.now() - new Date(indexed).getTime();
  return Number.isFinite(ms) ? ms / 60_000 : Infinity;
}

export interface ScanSummary {
  scanned: number;
  hits: number;
  errors: Array<{ hunt: string; error: string }>;
}

/** Scan one hunt: fetch the NEWEST live listings at/under the trigger price (poll-diff —
 *  sort indexed desc + 1-day window + de-dupe by listing id), record fresh ones, alert. */
async function scanHunt(h: Hunt, rates: ScoutRates, cred: TradeCred): Promise<number> {
  const { listings } = await searchListings(huntToQuery(h), config.hunt.perScan, { indexed: "desc" }, cred);
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

    // only genuinely fresh listings become hits — old ones still feed the price book above,
    // but a listing that sat unsold for hours is stale bait, not a snipe
    if (listingAgeMin(l.indexed) > config.hunt.freshMinutes) continue;

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
    // listings arrive newest-first — summarize on the CHEAPEST priced one, that's the headline
    const cheapest = listings
      .filter((l) => l.price)
      .sort(
        (a, b) => toDivine(a.price!.amount, a.price!.currency, rates) - toDivine(b.price!.amount, b.price!.currency, rates),
      )[0];
    const cheapDiv = cheapest ? toDivine(cheapest.price!.amount, cheapest.price!.currency, rates) : NaN;
    const marginTxt =
      h.target_div != null && Number.isFinite(cheapDiv) && cheapDiv > 0
        ? ` (~${(((h.target_div - cheapDiv) / cheapDiv) * 100).toFixed(0)}% vs target)`
        : "";
    fireAlert(h.user_id, {
      type: h.mode,
      itemId: `hunt-${h.id}`,
      itemName: h.label,
      message: `${newHits} new — cheapest ${cheapest?.price?.amount} ${cheapest?.price?.currency}${marginTxt}`,
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

  // publish scan health for the UI status bar (cross-process via DB)
  setRuntime(scanned, errors.length > 0 ? `${errors[0]!.hunt}: ${errors[0]!.error}` : null, true);

  return { scanned, hits, errors };
}
