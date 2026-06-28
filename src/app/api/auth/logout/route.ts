import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../../auth/auth";

export const runtime = "nodejs";

/** POST /api/auth/logout → clear the session cookie. */
export function POST(): Response {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
