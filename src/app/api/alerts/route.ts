import { NextResponse } from "next/server";
import { z } from "zod";
import { getAlertCounts, getAlertFeed, markVisibleSeen } from "../../../db/alertQueries";
import { tickerMutedTypes } from "../../../db/notifyQueries";
import { getCurrentUser } from "../../../auth/session";
import { leagueForUser } from "../../../core/leagueUsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/alerts → the alert center for the league this user views: the newest alerts of each
 * type, exact per-type counts, and the types this user muted in the ticker. One endpoint so the
 * whole page shares a single poll.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const league = leagueForUser(user.id);
  return NextResponse.json({
    alerts: getAlertFeed(user.id, league),
    counts: getAlertCounts(user.id, league),
    tickerMuted: tickerMutedTypes(user.id),
  });
}

const SeenBody = z.union([z.object({ type: z.string().regex(/^[A-Z_]{2,32}$/) }), z.object({ all: z.literal(true) })]);

/** POST /api/alerts { type } | { all: true } → mark this user's visible alerts seen */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = SeenBody.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues }, { status: 400 });
  }
  markVisibleSeen(user.id, leagueForUser(user.id), "type" in body.data ? body.data.type : null);
  return NextResponse.json({ ok: true });
}
