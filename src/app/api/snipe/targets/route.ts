import { NextResponse } from "next/server";
import { fetchDemand } from "../../../../api/scoutClient";
import { rankSnipeTargets } from "../../../../core/snipeTargets";
import { getCurrentUser } from "../../../../auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/snipe/targets → auto-picked valuable, medium-volume items worth watching for snipes.
 * No manual entry: ranked from poe2scout demand (value × liquidity × momentum). Each target
 * carries a price-ascending trade2 deep-link — open it, the cheapest live listing (where a
 * snipe sits) is at the top, and you buy manually (ToS-safe).
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { items, rates } = await fetchDemand();
    // No deep-link here: the trade site ignores `?q=`. The client fetches live listings +
    // a working id-based link lazily per target via /api/snipe/listings (one trade2 POST
    // per click, not 30 on load — rate-limit safe).
    const targets = rankSnipeTargets(items, rates.exaltPerDivine).slice(0, 30);
    return NextResponse.json({ targets });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
