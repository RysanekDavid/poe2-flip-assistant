import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";
import { getDefaultLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";
import { pickRepriceCandidates, REPRICE_MIN_ASK_DIV } from "../../../../core/wealth/repriceScan";
import { latestStashItems } from "../../../../db/balanceItemQueries";
import { getRepriceRun, markRepriceRequested, repriceNextAt, REPRICE_COOLDOWN_MS } from "../../../../db/listingCompsQueries";
import { requestScan } from "../../../../db/scanRequestQueries";
import { repriceResponseSchema } from "../../../../lib/wealthContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The request carries no parameters; anything else is a client bug worth a 400. */
const bodySchema = z.object({}).strict();

/** Empty body → {}; unparseable JSON → null, which fails the schema as a 400 instead of a 500. */
async function jsonOrEmpty(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch (e: unknown) {
    console.warn(`[wealth/reprice] rejected unparseable body: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * POST /api/wealth/reprice → queue a trade2 comparables check of the caller's own stale listings.
 * Only ENQUEUES (scan_request kind "reprice"): the poller runs it on its one trade2 limiter under
 * the user's cookie. A web route never searches trade2 itself — that would be a second limiter
 * spending the same account+IP budget blind. 6h cooldown per user (409 with nextAt).
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!bodySchema.safeParse(await jsonOrEmpty(req)).success) {
    return NextResponse.json({ error: "this request takes no parameters" }, { status: 400 });
  }
  const cred = await getCallerCred();
  if (!cred) return NextResponse.json({ error: "connect your POESESSID in Settings first" }, { status: 400 });

  const now = new Date();
  const nextAt = repriceNextAt(getRepriceRun(user.id), now.getTime());
  if (nextAt) {
    return NextResponse.json({ error: `checked recently — next check at ${nextAt.toISOString()}`, nextAt: nextAt.toISOString() }, { status: 409 });
  }
  const league = getDefaultLeague();
  const resolved = resolveRates(league);
  if (!resolved) return NextResponse.json({ error: `no exchange rates available for ${league}` }, { status: 409 });
  const candidates = pickRepriceCandidates(latestStashItems(user.id, league).items, resolved.rates, now.getTime());
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: `nothing to check — needs a listing asking ≥ ${REPRICE_MIN_ASK_DIV} div, listed over a day (unique or rare)` },
      { status: 409 },
    );
  }
  markRepriceRequested(user.id, now);
  requestScan("reprice", user.id);
  return NextResponse.json(repriceResponseSchema.parse({ queued: true, nextAt: new Date(now.getTime() + REPRICE_COOLDOWN_MS).toISOString() }));
}
