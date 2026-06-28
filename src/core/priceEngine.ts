import type { PricedItem } from "../api/types";

/**
 * PoE2 exchange base unit is Divine. poe.ninja `primaryValue` is already the
 * Divine price per item — used directly, no inversion (that was PoE1 logic).
 */

export interface ExchangeRates {
  exaltPerDivine: number; // e.g. 226.5
  chaosPerDivine: number; // e.g. 9.4
}

/** Derive Exalt/Chaos-per-Divine from the priced item set (exalted/chaos lines). */
export function deriveRates(items: Array<Pick<PricedItem, "itemId" | "baseValue">>): ExchangeRates | null {
  const ex = items.find((i) => i.itemId === "exalted")?.baseValue;
  const ch = items.find((i) => i.itemId === "chaos")?.baseValue;
  if (!ex || !ch || ex <= 0 || ch <= 0) return null;
  return { exaltPerDivine: 1 / ex, chaosPerDivine: 1 / ch };
}

export interface RecoOffsets {
  buyDiscount: number; // place buy at mid × this (below mid)
  sellBonus: number; // place sell at mid × this (above mid)
  offset: number; // half-offset fraction each side
  marginPct: number; // resulting round-trip margin %
}

/**
 * Volume-adaptive order placement. More flow = you can sit further from mid and
 * still get filled fast; thin volume = hug the mid or your order never fills.
 * Heuristic starting point — real achievable margin comes from manual Ange prices.
 */
export function recommendOffsets(volume: number): RecoOffsets {
  const offset = volume >= 5000 ? 0.1 : volume >= 1000 ? 0.07 : volume >= 300 ? 0.05 : 0.03;
  const buyDiscount = 1 - offset;
  const sellBonus = 1 + offset;
  return { buyDiscount, sellBonus, offset, marginPct: (sellBonus / buyDiscount - 1) * 100 };
}

export type Currency = "DIVINE" | "EXALT" | "CHAOS";

/** Convert a price in any of the three currencies to its Divine value. */
export function toDivine(price: number, ccy: Currency, r: ExchangeRates): number {
  if (ccy === "DIVINE") return price;
  if (ccy === "EXALT") return price / r.exaltPerDivine;
  return price / r.chaosPerDivine; // CHAOS
}

/** Convert a Divine value into a given currency. */
export function divineTo(divine: number, ccy: Currency, r: ExchangeRates): number {
  if (ccy === "DIVINE") return divine;
  if (ccy === "EXALT") return divine * r.exaltPerDivine;
  return divine * r.chaosPerDivine; // CHAOS
}

export const divineToExalt = (divine: number, r: ExchangeRates): number => divine * r.exaltPerDivine;
export const divineToChaos = (divine: number, r: ExchangeRates): number => divine * r.chaosPerDivine;
export const exaltToDivine = (exalt: number, r: ExchangeRates): number => exalt / r.exaltPerDivine;
export const chaosToDivine = (chaos: number, r: ExchangeRates): number => chaos / r.chaosPerDivine;
