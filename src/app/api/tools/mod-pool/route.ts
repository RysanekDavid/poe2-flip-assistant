import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { getDefaultLeague } from "../../../../core/leagueState";
import { loadModPool, loadPoolCatalog } from "../../../../core/tools/modpool/load";
import { UnknownBaseError } from "../../../../core/tools/modpool/pool";
import { modPoolGetResponseSchema, modPoolQuerySchema } from "../../../../lib/tools/modPoolContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tools/mod-pool → the base picker's class → base list.
 * GET /api/tools/mod-pool?class&base&ilvl&rarity → every family the base rolls at that ilvl, its
 * floors, the price-book signal and any fresh shared live value. Spends NO trade2 search.
 *
 * League: the default league, like the other craft tools — the live search (default league) and the
 * book must price the same economy.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  if (!params.has("class") && !params.has("base")) {
    return NextResponse.json(modPoolGetResponseSchema.parse(loadPoolCatalog()));
  }
  const query = modPoolQuerySchema.safeParse({
    itemClass: params.get("class") ?? undefined,
    base: params.get("base") ?? undefined,
    ilvl: params.get("ilvl") ?? undefined,
    rarity: params.get("rarity") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: query.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  try {
    const pool = await loadModPool(query.data, getDefaultLeague(), Date.now());
    // validated on the way out: a drift between core and contract fails here, not in the browser
    return NextResponse.json(modPoolGetResponseSchema.parse(pool));
  } catch (e: unknown) {
    if (e instanceof UnknownBaseError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
