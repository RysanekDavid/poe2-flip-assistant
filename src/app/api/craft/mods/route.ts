import { NextResponse } from "next/server";
import { z } from "zod";
import { searchListings } from "../../../../api/tradeClient";
import type { Listing } from "../../../../api/tradeListing";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";
import { toDivine, type Currency, type ExchangeRates } from "../../../../core/priceEngine";
import { getDefaultLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";

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
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "POESESSID not set — add your session cookie in Settings" }, { status: 409 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  // tradeClient searches the app default league (one shared cred), so the listings must be
  // converted at THAT league's rates. Mixing in the viewer's rates would price a default-league
  // listing in a foreign economy. The response says which league it is, so the UI can label it.
  const league = getDefaultLeague();
  const rates: ExchangeRates | null = resolveRates(league)?.rates ?? null;
  if (!rates) return NextResponse.json({ error: `no rates for "${league}" yet — poll prices first` }, { status: 409 });

  try {
    // most-expensive-first: the top end shows which mods carry value
    const { total, listings } = await searchListings({ type: parsed.data.type, rarity: "rare" }, 30, "desc", cred);
    const rows = pricedSample(listings, rates);
    return NextResponse.json({
      computedLeague: league,
      total,
      sampled: rows.length,
      modStats: aggregateMods(rows),
      preview: rows.slice(0, 12),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

interface SampleRow {
  priceDiv: number;
  mods: string[];
  name: string;
  icon: string | null;
}

function median(xs: number[]): number | null {
  return [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] ?? null;
}

/**
 * The priced sample, with showcase noise dropped BEFORE aggregating: mirror-tab items with no
 * mods, classic 9999+ troll asks, and anything priced wildly above the sample median (the
 * "2000 Div helmet" that isn't for sale and poisons every mod's median).
 */
function pricedSample(listings: Listing[], rates: ExchangeRates): SampleRow[] {
  const rows: SampleRow[] = [];
  for (const l of listings) {
    const c = l.price ? CCY[l.price.currency] : undefined;
    const pd = l.price && c ? toDivine(l.price.amount, c, rates) : null;
    if (pd == null || l.mods.length === 0) continue;
    if (l.price && l.price.amount >= 9999) continue;
    rows.push({ priceDiv: pd, mods: l.mods, name: l.itemName, icon: l.icon });
  }
  const med = median(rows.map((r) => r.priceDiv));
  if (rows.length < 6 || med == null || med <= 0) return rows;
  return rows.filter((r) => r.priceDiv <= med * 25);
}

/** How often each normalized mod shows up on the high end, and at what price. */
function aggregateMods(rows: SampleRow[]): Array<{ mod: string; count: number; medianDiv: number | null; maxDiv: number }> {
  const agg = new Map<string, { count: number; prices: number[] }>();
  for (const r of rows) {
    for (const norm of new Set(r.mods.map(normMod))) {
      const e = agg.get(norm) ?? { count: 0, prices: [] };
      e.count++;
      e.prices.push(r.priceDiv);
      agg.set(norm, e);
    }
  }
  return [...agg.entries()]
    .map(([mod, e]) => ({ mod, count: e.count, medianDiv: median(e.prices), maxDiv: Math.max(...e.prices) }))
    .sort((a, b) => b.count - a.count || (b.medianDiv ?? 0) - (a.medianDiv ?? 0))
    .slice(0, 25);
}
