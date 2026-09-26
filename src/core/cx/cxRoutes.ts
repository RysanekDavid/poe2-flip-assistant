import { CX_HOUR_SECONDS } from "../../api/cxClient";
import type { CxMarketRow } from "../../db/cxMarketQueries";
import { goldToDivine, sumLegFees } from "./cxFees";
import {
  baseMarkets,
  baseRate,
  GRID_SAFETY,
  gridStepPct,
  hourRates,
  quotePerDivine,
  quotesByItem,
  type BaseMarkets,
  type HourRates,
  type ModelParams,
  type QuoteObs,
} from "./cxMarketModel";
import { median, MIN_HELD_HOURS, SHORT_WINDOW_HOURS } from "./cxPersistence";

/**
 * Closed-loop routes: start in currency A, buy item X with A, sell X for currency B, convert B
 * back to A on the base market — e.g. Ex → X → Div → Ex. Pure.
 *
 * Unlike the per-item cross edge (which values the Div you end up holding), a route pays the
 * gold for the closing conversion too. The same guards and window rules as a Top Flips edge
 * apply: quotable legs, gross wider than GRID_SAFETY × all three legs' grid steps, a priceable
 * fee below an Exalt, the plausibility cap, a slowest leg of at least minLegDivPerHour — and an
 * item-hour whose only candidate loops were implausible taints that item's whole window.
 */

export type RouteStatus = "valid" | "invalid" | "implausible";

export interface RouteHour {
  item: string;
  from: string;
  to: string;
  hour: number;
  status: RouteStatus;
  netPct: number;
  capUnits: number;
  feeComplete: boolean;
}

export interface Route {
  item: string;
  from: string;
  to: string;
  /** Valid hours of the last 6 with net return ≥ the threshold. */
  held6: number;
  /** Median over all 6 slots, invalid and silent hours as 0. */
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

function status(ctx: HourCtx, grossPct: number, gridPct: number, netPct: number, costDiv: number, feeComplete: boolean, capDiv: number): RouteStatus {
  const { rates, p } = ctx;
  if (grossPct <= GRID_SAFETY * gridPct) return "invalid";
  if (!feeComplete && (rates.exaltPerDivine == null || costDiv * rates.exaltPerDivine < 1)) return "invalid";
  if (capDiv < p.minLegDivPerHour) return "invalid";
  return netPct > p.maxPlausibleEdgePct ? "implausible" : "valid";
}

function routeHour(ctx: HourCtx, item: string, buy: QuoteObs, sell: QuoteObs): RouteHour | null {
  const { base, rates, p } = ctx;
  const close = baseRate(base, buy.quote, sell.quote);
  const aPerDiv = quotePerDivine(buy.quote, rates);
  if (close == null || aPerDiv == null || buy.issue != null || sell.issue != null) return null;
  const proceedsA = sell.priceQuote * close.aPerB;
  // Every leg requests something: the item, then the sell currency, then the start currency back.
  const fees = sumLegFees([
    { baseId: item, units: 1 },
    { baseId: sell.quote, units: sell.priceQuote },
    { baseId: buy.quote, units: proceedsA },
  ]);
  const feeDiv = goldToDivine(fees.knownGold, rates.exaltPerDivine, p.goldPerExalt);
  const feeComplete = fees.complete && feeDiv != null;
  const costDiv = buy.priceQuote / aPerDiv;
  const netPct = (((proceedsA - buy.priceQuote) / aPerDiv - (feeDiv ?? 0)) / costDiv) * 100;
  const capUnits = Math.min(buy.units, sell.units, close.bVolume / sell.priceQuote);
  const grossPct = (proceedsA / buy.priceQuote - 1) * 100;
  const gridPct = buy.gridStepPct + sell.gridStepPct + gridStepPct(close.aPerB);
  return {
    item,
    from: buy.quote,
    to: sell.quote,
    hour: ctx.hour,
    status: status(ctx, grossPct, gridPct, netPct, costDiv, feeComplete, capUnits * costDiv),
    netPct,
    capUnits,
    feeComplete,
  };
}

/** Every ordered (from → to) route of every item for one hour, with its guard verdict. */
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

/** Items with an hour whose loops were implausible and none valid — their windows are tainted. */
function taintedItems(hours: readonly RouteHour[]): Set<string> {
  const byItemHour = new Map<string, RouteHour[]>();
  for (const h of hours) {
    const key = `${h.item}|${h.hour}`;
    byItemHour.set(key, [...(byItemHour.get(key) ?? []), h]);
  }
  const tainted = new Set<string>();
  for (const list of byItemHour.values()) {
    if (list.some((h) => h.status === "implausible") && !list.some((h) => h.status === "valid")) tainted.add(list[0]!.item);
  }
  return tainted;
}

function toRoute(list: readonly RouteHour[], newestHour: number, thresholdPct: number): Route {
  const valid = list.filter((h) => h.status === "valid");
  const first = list[0]!;
  const netSlots = [...valid.map((h) => h.netPct), ...Array<number>(SHORT_WINDOW_HOURS - valid.length).fill(0)];
  return {
    item: first.item,
    from: first.from,
    to: first.to,
    held6: valid.filter((h) => h.netPct >= thresholdPct).length,
    medianNetPct: median(netSlots)!,
    latestNetPct: valid.find((h) => h.hour === newestHour)?.netPct ?? null,
    capUnitsPerHour: valid.reduce((s, h) => s + h.capUnits, 0) / SHORT_WINDOW_HOURS,
    feeComplete: valid.every((h) => h.feeComplete),
  };
}

/**
 * Routes that held in at least MIN_HELD_HOURS of the last 6 hours, best median first. A route
 * that printed once is a thin-market VWAP artefact until it repeats.
 */
export function persistentRoutes(hours: readonly RouteHour[], newestHour: number, thresholdPct: number): Route[] {
  const from = newestHour - (SHORT_WINDOW_HOURS - 1) * CX_HOUR_SECONDS;
  const window = hours.filter((h) => h.hour >= from && h.hour <= newestHour);
  const tainted = taintedItems(window);
  const groups = new Map<string, RouteHour[]>();
  for (const h of window) {
    if (tainted.has(h.item)) continue;
    const key = `${h.item}|${h.from}|${h.to}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  return [...groups.values()]
    .map((list) => toRoute(list, newestHour, thresholdPct))
    .filter((r) => r.held6 >= MIN_HELD_HOURS)
    .sort((a, b) => b.medianNetPct - a.medianNetPct);
}
