import { NextResponse } from "next/server";
import type { ScoutRates } from "../../../api/scoutClient";
import { fetchDemand, hasPriceHistory, type DemandItem } from "../../../api/scoutDemand";
import { getCurrentUser } from "../../../auth/session";
import { getDefaultLeague } from "../../../core/leagueState";
import { tradeSearchUrl } from "../../../lib/tradeLink";
import { demandTrust, heatScore } from "../../../core/demandHeat";
import type { DemandResponse, DemandRow } from "../../../lib/demandContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toRow(it: DemandItem, rates: ScoutRates, league: string): DemandRow {
  const marketDivine = it.priceExalt / rates.exaltPerDivine;
  const divergePct = it.priceExalt > 0 ? (Math.abs(it.priceExalt - it.rawPriceExalt) / it.priceExalt) * 100 : 0;
  return {
    id: it.id,
    name: it.name,
    type: it.type,
    category: it.category,
    icon: it.icon,
    marketDivine,
    priceAt: it.priceAt,
    quantity: it.quantity,
    listedAvg: it.listedAvg == null ? null : Math.round(it.listedAvg),
    sellThrough: it.sellThrough,
    momentumPct: it.momentumPct,
    spark: it.sparkPrices,
    heat: heatScore(it.sellThrough, it.momentumPct),
    trust: demandTrust(it.samples, it.quantity, divergePct),
    divergePct,
    tradeUrl: tradeSearchUrl(league, { name: it.name, type: it.type }),
  };
}

/**
 * GET /api/demand — the gear-unique board from poe2scout: cheapest asks with their age, plus
 * listing history and momentum where scout has a recent log. Heat blends a sell-through PROXY
 * (drops in listing count between scrapes) with positive price momentum; poe2scout has no sales
 * data. Rows come by value, highest first — the panel owns any other order.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // scoutDemand fetches the app default league — the deep links stay there too, or a row would
  // price one economy and link into another.
  const league = getDefaultLeague();
  try {
    const { rates, items, warnings } = await fetchDemand();
    const rows = items.map((it) => toRow(it, rates, league)).sort((a, b) => b.marketDivine - a.marketDivine);
    const body: DemandResponse = {
      rows,
      computedLeague: league,
      fetchedAt: new Date().toISOString(),
      exaltPerDivine: rates.exaltPerDivine,
      historyAvailable: hasPriceHistory(items),
      warnings,
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
