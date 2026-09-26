import { NextResponse } from "next/server";
import { fetchDemand, type DemandItem, type ScoutRates } from "../../../api/scoutClient";
import { getCurrentUser } from "../../../auth/session";
import { getDefaultLeague } from "../../../core/leagueState";
import { tradeSearchUrl } from "../../../lib/tradeLink";
import { denominate, type Denom } from "../../../core/treasury";
import { heatScore } from "../../../core/demandHeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface DemandRow {
  id: number;
  name: string;
  type: string;
  category: string;
  icon: string | null;
  market: Denom; // cheapest listed ask (poe2scout CurrentPrice, outlier-guarded) — NOT a sale price
  marketDivine: number;
  quantity: number; // live listing count
  listedAvg: number; // average listing count over the price log (supply, not flow)
  sellThrough: number; // avg per-step drop in listing count — sell-through proxy
  momentumPct: number;
  spark: number[]; // daily log prices oldest→newest — row sparkline
  heat: number; // 0–100: sell-through proxy + positive momentum (see core/demandHeat)
  trust: "ok" | "thin" | "noisy"; // price reliability — see below
  divergePct: number; // |shown − headline| / shown, % — >0 only when the outlier guard fired
  tradeUrl: string;
}

function toRow(it: DemandItem, rates: ScoutRates, maxSellThrough: number, league: string): DemandRow {
  const marketDivine = it.priceExalt / rates.exaltPerDivine;
  const divergePct = it.priceExalt > 0 ? (Math.abs(it.priceExalt - it.rawPriceExalt) / it.priceExalt) * 100 : 0;
  // thin = too few data points / listings to trust; noisy = headline was an outlier (guard fired)
  const trust: DemandRow["trust"] = it.samples < 3 || it.quantity < 3 ? "thin" : divergePct > 40 ? "noisy" : "ok";
  return {
    id: it.id,
    name: it.name,
    type: it.type,
    category: it.category,
    icon: it.icon,
    market: denominate(marketDivine, rates),
    marketDivine,
    quantity: it.quantity,
    listedAvg: Math.round(it.listedAvg),
    sellThrough: it.sellThrough,
    momentumPct: it.momentumPct,
    spark: it.sparkPrices,
    heat: heatScore(it.sellThrough, maxSellThrough, it.momentumPct),
    trust,
    divergePct,
    tradeUrl: tradeSearchUrl(league, { name: it.name, type: it.type }),
  };
}

/**
 * GET /api/demand — "what's hot" gear-unique board from poe2scout listing history + momentum.
 * Heat blends a sell-through PROXY (drops in listing count between scrapes) with positive price
 * momentum. poe2scout has no sales data; listing count alone measures supply, so it no longer
 * drives Heat. A true build-meta signal (desired affixes) isn't exposed by any PoE2 API either.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // scoutClient fetches the app default league — the deep links stay there too, or a row would
  // price one economy and link into another.
  const league = getDefaultLeague();
  try {
    const { rates, items } = await fetchDemand();
    const maxSellThrough = items.reduce((m, i) => Math.max(m, i.sellThrough), 0);
    const rows = items.map((it) => toRow(it, rates, maxSellThrough, league)).sort((a, b) => b.heat - a.heat);
    return NextResponse.json({ rows, computedLeague: league, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
