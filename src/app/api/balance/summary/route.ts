import { NextResponse } from "next/server";
import { balanceStats } from "../../../../db/queries";
import { getCurrentUser } from "../../../../auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/balance/summary → just the header-chip numbers (full data lives on /api/balance). */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stats = balanceStats(user.id);
  return NextResponse.json({
    netWorthDiv: stats.latest?.net_worth_div ?? null,
    change24hPct: stats.change24hPct,
    at: stats.latest?.fetched_at ?? null,
  });
}
