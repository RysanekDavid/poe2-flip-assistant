import { NextResponse } from "next/server";
import { z } from "zod";
import { searchListings } from "../../../../api/tradeClient";
import { getCallerCred } from "../../../../auth/tradeCred";
import { latestSnapshots } from "../../../../db/queries";
import { deriveRates, toDivine, type Currency, type ExchangeRates } from "../../../../core/priceEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ type: z.string().min(1) });
const CCY: Record<string, Currency> = { divine: "DIVINE", exalted: "EXALT", chaos: "CHAOS" };

// group mod tiers together: "+2 to Level of all Spell Skills" → "+# to Level of all Spell Skills"
const normMod = (m: string) => String(m).replace(/[+-]?\d+(?:\.\d+)?/g, "#");

/**
 * POST /api/craft/mods { type } → "what sells" scan. Pulls the most expensive rare items
 * of this base, reads their mods, and aggregates which bonuses show up on the high-end —
 * the reverse of the ladder: it tells you what to craft TOWARD. Read-only.
 */
export async function POST(req: Request): Promise<Response> {
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "POESESSID not set — add your session cookie in Settings" }, { status: 409 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const rates: ExchangeRates | null = deriveRates(latestSnapshots());
  if (!rates) return NextResponse.json({ error: "no rates yet — poll prices first" }, { status: 409 });

  try {
    // most-expensive-first: the top end shows which mods carry value
    const { total, listings } = await searchListings({ type: parsed.data.type, rarity: "rare" }, 30, "desc", cred);
    const priceDiv = (l: (typeof listings)[number]) => {
      const c = l.price ? CCY[l.price.currency] : undefined;
      return l.price && c ? toDivine(l.price.amount, c, rates) : null;
    };

    // aggregate mods across the priced sample
    const agg = new Map<string, { count: number; prices: number[] }>();
    const preview: Array<{ priceDiv: number; mods: string[]; name: string; icon: string | null }> = [];
    for (const l of listings) {
      const pd = priceDiv(l);
      if (pd == null) continue;
      preview.push({ priceDiv: pd, mods: l.mods, name: l.itemName, icon: l.icon });
      for (const norm of new Set(l.mods.map(normMod))) {
        const e = agg.get(norm) ?? { count: 0, prices: [] };
        e.count++;
        e.prices.push(pd);
        agg.set(norm, e);
      }
    }

    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] ?? null;
    const modStats = [...agg.entries()]
      .map(([mod, e]) => ({ mod, count: e.count, medianDiv: median(e.prices), maxDiv: Math.max(...e.prices) }))
      .sort((a, b) => b.count - a.count || (b.medianDiv ?? 0) - (a.medianDiv ?? 0))
      .slice(0, 25);

    return NextResponse.json({
      total,
      sampled: preview.length,
      modStats,
      preview: preview.slice(0, 12),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
