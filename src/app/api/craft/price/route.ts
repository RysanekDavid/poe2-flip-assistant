import { NextResponse } from "next/server";
import { z } from "zod";
import { searchListings, type Listing } from "../../../../api/tradeClient";
import { getCallerCred } from "../../../../auth/tradeCred";
import { latestSnapshots } from "../../../../db/queries";
import { deriveRates, toDivine, type Currency, type ExchangeRates } from "../../../../core/priceEngine";
import type { TradeQuery } from "../../../../lib/tradeLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const StatF = z.object({ id: z.string(), min: z.number().optional(), max: z.number().optional() });
const Query = z.object({
  type: z.string().optional(),
  name: z.string().optional(),
  rarity: z.enum(["normal", "magic", "rare", "unique"]).optional(),
  maxPrice: z.object({ amount: z.number(), currency: z.enum(["divine", "exalted", "chaos"]) }).optional(),
  stats: z.array(StatF).optional(),
});
const Body = z.object({ buy: Query.optional(), sell: Query.optional() });

const MAX_RUNGS = 6;

const CCY: Record<string, Currency> = { divine: "DIVINE", exalted: "EXALT", chaos: "CHAOS" };

interface SideStats {
  total: number; // total market listings matching
  sampled: number; // how many we priced (≤10, cheapest-first)
  minDiv: number | null; // cheapest in Divine
  medianDiv: number | null; // median of the sampled, in Divine
  minRaw: { amount: number; currency: string } | null; // cheapest as listed
}

function summarize(listings: Listing[], total: number, rates: ExchangeRates): SideStats {
  const divs = listings
    .map((l) => {
      const c = l.price ? CCY[l.price.currency] : undefined;
      return l.price && c ? toDivine(l.price.amount, c, rates) : null;
    })
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b);
  const first = listings.find((l) => l.price && CCY[l.price.currency]);
  return {
    total,
    sampled: divs.length,
    minDiv: divs.length ? divs[0]! : null,
    medianDiv: divs.length ? divs[Math.floor((divs.length - 1) / 2)]! : null,
    minRaw: first?.price ?? null,
  };
}

/**
 * POST /api/craft/price { buy?, sell? } → live trade2 price-check for a craft plan.
 * Read-only: searches cheapest-first and prices the sample. The user still buys manually.
 */
export async function POST(req: Request): Promise<Response> {
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "POESESSID not set — add your session cookie in Settings" }, { status: 409 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const rates = deriveRates(latestSnapshots());
  if (!rates) return NextResponse.json({ error: "no rates yet — poll prices first" }, { status: 409 });

  try {
    const run = async (q?: TradeQuery): Promise<SideStats | null> => {
      if (!q?.type && !q?.name) return null;
      const { total, listings } = await searchListings(q, 10, "asc", cred);
      return summarize(listings, total, rates);
    };
    const buy = await run(parsed.data.buy as TradeQuery | undefined);

    // sell ladder: require the first 1, 2, 3… mods (each at its min) and price each rung.
    // Stacking mods filters out the 1-ex dump listings, so median climbs realistically.
    const sell = parsed.data.sell;
    const allStats = (sell?.stats ?? []).slice(0, MAX_RUNGS);
    const ladder: Array<SideStats & { n: number }> = [];
    if (sell?.type && allStats.length) {
      for (let n = 1; n <= allStats.length; n++) {
        const q: TradeQuery = { type: sell.type, rarity: "rare", stats: allStats.slice(0, n) };
        const { total, listings } = await searchListings(q, 10, "asc", cred);
        ladder.push({ n, ...summarize(listings, total, rates) });
      }
    } else if (sell?.type) {
      // no mods chosen — just price the bare rare base
      const { total, listings } = await searchListings({ type: sell.type, rarity: "rare" }, 10, "asc", cred);
      ladder.push({ n: 0, ...summarize(listings, total, rates) });
    }

    const top = ladder[ladder.length - 1];
    const marginDiv = buy?.minDiv != null && top?.medianDiv != null ? top.medianDiv - buy.minDiv : null;
    return NextResponse.json({ buy, ladder, marginDiv });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
