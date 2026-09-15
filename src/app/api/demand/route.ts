import { NextResponse } from "next/server";
import { fetchDemand } from "../../../api/scoutClient";
import { getActiveLeague } from "../../../core/leagueState";
import { tradeSearchUrl } from "../../../lib/tradeLink";
import { denominate, type Denom } from "../../../core/treasury";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface DemandRow {
  id: number;
  name: string;
  type: string;
  category: string;
  icon: string | null;
  market: Denom; // current price (outlier-guarded — see scoutClient.fetchDemand)
  marketDivine: number;
  quantity: number;
  turnover: number;
  momentumPct: number;
  spark: number[]; // daily log prices oldest→newest — row sparkline
  heat: number; // 0–100: flow + positive momentum
  trust: "ok" | "thin" | "noisy"; // price reliability — see below
  divergePct: number; // |shown − headline| / shown, % — >0 only when the outlier guard fired
  tradeUrl: string;
}

/**
 * GET /api/demand — "what's hot" gear-unique board from poe2scout flow + momentum.
 * Heat blends turnover (how much actually trades) with positive price momentum;
 * a true build-meta signal (desired affixes) isn't exposed by any PoE2 API, so this
 * is an honest liquidity+trend proxy, not "what players theory-craft".
 */
export async function GET(): Promise<Response> {
  try {
    const { rates, items } = await fetchDemand();
    const maxTurnover = items.reduce((m, i) => Math.max(m, i.turnover), 0);
    const norm = (t: number) => (maxTurnover > 0 ? Math.log10(t + 1) / Math.log10(maxTurnover + 1) : 0);

    const rows: DemandRow[] = items
      .map((it) => {
        const liqN = norm(it.turnover);
        const momN = Math.min(Math.max(it.momentumPct, 0) / 50, 1);
        const heat = Math.round(100 * (0.6 * liqN + 0.4 * momN));
        const marketDivine = it.priceExalt / rates.exaltPerDivine;
        const divergePct = it.priceExalt > 0 ? (Math.abs(it.priceExalt - it.rawPriceExalt) / it.priceExalt) * 100 : 0;
        // thin = too few data points / listings to trust; noisy = headline was an outlier (guard fired)
        const trust: DemandRow["trust"] =
          it.samples < 3 || it.quantity < 3 ? "thin" : divergePct > 40 ? "noisy" : "ok";
        return {
          id: it.id,
          name: it.name,
          type: it.type,
          category: it.category,
          icon: it.icon,
          market: denominate(marketDivine, rates),
          marketDivine,
          quantity: it.quantity,
          turnover: Math.round(it.turnover),
          momentumPct: it.momentumPct,
          spark: it.sparkPrices,
          heat,
          trust,
          divergePct,
          tradeUrl: tradeSearchUrl(getActiveLeague(), { name: it.name, type: it.type }),
        };
      })
      .sort((a, b) => b.heat - a.heat);

    return NextResponse.json({ rows, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
