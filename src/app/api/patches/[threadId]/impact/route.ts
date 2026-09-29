import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { config } from "../../../../../config/env";
import { getDefaultLeague } from "../../../../../core/leagueState";
import { patchImpactMemo } from "../../../../../core/patchImpact/impact";
import { loadCraftCatalog } from "../../../../../core/tools/craftmoves/catalog";
import { patchImpactParamsSchema, patchImpactResponseSchema } from "../../../../../lib/patchImpactContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ threadId: string }>;
}

/**
 * GET /api/patches/:threadId/impact → exchange items the patch names and their price moves at
 * +24h/+72h/+7d from stored snapshots. Shared market data, so any signed-in user may read it.
 */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = patchImpactParamsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const impact = patchImpactMemo(params.data.threadId, {
    nowMs: Date.now(),
    retentionDays: config.retentionDays,
    fallbackLeague: getDefaultLeague(),
    bases: Object.keys(loadCraftCatalog().bases),
  });
  if (!impact) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(patchImpactResponseSchema.parse(impact));
}
