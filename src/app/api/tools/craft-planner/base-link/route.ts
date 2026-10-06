import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { fetchTradeMeta } from "../../../../../api/tradeMeta";
import { leagueForUser } from "../../../../../core/leagueUsers";
import { loadCraftCatalog } from "../../../../../core/tools/craftmoves/catalog";
import { buildBaseLink, statCatalogs, type StatCatalogs } from "../../../../../core/tools/planner/baseLink";
import { baseLinkRequestSchema, baseLinkResponseSchema } from "../../../../../lib/tools/craftPlannerContractStart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// fetchTradeMeta hands back the same snapshot for 24 h; index it once per snapshot
let indexed: { at: number; idx: StatCatalogs } | null = null;

/**
 * POST /api/tools/craft-planner/base-link { itemClass, base, ilvl, rarity, carried[] } → { url,
 * unmatched }: a prefilled trade2 search for the base the player buys (the planner's "a base I buy
 * with …" start). Reads only the cached trade2 reference data; no search is run, so it costs none
 * of the trade2 search budget. 400 bad body · 401 · 502 reference data unavailable.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = baseLinkRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  let idx: StatCatalogs;
  try {
    const meta = await fetchTradeMeta();
    if (!indexed || indexed.at !== meta.at) indexed = { at: meta.at, idx: statCatalogs(meta.stats, meta.flaggedStats) };
    idx = indexed.idx;
  } catch (error: unknown) {
    console.error("[craft-planner] trade2 reference data load failed", error);
    const why = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `trade2 reference data unavailable: ${why}` }, { status: 502 });
  }
  const link = buildBaseLink(loadCraftCatalog(), idx, leagueForUser(user.id), parsed.data);
  return NextResponse.json(baseLinkResponseSchema.parse(link));
}
