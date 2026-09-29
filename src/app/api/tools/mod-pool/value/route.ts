import { NextResponse } from "next/server";
import { withCredStatus } from "../../../../../auth/credStatus";
import { getCurrentUser } from "../../../../../auth/session";
import { getCallerCred } from "../../../../../auth/tradeCred";
import { getDefaultLeague } from "../../../../../core/leagueState";
import { RatesUnavailableError } from "../../../../../core/tools/craftmoves/moves";
import { cachedFamilyValue, liveTargetFor, valueFamily } from "../../../../../core/tools/modpool/load";
import { ModNotSearchableError, UnknownBaseError } from "../../../../../core/tools/modpool/pool";
import { modValueRequestSchema, modValueResponseSchema } from "../../../../../lib/tools/modPoolContract";
import { tradeErrorResponse } from "../../../../../lib/tradeRouteError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tools/mod-pool/value { itemClass, base, ilvl, family, side } → live value of rare items
 * on that base carrying the family's top reachable tier. The stat and roll are recomputed from the
 * catalog here — never taken from the client — because the result is cached for everyone.
 *
 * A fresh shared cache hit answers without a credential or a trade2 request. A miss spends ONE
 * search + ONE fetch with the caller's own POESESSID through the web limiter: no stored cookie →
 * 409, busy shared budget → 503 + Retry-After.
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
    const target = await liveTargetFor(body.data, getDefaultLeague());
    const hit = cachedFamilyValue(body.data, target, now);
    if (hit) return NextResponse.json(modValueResponseSchema.parse(hit));
    const cred = await getCallerCred();
    if (!cred) {
      return NextResponse.json({ error: "no POESESSID stored — add your session cookie in Settings to value live" }, { status: 409 });
    }
    // record what this trade2 call says about the caller's stored POESESSID (403 → expired banner)
    const value = await withCredStatus(user.id, cred, () => valueFamily(body.data, target, cred, now));
    return NextResponse.json(modValueResponseSchema.parse(value));
  } catch (e: unknown) {
    if (e instanceof UnknownBaseError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ModNotSearchableError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof RatesUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    return tradeErrorResponse(e);
  }
}
