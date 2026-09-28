import type { Listing, ListingMod } from "../api/tradeListing";
import { tradeSearchUrl, type TradeQuery } from "../lib/tradeLink";
import { cardIcon, SnipeCardSchema, type CardMod, type CardModKind, type SnipeCard } from "../lib/snipeCard";
import type { ResolvedStat } from "./statResolver";
import type { Valuation } from "./comparableValuation";

/** In-game tooltip order: implicits, enchants and runes above the explicit block, desecrated last. */
const KIND_ORDER: Record<CardModKind, number> = {
  implicit: 0,
  enchant: 1,
  rune: 2,
  fractured: 3,
  explicit: 4,
  crafted: 5,
  desecrated: 6,
};

function cardKind(m: ListingMod): CardModKind {
  return m.desecrated ? "desecrated" : m.marker;
}

export function cardMods(lines: readonly ListingMod[]): CardMod[] {
  return lines
    .map((m, i) => ({ kind: cardKind(m), text: m.text.slice(0, 200), i }))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.i - b.i)
    .slice(0, 24)
    .map(({ kind, text }) => ({ kind, text }));
}

/**
 * A trade2 search that finds THIS listing: the seller's account + the base (+ the unique name)
 * narrows the result to their copies of it, cheapest first. Status "any" because instant-buyout
 * listings are buyable while the seller is offline. Uses the `?q=` query-in-URL form, which needs
 * no search POST — opening the link spends nothing from our trade2 budget.
 */
export function listingTradeQuery(l: Listing): TradeQuery {
  const unique = (l.rarity ?? "").toLowerCase() === "unique";
  // parseListing writes "?" when trade2 omitted the seller; filtering on it would match nobody
  const account = l.account && l.account !== "?" ? l.account : undefined;
  return {
    ...(unique && l.itemName ? { name: l.itemName } : {}),
    type: l.baseType || undefined,
    online: false,
    ...(account ? { account } : {}),
    ...(l.itemLevel ? { ilvlMin: l.itemLevel } : {}),
  };
}

function searchedMods(stats: readonly ResolvedStat[]): string[] {
  return stats.slice(0, 12).map((s) => (s.value > 0 ? s.text.replace("#", String(Math.round(s.value))) : s.text).slice(0, 200));
}

export interface CardInput {
  listing: Listing;
  league: string;
  priceDiv: number;
  valueDiv: number;
  marginPct: number;
  exaltPerDivine: number;
  value: Valuation;
  searchStats: readonly ResolvedStat[];
  broadened: boolean;
  comparablesUrl: string;
}

/** Build + validate the card. Throws on a shape break: it is our own data, so that is a bug. */
export function buildSnipeCard(c: CardInput): SnipeCard {
  const l = c.listing;
  if (!l.price) throw new Error(`snipe card for ${l.listingId}: listing has no price`);
  return SnipeCardSchema.parse({
    v: 1,
    league: c.league,
    icon: cardIcon(l.icon),
    name: l.itemName,
    baseType: l.baseType,
    rarity: l.rarity,
    itemLevel: l.itemLevel,
    corrupted: l.corrupted,
    desecrated: l.desecrated || l.modLines.some((m) => m.desecrated),
    mods: cardMods(l.modLines),
    price: l.price,
    priceDiv: c.priceDiv,
    valueDiv: c.valueDiv,
    marginPct: c.marginPct,
    exaltPerDivine: c.exaltPerDivine,
    valuation: {
      samples: c.value.samples,
      dropped: c.value.dropped,
      unrated: c.value.unrated,
      total: c.value.total,
      minDiv: c.value.minDiv,
      broadened: c.broadened,
      searchedMods: searchedMods(c.searchStats),
      comparablesUrl: c.comparablesUrl,
    },
    listedAt: l.indexed,
    sellerOnline: l.online,
    instantBuyout: l.instantBuyout,
    whisper: l.whisper,
    tradeUrl: tradeSearchUrl(c.league, listingTradeQuery(l)),
  } satisfies SnipeCard);
}
