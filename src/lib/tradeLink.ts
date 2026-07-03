/**
 * Deep-links into the official PoE2 trade site. We can't (and shouldn't) automate
 * the trade API — instead we hand the user a prefilled live search they open in the
 * browser, see real listings, and buy manually. Honest, ToS-safe, no ban risk.
 *
 * The site reads a `?q=<url-encoded JSON>` query and runs it, same mechanism the
 * community tools (Awakened, Sidekick) use to open searches.
 */
const TRADE2_SEARCH = "https://www.pathofexile.com/trade2/search/poe2";

export type Rarity = "normal" | "magic" | "rare" | "unique";

export interface StatFilter {
  id: string; // trade stat id, e.g. "explicit.stat_3299347043"
  min?: number;
  max?: number;
}

export interface TradeQuery {
  name?: string; // unique name, e.g. "Headhunter"
  type?: string; // base type, e.g. "Leather Belt"
  online?: boolean; // default true — only listings whose seller is online
  buyout?: boolean; // default true — only listings with a fixed buyout price (skip negotiate/unpriced)
  rarity?: Rarity; // restrict item rarity (rare for crafted gear, normal for cheap bases)
  category?: string; // trade2 category, e.g. "armour.gloves" | "weapon.wand" — a whole gear slot
  maxPrice?: { amount: number; currency: "divine" | "exalted" | "chaos" }; // price ceiling
  ilvlMin?: number; // minimum item level (comparable gear of similar power)
  corrupted?: boolean; // restrict corrupted state; omit = either
  indexedWindow?: "1day" | "3days" | "1week"; // only listings indexed within this window (recency feed)
  stats?: StatFilter[]; // explicit/implicit mod thresholds (AND-combined)
}

/** The inner `query` object — shared by the deep-link URL and the live POST search. */
export function buildTradeQuery(q: TradeQuery): Record<string, unknown> {
  const query: Record<string, unknown> = {
    status: { option: q.online === false ? "any" : "online" },
  };
  if (q.name) query.name = q.name;
  if (q.type) query.type = q.type;

  const filters: Record<string, unknown> = {};
  const typeFilters: Record<string, unknown> = {};
  if (q.rarity) typeFilters.rarity = { option: q.rarity };
  if (q.category) typeFilters.category = { option: q.category };
  if (q.ilvlMin && q.ilvlMin > 0) typeFilters.ilvl = { min: q.ilvlMin };
  if (Object.keys(typeFilters).length > 0) filters.type_filters = { filters: typeFilters };
  if (q.corrupted != null) {
    filters.misc_filters = { filters: { corrupted: { option: String(q.corrupted) } } };
  }
  // trade filters: buyout-only by default (skip "negotiate"/unpriced), plus optional price ceiling.
  // PoE2 uses sale_type option "priced" — the PoE1 value "priceFixed" is rejected ("Unknown sale type").
  const tradeFilters: Record<string, unknown> = {};
  if (q.buyout !== false) tradeFilters.sale_type = { option: "priced" };
  if (q.maxPrice && q.maxPrice.amount > 0) {
    tradeFilters.price = { max: q.maxPrice.amount, option: q.maxPrice.currency };
  }
  if (q.indexedWindow) tradeFilters.indexed = { option: q.indexedWindow };
  if (Object.keys(tradeFilters).length > 0) filters.trade_filters = { filters: tradeFilters };
  if (Object.keys(filters).length > 0) query.filters = filters;

  // trade API expects `stats` to always be present (an array), even when empty.
  // A filter with no min/max still matches on the mod being PRESENT (any roll) — that's
  // what we want for a sell search: the finished item must HAVE the mod.
  const live = (q.stats ?? []).filter((s) => s.id);
  query.stats = live.length
    ? [
        {
          type: "and",
          filters: live.map((s) => ({
            id: s.id,
            value: { ...(s.min != null ? { min: s.min } : {}), ...(s.max != null ? { max: s.max } : {}) },
          })),
        },
      ]
    : [];
  return query;
}

/** Build a prefilled, price-ascending live search URL for the given league. */
export function tradeSearchUrl(league: string, q: TradeQuery): string {
  const payload = { query: buildTradeQuery(q), sort: { price: "asc" } };
  return `${TRADE2_SEARCH}/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(payload))}`;
}
