import { CX_HOUR_SECONDS } from "../../api/cxClient";
import type { CxMarketRow } from "../../db/cxMarketQueries";
import { goldToDivine, sumLegFees } from "./cxFees";
import { hourRates, quotePerDivine, quotesByItem, type HourRates, type QuoteObs } from "./cxMarketModel";
import { median, SHORT_WINDOW_HOURS } from "./cxPersistence";

/**
 * Closed-loop routes: start in currency A, buy item X with A, sell X for currency B, convert B
 * back to A on the base market — e.g. Ex → X → Div → Ex. Pure.
 *
 * Unlike the per-item cross edge (which values the Div you end up holding), a route pays the
 * gold for the closing conversion too, so it is the honest number for "repeat the loop".
 * Capacity is the slowest of the three legs, in item units per hour.
 */

export interface RouteHour {
  item: string;
  from: string;
  to: string;
  hour: number;
  netPct: number;
  capUnits: number;
  feeComplete: boolean;
}

export interface Route {
  item: string;
  from: string;
  to: string;
  /** Hours of the last 6 whose net return was ≥ the threshold. */
  held6: number;
  medianNetPct: number;
  latestNetPct: number | null;
  /** Mean item units/hour through the slowest leg over the 6h window, silent hours as 0. */
  capUnitsPerHour: number;
  feeComplete: boolean;
}

/** Units of `a` paid per unit of `b` on their own market this hour, or null. */
function baseRate(rows: readonly CxMarketRow[], a: string, b: string): { aPerB: number; bVolume: number } | null {
  const m = rows.find((r) => (r.item_a === a && r.item_b === b) || (r.item_a === b && r.item_b === a));
  if (m == null) return null;
  const va = m.item_a === a ? m.volume_a : m.volume_b;
  const vb = m.item_a === a ? m.volume_b : m.volume_a;
  return va > 0 && vb > 0 ? { aPerB: va / vb, bVolume: vb } : null;
}

function routeHour(
  hour: number,
  item: string,
  buy: QuoteObs,
  sell: QuoteObs,
  rows: readonly CxMarketRow[],
  rates: HourRates,
  goldPerExalt: number,
): RouteHour | null {
  const close = baseRate(rows, buy.quote, sell.quote);
  const aPerDiv = quotePerDivine(buy.quote, rates);
  if (close == null || aPerDiv == null) return null;
  const proceedsA = sell.priceQuote * close.aPerB;
  // Every leg requests something: the item, then the sell currency, then the start currency back.
  const fees = sumLegFees([
    { baseId: item, units: 1 },
    { baseId: sell.quote, units: sell.priceQuote },
    { baseId: buy.quote, units: proceedsA },
  ]);
  const feeDiv = goldToDivine(fees.knownGold, rates.exaltPerDivine, goldPerExalt);
  const costDiv = buy.priceQuote / aPerDiv;
  const netDiv = (proceedsA - buy.priceQuote) / aPerDiv - (feeDiv ?? 0);
  return {
    item,
    from: buy.quote,
    to: sell.quote,
    hour,
    netPct: (netDiv / costDiv) * 100,
    capUnits: Math.min(buy.units, sell.units, close.bVolume / sell.priceQuote),
    feeComplete: fees.complete && feeDiv != null,
  };
}

/** Every ordered (from → to) route of every item for one hour. */
export function hourRoutes(hour: number, rows: readonly CxMarketRow[], goldPerExalt: number): RouteHour[] {
  const rates = hourRates(rows);
  const out: RouteHour[] = [];
  for (const [item, quotes] of quotesByItem(rows, rates)) {
    for (const buy of quotes) {
      for (const sell of quotes) {
        if (buy.quote === sell.quote) continue;
        const r = routeHour(hour, item, buy, sell, rows, rates, goldPerExalt);
        if (r != null) out.push(r);
      }
    }
  }
  return out;
}

/**
 * Routes that held in at least `minHeld` of the last 6 hours, best median first. A route that
 * printed once is a thin-market VWAP artefact until it repeats.
 */
export function persistentRoutes(
  hours: readonly RouteHour[],
  newestHour: number,
  thresholdPct: number,
  minHeld: number,
): Route[] {
  const from = newestHour - (SHORT_WINDOW_HOURS - 1) * CX_HOUR_SECONDS;
  const groups = new Map<string, RouteHour[]>();
  for (const h of hours) {
    if (h.hour < from || h.hour > newestHour) continue;
    const key = `${h.item}|${h.from}|${h.to}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  const routes: Route[] = [];
  for (const list of groups.values()) {
    const held6 = list.filter((h) => h.netPct >= thresholdPct).length;
    if (held6 < minHeld) continue;
    const first = list[0]!;
    routes.push({
      item: first.item,
      from: first.from,
      to: first.to,
      held6,
      medianNetPct: median(list.map((h) => h.netPct))!,
      latestNetPct: list.find((h) => h.hour === newestHour)?.netPct ?? null,
      capUnitsPerHour: list.reduce((s, h) => s + h.capUnits, 0) / SHORT_WINDOW_HOURS,
      feeComplete: list.every((h) => h.feeComplete),
    });
  }
  return routes.sort((a, b) => b.medianNetPct - a.medianNetPct);
}
