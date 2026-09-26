import { NextResponse } from "next/server";
import { z } from "zod";
import { getAlerts, markAlertsSeen } from "../../../db/alertQueries";
import { getCurrentUser } from "../../../auth/session";
import { leagueForUser } from "../../../core/leagueUsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/alerts?unseen=1 → this user's alert feed for the league they are viewing */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const unseen = new URL(req.url).searchParams.get("unseen") === "1";
  return NextResponse.json({ alerts: getAlerts(user.id, leagueForUser(user.id), unseen, 100) });
}

const SeenBody = z.object({ ids: z.array(z.number().int()) });

/** POST /api/alerts { ids: number[] } → mark this user's alerts seen */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = SeenBody.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues }, { status: 400 });
  }
  markAlertsSeen(user.id, body.data.ids);
  return NextResponse.json({ ok: true });
}
