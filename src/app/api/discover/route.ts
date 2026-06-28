import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "../../../config/env";
import { latestSnapshots, addWatch, latestFetchedAt } from "../../../db/queries";
import { getCurrentUser } from "../../../auth/session";
import { deriveRates, type ExchangeRates } from "../../../core/priceEngine";
import { scoreItem, type FlipRow } from "../../../core/flipModel";
import type { PricedItem } from "../../../api/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_IDS = new Set(["divine"]); // base unit — zero spread, not flippable vs itself

/** Score every liquid, non-base item, ranked by flipScore (margin × turnover). */
function scoreAll(prices: PricedItem[], rates: ExchangeRates): FlipRow[] {
  return prices
    .filter((p) => !BASE_IDS.has(p.itemId) && p.volume >= config.minVolume && p.baseValue > 0)
    .map((p) => scoreItem(p, rates))
    .sort((a, b) => b.worthScore - a.worthScore);
}

/** GET /api/discover?limit=80&q=essence → market-wide flip scan; `q` searches the WHOLE market by name. */
export function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const limit = Math.min(Number(params.get("limit")) || 40, 2000);
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const prices = latestSnapshots();
  const rates = deriveRates(prices);
  if (!rates) {
    return NextResponse.json({ rates: null, candidates: [], note: "no exalt/chaos price yet — poll first" });
  }
  let scored = scoreAll(prices, rates);
  if (q) scored = scored.filter((c) => c.item.toLowerCase().includes(q));
  return NextResponse.json({ rates, fetchedAt: latestFetchedAt(), candidates: scored.slice(0, limit) });
}

const SeedBody = z.object({ perCategory: z.number().int().positive().max(10).optional() });

/** POST /api/discover { perCategory? } → auto-add top-N flipScore items per category to watchlist. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = SeedBody.safeParse(await req.json().catch(() => ({})));
  const perCat = body.success ? (body.data.perCategory ?? 2) : 2;

  const prices = latestSnapshots();
  const rates = deriveRates(prices);
  if (!rates) {
    return NextResponse.json({ error: "no exalt/chaos price yet — poll first" }, { status: 409 });
  }

  const scored = scoreAll(prices, rates); // flipScore desc
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
