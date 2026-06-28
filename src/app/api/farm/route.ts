import { NextResponse } from "next/server";
import { latestSnapshots, latestFetchedAt } from "../../../db/queries";
import { rankFarms } from "../../../core/farmAdvisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/farm → ranked "what to farm now" activities by basket heat (momentum × liquidity). */
export function GET(): Response {
  const farms = rankFarms(latestSnapshots());
  return NextResponse.json({ farms, fetchedAt: latestFetchedAt() });
}
