import { NextResponse } from "next/server";
import { fetchScout } from "../../../api/scoutClient";
import { getCurrentUser } from "../../../auth/session";
import { getDefaultLeague } from "../../../core/leagueState";
import { tradeSearchUrl } from "../../../lib/tradeLink";
import { denominate, type Denom } from "../../../core/treasury";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hunt target: open a trade2 search and snipe listings at or below market × this. */
const SNIPE_DISCOUNT = 0.85;

export interface ShopRow {
  id: number;
  name: string;
  type: string;
  category: string;
  icon: string | null;
  marketDivine: number;
  market: Denom; // fair value, auto-denominated
  buy: Denom; // snipe target (market × discount)
  tradeUrl: string; // prefilled live trade2 search
}

/**
 * GET /api/shop — a "what to hunt" shopping list from poe2scout web-trade prices.
 * Each row gives the fair market value, a snipe buy-target, and a deep-link that
 * opens the live trade site sorted cheapest-first so you can see real listings.
 *
 * Query: ?cat=accessory&minDiv=1&q=text&limit=200
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // scoutClient fetches prices for the app default league, so the deep links must point THERE:
  // a trade2 URL in the viewer's league would open a market these prices never came from.
  const league = getDefaultLeague();
  const url = new URL(req.url);
  const cat = url.searchParams.get("cat");
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const minDiv = Number(url.searchParams.get("minDiv") ?? "0") || 0;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "200") || 200, 500);

  try {
    const { rates, items } = await fetchScout();
    const rows: ShopRow[] = items
      .map((it) => ({ it, marketDivine: it.priceExalt / rates.exaltPerDivine }))
      .filter(({ it, marketDivine }) => {
        if (marketDivine < minDiv) return false;
        if (cat && it.category !== cat) return false;
        if (q && !it.name.toLowerCase().includes(q) && !it.type.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.marketDivine - a.marketDivine)
      .slice(0, limit)
      .map(({ it, marketDivine }) => ({
        id: it.id,
        name: it.name,
        type: it.type,
        category: it.category,
        icon: it.icon,
        marketDivine,
        market: denominate(marketDivine, rates),
        buy: denominate(marketDivine * SNIPE_DISCOUNT, rates),
        tradeUrl: tradeSearchUrl(league, { name: it.name, type: it.type }),
      }));

    const categories = [...new Set(items.map((i) => i.category))].sort();
    return NextResponse.json({
      rows,
      categories,
      snipeDiscount: SNIPE_DISCOUNT,
      computedLeague: league,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
