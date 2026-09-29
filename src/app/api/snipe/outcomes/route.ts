import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { getDefaultLeague } from "../../../../core/leagueState";
import { SNIPE_PROFILES } from "../../../../core/snipeProfiles";
import { buildOutcomesResponse } from "../../../../core/snipeOutcomes/view";
import { getFetchMethodState, outcomesSince } from "../../../../db/snipeOutcomeQueries";
import { SnipeOutcomesResponseSchema } from "../../../../lib/snipeOutcomeContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const MAX_ROWS = 1000;

/**
 * GET → what happened to alerted snipes: per-listing checkpoints (the alert cards' chips) and
 * per-archetype hit rates for the scanner's league. Shared market data, no trade2 calls; any
 * signed-in user may read it. Takes no parameters.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const nowMs = Date.now();
  const rows = outcomesSince(nowMs - WINDOW_DAYS * 24 * 3_600_000, MAX_ROWS);
  const labels = new Map(SNIPE_PROFILES.map((p) => [p.key, p.label] as const));
  const body = buildOutcomesResponse(rows, { league: getDefaultLeague(), windowDays: WINDOW_DAYS, labels, fetchMethod: getFetchMethodState() });
  return NextResponse.json(SnipeOutcomesResponseSchema.parse(body));
}
