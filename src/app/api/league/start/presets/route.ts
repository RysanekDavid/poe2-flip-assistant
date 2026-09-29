import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { applySellNowPreset } from "../../../../../core/cx/leagueStart/preset";
import { leagueForUser } from "../../../../../core/leagueUsers";
import { leagueStartPresetResponseSchema } from "../../../../../lib/leagueStartContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/league/start/presets → add the top-10 sell-now items of the caller's league to the
 * caller's own watchlist, so its spread/trend alerts cover them. Items already watched in this
 * league keep their thresholds and prices. 409 when the mode is off or has no sell-now item.
 */
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const outcome = applySellNowPreset(user.id, leagueForUser(user.id), Date.now());
  if (outcome.kind === "nothing") return NextResponse.json({ error: outcome.reason }, { status: 409 });
  return NextResponse.json(leagueStartPresetResponseSchema.parse(outcome.body), { status: 201 });
}
