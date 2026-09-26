import { NextResponse } from "next/server";
import { tradeErrorResponse } from "../../../../lib/tradeRouteError";
import { searchListingsLinked } from "../../../../api/tradeClient";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/snipe/listings?name=<unique> → live cheapest listings for a snipe target,
 * fetched straight from the trade2 API so the user sees real prices + mods IN-APP, plus
 * a WORKING trade-site link (id-based — the `?q=` deep-link the site ignores is gone).
 *
 * Needs POESESSID (residential IP / local only). Read-only: we list, the human buys.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json(
      { error: "POESESSID not set — add your session cookie in Settings to see live listings." },
      { status: 503 },
    );
  }

  const name = new URL(req.url).searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ error: "missing ?name" }, { status: 400 });

  try {
    const { total, listings, searchUrl } = await searchListingsLinked({ name, online: true }, 10, cred);
    return NextResponse.json({
      total,
      searchUrl,
      listings: listings.map((l) => ({
        price: l.price,
        account: l.account,
        online: l.online,
        indexed: l.indexed,
        mods: l.mods,
      })),
    });
  } catch (e) {
    return tradeErrorResponse(e);
  }
}
