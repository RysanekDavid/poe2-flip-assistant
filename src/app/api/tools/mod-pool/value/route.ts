import { NextResponse } from "next/server";
import { TradeRateLimitedError } from "../../../../../api/tradeErrors";
import { withCredStatus } from "../../../../../auth/credStatus";
import { getCurrentUser } from "../../../../../auth/session";
import { getCallerCred } from "../../../../../auth/tradeCred";
import { getDefaultLeague } from "../../../../../core/leagueState";
import { RatesUnavailableError } from "../../../../../core/tools/craftmoves/moves";
import { LIVE_VALUES_PER_HOUR, liveLimiter, spendReserved } from "../../../../../core/tools/modpool/liveLimit";
import { lookupFamilyValue, valueFamily } from "../../../../../core/tools/modpool/load";
import { ModNotSearchableError, UnknownBaseError } from "../../../../../core/tools/modpool/pool";
import { StatCatalogUnavailableError } from "../../../../../core/tools/modpool/statIndex";
import { modValueRequestSchema, modValueResponseSchema } from "../../../../../lib/tools/modPoolContract";
import { tradeErrorResponse } from "../../../../../lib/tradeRouteError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const retryResponse = (status: 429 | 503, error: string, retryAfterSec: number): Response =>
  NextResponse.json({ error, retryAfterSec }, { status, headers: { "Retry-After": String(retryAfterSec) } });

/** Thrown before any trade2 request leaves the process: these never count against the user. */
const notSpent = (e: unknown): boolean => e instanceof TradeRateLimitedError || e instanceof RatesUnavailableError;

function errorResponse(e: unknown): Response {
  if (e instanceof UnknownBaseError) return NextResponse.json({ error: e.message }, { status: 404 });
  if (e instanceof ModNotSearchableError) return NextResponse.json({ error: e.message }, { status: 422 });
  if (e instanceof StatCatalogUnavailableError) return retryResponse(503, e.message, e.retryAfterSec);
  if (e instanceof RatesUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
  return tradeErrorResponse(e);
}

/**
 * POST /api/tools/mod-pool/value { itemClass, base, ilvl, family, side, statId? } → live value of rare
 * items on that base carrying the family's top reachable tier. The tier comes from the catalog and a
 * searched stat is always the server's own resolution — never the client's — because the result is
 * cached for everyone.
 *
 * A fresh shared cache hit answers free: no credential, no trade2 request, no per-user count. A miss
 * spends ONE search + ONE fetch with the caller's own POESESSID through the web limiter: no stored
 * cookie → 409, over LIVE_VALUES_PER_HOUR for this user (one window shared with Opportunities live
 * listings) → 429 + Retry-After, busy shared budget or
 * trade2 stat catalog down → 503 + Retry-After.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = modValueRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  try {
    const now = Date.now();
    const found = await lookupFamilyValue(body.data, getDefaultLeague(), now);
    if (found.kind === "hit") return NextResponse.json(modValueResponseSchema.parse(found.response));
    const cred = await getCallerCred();
    if (!cred) {
      return NextResponse.json({ error: "no POESESSID stored — add your session cookie in Settings to value live" }, { status: 409 });
    }
    const slot = liveLimiter.reserve(user.id);
    if (!slot.allowed) {
      const error = `live lookups are capped at ${LIVE_VALUES_PER_HOUR} searches per hour per user, shared with Opportunities live listings`;
      return retryResponse(429, error, slot.retryAfterSec);
    }
    // record what this trade2 call says about the caller's stored POESESSID (403 → expired banner)
    const value = await spendReserved(slot, notSpent, () =>
      withCredStatus(user.id, cred, () => valueFamily(body.data, found.target, cred, now)),
    );
    return NextResponse.json(modValueResponseSchema.parse(value));
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
