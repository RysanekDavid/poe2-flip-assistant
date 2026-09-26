import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "../../../config/env";
import { addWatch } from "../../../db/watchlistQueries";
import { latestSnapshots, latestFetchedAt } from "../../../db/marketQueries";
import { getCurrentUser } from "../../../auth/session";
import { type ExchangeRates } from "../../../core/priceEngine";
import { leagueForUser } from "../../../core/leagueUsers";
import { resolveRates } from "../../../core/rates";
import { scoreItem, type FlipRow } from "../../../core/flipModel";
import { loadCxMarketView, type CxMarketView } from "../../../core/cx/cxItemMarkets";
import { cxHitRate } from "../../../core/cx/cxOutcomes";
import type { PricedItem } from "../../../api/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_IDS = new Set(["divine"]); // base unit — zero spread, not flippable vs itself

/**
 * Score every liquid, non-base item, ranked by worthScore. Items with a market in GGG's stored
 * exchange history are scored on it; the rest fall back to the labelled estimate.
 */
function scoreAll(prices: PricedItem[], rates: ExchangeRates, cx: CxMarketView | null): FlipRow[] {
  return prices
    .filter((p) => !BASE_IDS.has(p.itemId) && p.volume >= config.minVolume && p.baseValue > 0)
    .map((p) => scoreItem(p, rates, null, null, cx?.byItemId.get(p.itemId) ?? null))
    .sort((a, b) => b.worthScore - a.worthScore);
}

/**
 * Where the exchange numbers came from, and how often a published edge still held an hour later
 * (the outcome loop) — enough for the UI to label the table honestly.
 */
function cxSummary(league: string, cx: CxMarketView | null) {
  return cx == null ? null : { newestHour: cx.newestHour, coverage: cx.coverage, hitRate: cxHitRate(league) };
}

/** GET /api/discover?limit=80&q=essence → market-wide flip scan; `q` searches the WHOLE market by name. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const limit = Math.min(Number(params.get("limit")) || 40, 2000);
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const league = leagueForUser(user.id);
  const prices = latestSnapshots(league);
  const resolved = resolveRates(league);
  if (!resolved) {
    return NextResponse.json({ rates: null, candidates: [], note: "no exalt/chaos price yet — poll first" });
  }
  const cx = loadCxMarketView(league, prices);
  let scored = scoreAll(prices, resolved.rates, cx);
  if (q) scored = scored.filter((c) => c.item.toLowerCase().includes(q));
  return NextResponse.json({
    rates: resolved.rates,
    ratesSource: resolved.source,
    ratesFetchedAt: resolved.fetchedAt,
    fetchedAt: latestFetchedAt(league),
    cx: cxSummary(league, cx),
    candidates: scored.slice(0, limit),
  });
}

const SeedBody = z.object({ perCategory: z.number().int().positive().max(10).optional() });

/** POST /api/discover { perCategory? } → auto-add top-N flipScore items per category to watchlist. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = SeedBody.safeParse(await req.json().catch(() => ({})));
  const perCat = body.success ? (body.data.perCategory ?? 2) : 2;

  const league = leagueForUser(user.id);
  const prices = latestSnapshots(league);
  const resolved = resolveRates(league);
  if (!resolved) {
    return NextResponse.json({ error: "no exalt/chaos price yet — poll first" }, { status: 409 });
  }

  const scored = scoreAll(prices, resolved.rates, loadCxMarketView(league, prices)); // worthScore desc
  const perCount = new Map<string, number>();
  const added: Array<{ itemId: string; item: string; category: string }> = [];

  for (const c of scored) {
    const n = perCount.get(c.category) ?? 0;
    if (n >= perCat) continue;
    perCount.set(c.category, n + 1);
    addWatch(user.id, { itemId: c.itemId, itemName: c.item, category: c.category });
    added.push({ itemId: c.itemId, item: c.item, category: c.category });
  }

  return NextResponse.json({ added, perCategory: perCat });
}
