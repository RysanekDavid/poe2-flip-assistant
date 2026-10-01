import { CX_CURRENCY_IDS, CX_HOUR_SECONDS } from "../../api/cxClient";
import type { CxMarketRow } from "../../db/cxMarketQueries";

/**
 * Divine price per exchange item from ONE league-hour of GGG's currency-exchange digest — the
 * shadow candidate for replacing poe.ninja as the exchange price source.
 *
 * Digest semantics this relies on (checked on live hours 2026-10-01, see the PR): for a traded
 * market, volume_traded[x] / volume_traded[y] always fell inside the hour's lowest/highest ratio
 * band, so the volume ratio is read as the hour's average execution rate (inferred, not stated by
 * GGG). Markets with zero volume on both sides are common (resting orders, no fills) and carry no
 * price. One-sided volume was never observed; it is treated as unpriceable rather than guessed.
 *
 * Leg choice: an item trades against Divine, Exalted and Chaos separately, and the legs disagree
 * by far more than noise. Thin legs print integer-ratio overpays — 20 Greater Essences of Opulence
 * filled at 1:1 for Divine in an hour their 143-unit Exalted leg put them at 0.047 Div — so
 * "Divine leg first" was the worst rule measured against poe.ninja (p90 |dev| ≈ 640%). The leg with
 * the most ITEM units filled is the price (p90 ≈ 120%, no bias); Divine wins ties, and an
 * Exalted/Chaos leg is converted at the same hour's Ex/Div or Chaos/Div rate. Swapping the rule
 * later is cheap: the stored cx_markets history can be re-priced (see cxPriceShadow).
 */

export const CX_PRICE_METHODS = ["direct", "bridge", "carried"] as const;
export type CxPriceMethod = (typeof CX_PRICE_METHODS)[number];

/**
 * A priced item is carried forward at most this long after its last traded hour. Beyond a week a
 * dead market's last print is no longer a price, and every carried row is stored each hour.
 */
export const CX_MAX_CARRY_HOURS = 7 * 24;

export interface CxShadowPrice {
  /** Entity catalog exchange_id (= trade2 static id = poe.ninja exchange id). */
  exchangeId: string;
  /** Divine per one item. */
  priceDiv: number;
  method: CxPriceMethod;
  /** Item units filled on the leg the price came from (0 when carried). */
  units: number;
  /** Divine value filled on that leg (0 when carried). */
  volumeDiv: number;
  /** Filled base-quote legs the item had this hour, priceable or not (0 when carried). */
  legs: number;
  /** Digest hour (next_change_id) of the trades behind the price; equals `hour` unless carried. */
  tradedHour: number;
}

export interface CxHourPricing {
  hour: number;
  prices: CxShadowPrice[];
  /** Digest ids that traded against a base currency this hour but have no catalog exchange id. */
  unmapped: string[];
}

/** Divine per one unit of each base quote this hour; null when its Divine market did not trade. */
export interface CxBridgeRates {
  divPerExalt: number | null;
  divPerChaos: number | null;
}

export type CxQuote = "divine" | "exalted" | "chaos";

const QUOTE_BY_ID: ReadonlyMap<string, CxQuote> = new Map([
  [CX_CURRENCY_IDS.divine, "divine"],
  [CX_CURRENCY_IDS.exalted, "exalted"],
  [CX_CURRENCY_IDS.chaos, "chaos"],
]);

/** One filled market of an item against a base quote. */
export interface CxPriceLeg {
  quote: CxQuote;
  /** Item units that changed hands. */
  units: number;
  /** Quote units that changed hands. */
  quoteUnits: number;
}

/** Both sides of a stored market as (item, other) views, so orientation never matters. */
function sides(row: CxMarketRow): Array<{ item: string; other: string; vItem: number; vOther: number }> {
  return [
    { item: row.item_a, other: row.item_b, vItem: row.volume_a, vOther: row.volume_b },
    { item: row.item_b, other: row.item_a, vItem: row.volume_b, vOther: row.volume_a },
  ];
}

/** Divine per unit of `id` from its own Divine market, or null when that market had no fills. */
function divPer(rows: readonly CxMarketRow[], id: string): number | null {
  for (const row of rows) {
    for (const s of sides(row)) {
      if (s.item === id && s.other === CX_CURRENCY_IDS.divine && s.vItem > 0 && s.vOther > 0) return s.vOther / s.vItem;
    }
  }
  return null;
}

/** The hour's volume-weighted Divine value of one Exalted and one Chaos, from their Divine markets. */
export function cxBridgeRates(rows: readonly CxMarketRow[]): CxBridgeRates {
  return { divPerExalt: divPer(rows, CX_CURRENCY_IDS.exalted), divPerChaos: divPer(rows, CX_CURRENCY_IDS.chaos) };
}

