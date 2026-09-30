import { NextResponse } from "next/server";
import { searchListingsLinked } from "../../../../../api/tradeClient";
import { TradeRateLimitedError } from "../../../../../api/tradeErrors";
import { withCredStatus } from "../../../../../auth/credStatus";
import { getCurrentUser } from "../../../../../auth/session";
import { getCallerCred } from "../../../../../auth/tradeCred";
import { getDefaultLeague } from "../../../../../core/leagueState";
import { listingsCache, listingsKey, lookupListings } from "../../../../../core/opportunities/listings";
import { LIVE_VALUES_PER_HOUR, liveLimiter } from "../../../../../core/tools/modpool/liveLimit";
import { LIVE_LISTINGS_SHOWN, listingsQuerySchema, listingsResponseSchema } from "../../../../../lib/opportunitiesContract";
import { tradeErrorResponse } from "../../../../../lib/tradeRouteError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The shared budget refused before anything left the process: not a spent search. */
const notSpent = (e: unknown): boolean => e instanceof TradeRateLimitedError;

/**
 * GET /api/market/opportunities/listings?name=<unique>&base=<base type> → the cheapest live listings
 * of one unique, read-only (the player buys by hand). A fresh shared cache hit is free. A miss spends
 * ONE search + ONE fetch with the caller's own POESESSID through the shared governor: no stored
 * cookie → 409, over LIVE_VALUES_PER_HOUR for this user (one window shared with Mod pool live values)
 * → 429 + Retry-After, busy shared budget →
 * 503 + Retry-After. Default league only: trade2 searches search it.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const q = listingsQuerySchema.safeParse({ name: params.get("name") ?? "", base: params.get("base") ?? undefined });
  if (!q.success) return NextResponse.json({ error: q.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const { name, base } = q.data;
  const league = getDefaultLeague();
  try {
    const cred = await getCallerCred();
    const out = await lookupListings(
      { userId: user.id, key: listingsKey(league, name, base), name, nowMs: Date.now() },
      {
        cache: listingsCache,
        limiter: liveLimiter,
        cred,
        notSpent,
        // record what this call says about the caller's stored POESESSID (403 → expired banner)
        search: (c) => withCredStatus(user.id, c, () => searchListingsLinked({ name, type: base || undefined, online: true }, LIVE_LISTINGS_SHOWN, c)),
      },
    );
    if (out.kind === "no-cred") {
      return NextResponse.json({ error: "no POESESSID stored — add your session cookie in Settings to see live listings" }, { status: 409 });
    }
    if (out.kind === "limited") {
      const error = `live lookups are capped at ${LIVE_VALUES_PER_HOUR} searches per hour per user, shared with Mod pool live values`;
      return NextResponse.json({ error, retryAfterSec: out.retryAfterSec }, { status: 429, headers: { "Retry-After": String(out.retryAfterSec) } });
    }
    return NextResponse.json(listingsResponseSchema.parse(out.body));
  } catch (e: unknown) {
    return tradeErrorResponse(e);
  }
}
