import { NextResponse } from "next/server";
import { clearSessionCookie } from "../../../../auth/sessionCookie";

export const runtime = "nodejs";

/** POST /api/auth/logout → clear this browser's session cookie (other devices stay logged in). */
export function POST(): Response {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
