import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { loadOpportunities } from "../../../../core/opportunities/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/opportunities → Market › Opportunities: the viewer's still-live snipe cards, the
 * scan's best near-misses and rising uniques, all inside a budget taken from their latest net worth.
 * Reads stored data only (no trade2 request). A scout failure fails the rising section alone, with
 * its reason; anything else (DB, contract) answers 500 with its message.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await loadOpportunities(user.id));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[opportunities] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
