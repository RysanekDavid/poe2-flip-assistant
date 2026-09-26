import { NextResponse } from "next/server";
import { getHits, markHitsSeen } from "../../../../db/huntQueries";
import { getCurrentUser } from "../../../../auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hunts/hits → this user's recent live listings found by hunts. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ hits: getHits(user.id, 100) });
}

/** PATCH /api/hunts/hits → mark this user's hits seen. */
export async function PATCH(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const ids: number[] = Array.isArray(b?.ids) ? b.ids.map(Number) : [];
  markHitsSeen(user.id, ids);
  return NextResponse.json({ ok: true });
}