/** Every non-base item's filled legs against Divine/Exalted/Chaos. Item-vs-item markets are ignored. */
function legsByItem(rows: readonly CxMarketRow[]): Map<string, CxPriceLeg[]> {
  const out = new Map<string, CxPriceLeg[]>();
  for (const row of rows) {
    for (const s of sides(row)) {
      const quote = QUOTE_BY_ID.get(s.other);
      if (quote == null || s.item === CX_CURRENCY_IDS.divine) continue;
      // Both sides must have filled: one-sided volume is not a rate, and 0/0 is resting orders only.
      if (!(s.vItem > 0 && s.vOther > 0)) continue;
      const legs = out.get(s.item) ?? [];
      legs.push({ quote, units: s.vItem, quoteUnits: s.vOther });
      out.set(s.item, legs);
    }
  }
  return out;
}

function divPerQuote(quote: CxQuote, bridge: CxBridgeRates): number | null {
  if (quote === "divine") return 1;
  return quote === "exalted" ? bridge.divPerExalt : bridge.divPerChaos;
}

/** Divine first on a tie: it needs no bridge rate. */
const QUOTE_RANK: Record<CxQuote, number> = { divine: 0, exalted: 1, chaos: 2 };

/**
 * One item's price from its filled legs: the leg with the most item units, among those whose
 * quote has a Divine rate this hour. Null when no leg is priceable (e.g. Exalted-only and the
 * Ex/Div market did not fill).
 */
export function priceFromLegs(
  legs: readonly CxPriceLeg[],
  bridge: CxBridgeRates,
): Pick<CxShadowPrice, "priceDiv" | "method" | "units" | "volumeDiv" | "legs"> | null {
  let best: { leg: CxPriceLeg; rate: number } | null = null;
  for (const leg of legs) {
    const rate = divPerQuote(leg.quote, bridge);
    if (rate == null) continue;
    const better =
      best == null || leg.units > best.leg.units || (leg.units === best.leg.units && QUOTE_RANK[leg.quote] < QUOTE_RANK[best.leg.quote]);
    if (better) best = { leg, rate };
  }
  if (best == null) return null;
  const volumeDiv = best.leg.quoteUnits * best.rate;
  return {
    priceDiv: volumeDiv / best.leg.units,
    method: best.leg.quote === "divine" ? "direct" : "bridge",
    units: best.leg.units,
    volumeDiv,
    legs: legs.length,
  };
}

/** Prices from the previous priced hour that did not trade now, re-emitted with their trade hour. */
function carried(
  hour: number,
  previous: Iterable<CxShadowPrice>,
  priced: ReadonlySet<string>,
  maxCarryHours: number,
): CxShadowPrice[] {
  const out: CxShadowPrice[] = [];
  for (const p of previous) {
    if (priced.has(p.exchangeId) || p.tradedHour >= hour) continue;
    if ((hour - p.tradedHour) / CX_HOUR_SECONDS > maxCarryHours) continue;
    // Explicit fields: `previous` rows are often StoredShadowPrice, whose own `hour` must not leak.
    out.push({ exchangeId: p.exchangeId, priceDiv: p.priceDiv, method: "carried", units: 0, volumeDiv: 0, legs: 0, tradedHour: p.tradedHour });
  }
  return out;
}

/**
 * Price one league-hour.
 *
 * `exchangeIdByDigestId` maps GGG metadata ids to catalog exchange ids, so nothing is keyed by
 * display names. `previous` is the newest earlier priced hour of the same league; items without a
 * fill now are carried from it with their original traded hour until CX_MAX_CARRY_HOURS.
 */
export function priceCxHour(
  rows: readonly CxMarketRow[],
  hour: number,
  exchangeIdByDigestId: ReadonlyMap<string, string>,
  previous: Iterable<CxShadowPrice> = [],
  maxCarryHours: number = CX_MAX_CARRY_HOURS,
): CxHourPricing {
  for (const row of rows) {
    if (row.hour !== hour) throw new Error(`cx row for hour ${row.hour} passed to priceCxHour(${hour})`);
  }
  const bridge = cxBridgeRates(rows);
  const prices: CxShadowPrice[] = [];
  const unmapped: string[] = [];
  const divineId = exchangeIdByDigestId.get(CX_CURRENCY_IDS.divine);
  if (divineId != null && bridge.divPerExalt != null) {
    // The unit itself: priced only in an hour whose Div/Ex market filled, like ninja's 1.0 row.
    prices.push({ exchangeId: divineId, priceDiv: 1, method: "direct", units: 0, volumeDiv: 0, legs: 0, tradedHour: hour });
  }
  for (const [digestId, legs] of legsByItem(rows)) {
    const exchangeId = exchangeIdByDigestId.get(digestId);
    if (exchangeId == null) {
      unmapped.push(digestId);
      continue;
    }
    const price = priceFromLegs(legs, bridge);
    if (price != null) prices.push({ exchangeId, ...price, tradedHour: hour });
  }
  const priced = new Set(prices.map((p) => p.exchangeId));
  prices.push(...carried(hour, previous, priced, maxCarryHours));
  return { hour, prices, unmapped: unmapped.sort() };
}
