import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { clearSessionCookie } from "../../../../auth/sessionCookie";
import { bumpSessionVersion } from "../../../../db/userQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout-all → revoke every session of the logged-in user, on every device,
 * including this one. The agent API key is a separate credential and is not affected.
 */
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  bumpSessionVersion(user.id);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
