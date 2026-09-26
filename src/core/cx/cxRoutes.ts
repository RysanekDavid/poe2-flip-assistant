import { CX_HOUR_SECONDS } from "../../api/cxClient";
import type { CxMarketRow } from "../../db/cxMarketQueries";
import { goldToDivine, sumLegFees } from "./cxFees";
import {
  baseMarkets,
  baseRate,
  gridStepPct,
  hourRates,
  quotePerDivine,
  quotesByItem,
  type BaseMarkets,
  type HourRates,
  type ModelParams,
  type QuoteObs,
} from "./cxMarketModel";
import { median, SHORT_WINDOW_HOURS } from "./cxPersistence";

/**
 * Closed-loop routes: start in currency A, buy item X with A, sell X for currency B, convert B
 * back to A on the base market — e.g. Ex → X → Div → Ex. Pure.
 *
 * Unlike the per-item cross edge (which values the Div you end up holding), a route pays the
 * gold for the closing conversion too. An hour only exists for a route when it passes the same
 * guards as a Top Flips edge (quotable legs, wider than the ratio grids, priceable fee below an
 * Exalt, plausible) AND its slowest leg moves at least minLegDivPerHour.
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
  /** Hours of the last 6 that passed every guard with net return ≥ the threshold. */
  held6: number;
  medianNetPct: number;
  latestNetPct: number | null;
  /** Mean item units/hour through the slowest leg over the 6h window, other hours as 0. */
  capUnitsPerHour: number;
  feeComplete: boolean;
}

interface HourCtx {
  hour: number;
  base: BaseMarkets;
  rates: HourRates;
  p: ModelParams;
}

function routeHour(ctx: HourCtx, item: string, buy: QuoteObs, sell: QuoteObs): RouteHour | null {
  const { base, rates, p } = ctx;
  const close = baseRate(base, buy.quote, sell.quote);
  const aPerDiv = quotePerDivine(buy.quote, rates);
  if (close == null || aPerDiv == null || buy.issue != null || sell.issue != null) return null;
  const proceedsA = sell.priceQuote * close.aPerB;
  const grossPct = (proceedsA / buy.priceQuote - 1) * 100;
  if (grossPct <= buy.gridStepPct + sell.gridStepPct + gridStepPct(close.aPerB)) return null;
  // Every leg requests something: the item, then the sell currency, then the start currency back.
  const fees = sumLegFees([
    { baseId: item, units: 1 },
    { baseId: sell.quote, units: sell.priceQuote },
    { baseId: buy.quote, units: proceedsA },
  ]);
  const feeDiv = goldToDivine(fees.knownGold, rates.exaltPerDivine, p.goldPerExalt);
  const feeComplete = fees.complete && feeDiv != null;
  const costDiv = buy.priceQuote / aPerDiv;
  if (!feeComplete && (rates.exaltPerDivine == null || costDiv * rates.exaltPerDivine < 1)) return null;
  const netPct = (((proceedsA - buy.priceQuote) / aPerDiv - (feeDiv ?? 0)) / costDiv) * 100;
  const capUnits = Math.min(buy.units, sell.units, close.bVolume / sell.priceQuote);
  if (netPct > p.maxPlausibleEdgePct || capUnits * costDiv < p.minLegDivPerHour) return null;
  return { item, from: buy.quote, to: sell.quote, hour: ctx.hour, netPct, capUnits, feeComplete };
}

/** Every ordered (from → to) route of every item for one hour that passes the guards. */
export function hourRoutes(hour: number, rows: readonly CxMarketRow[], p: ModelParams): RouteHour[] {
  // The three base markets are looked up once per hour, not once per item × pair.
  const base = baseMarkets(rows);
  const ctx: HourCtx = { hour, base, rates: hourRates(base), p };
  const out: RouteHour[] = [];
  for (const [item, quotes] of quotesByItem(rows, ctx.rates, p)) {
    for (const buy of quotes) {
      for (const sell of quotes) {
        if (buy.quote === sell.quote) continue;
        const r = routeHour(ctx, item, buy, sell);
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
