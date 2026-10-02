import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { loadCraftCatalog } from "../../../../core/tools/craftmoves/catalog";
import { plannerCatalog, plannerPool } from "../../../../core/tools/planner/load";
import { UnknownPlannerBaseError } from "../../../../core/tools/planner/targets";
import { plannerCatalogSchema, plannerPoolQuerySchema, plannerPoolSchema, type PlannerCatalog, type PlannerPool } from "../../../../lib/tools/craftPlannerContract";
import { createTtlCache } from "../../../../lib/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// the answer only changes with the committed catalog, so its sha is part of every key
const CATALOG_CACHE = createTtlCache<PlannerCatalog>(60 * 60_000, 2);
const POOL_CACHE = createTtlCache<PlannerPool>(60 * 60_000, 64);

/**
 * GET /api/tools/craft-planner → the planner's classes, bases (implicits, caps, quality cap) and
 * catalysts. GET ?class&base → what that base can carry: natural families per side with their full
 * tier ladders, essence-only mods and desecrated families. Spends nothing (committed catalog only).
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cat = loadCraftCatalog();
  const params = new URL(req.url).searchParams;
  if (!params.has("class") && !params.has("base")) {
    return NextResponse.json(plannerCatalogSchema.parse(CATALOG_CACHE.get(cat.sourceSha256, () => plannerCatalog(cat))));
  }
  const query = plannerPoolQuerySchema.safeParse({ itemClass: params.get("class") ?? undefined, base: params.get("base") ?? undefined });
  if (!query.success) return NextResponse.json({ error: query.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  try {
    const key = `${cat.sourceSha256}|${query.data.itemClass}|${query.data.base}`;
    const pool = POOL_CACHE.get(key, () => plannerPool(query.data.itemClass, query.data.base, cat));
    // validated on the way out: a drift between core and contract fails here, not in the browser
    return NextResponse.json(plannerPoolSchema.parse(pool));
  } catch (e: unknown) {
    if (e instanceof UnknownPlannerBaseError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
