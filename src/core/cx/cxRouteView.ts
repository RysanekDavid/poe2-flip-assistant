import { CX_CURRENCY_IDS, CX_HOUR_SECONDS } from "../../api/cxClient";
import type { PricedItem } from "../../api/types";
import { config } from "../../config/env";
import { cxItemNames, cxMarketsSince } from "../../db/cxMarketQueries";
import type { Currency } from "../priceEngine";
import { freshNewestHour, groupByHour, resolveItemIds } from "./cxItemMarkets";
import { modelParams } from "./cxMarketModel";
import { MIN_HELD_HOURS, SHORT_WINDOW_HOURS } from "./cxPersistence";
import { hourRoutes, persistentRoutes, type Route } from "./cxRoutes";

/** A loop must have paid in at least this many of the last 6 hours to be listed. */
export const ROUTE_MIN_HELD = MIN_HELD_HOURS;

export interface RouteRow {
  /** Our item id when the exchange item maps to a ninja line, else null (still tradable). */
  itemId: string | null;
  item: string;
  icon: string | null;
  from: Currency;
  to: Currency;
  held6: number;
  edgePct: number;
  latestPct: number | null;
  capUnitsPerHour: number;
  /** Capacity in Div/h at the ninja mid, or null when the item has no ninja line. */
  capDivPerHour: number | null;
  feeComplete: boolean;
}

const CCY: Readonly<Record<string, Currency>> = {
  [CX_CURRENCY_IDS.divine]: "DIVINE",
  [CX_CURRENCY_IDS.exalted]: "EXALT",
  [CX_CURRENCY_IDS.chaos]: "CHAOS",
};

function toCurrency(baseId: string): Currency {
  const c = CCY[baseId];
  if (c == null) throw new Error(`route leg ${baseId} is not Divine/Exalted/Chaos`);
  return c;
}

function toRow(route: Route, itemIdOf: ReadonlyMap<string, string>, names: ReadonlyMap<string, string>, byId: ReadonlyMap<string, PricedItem>): RouteRow {
  const itemId = itemIdOf.get(route.item) ?? null;
  const ninja = itemId != null ? byId.get(itemId) : undefined;
  return {
    itemId,
    item: ninja?.itemName ?? names.get(route.item) ?? route.item,
    icon: ninja?.icon ?? null,
    from: toCurrency(route.from),
    to: toCurrency(route.to),
    held6: route.held6,
    edgePct: route.medianNetPct,
    latestPct: route.latestNetPct,
    capUnitsPerHour: route.capUnitsPerHour,
    capDivPerHour: ninja != null ? route.capUnitsPerHour * ninja.baseValue : null,
    feeComplete: route.feeComplete,
  };
}

/** Closed loops (A → item → B → A) that held ≥ ROUTE_MIN_HELD of the last 6 hours, or null. */
export function loadCxRoutes(
  league: string,
  ninja: readonly PricedItem[],
  nowMs: number = Date.now(),
): { newestHour: number; routes: RouteRow[] } | null {
  const newestHour = freshNewestHour(league, nowMs);
  if (newestHour == null) return null;
  const params = modelParams();
  const rows = cxMarketsSince(league, newestHour - (SHORT_WINDOW_HOURS - 1) * CX_HOUR_SECONDS);
  const hours = [...groupByHour(rows)].flatMap(([hour, hourRows]) => hourRoutes(hour, hourRows, params));
  const routes = persistentRoutes(hours, newestHour, config.cx.edgeThresholdPct);
  const names = cxItemNames();
  const { itemIdOf } = resolveItemIds(new Set(routes.map((r) => r.item)), names, ninja);
  const byId = new Map(ninja.map((p) => [p.itemId, p]));
  return { newestHour, routes: routes.map((r) => toRow(r, itemIdOf, names, byId)) };
}
