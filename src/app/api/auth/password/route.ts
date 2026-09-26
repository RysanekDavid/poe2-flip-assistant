import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "../../../../auth/session";
import { setSessionCookie } from "../../../../auth/sessionCookie";
import { clientIp, loginRateLimiter, loginRateLimitKey } from "../../../../auth/loginRateLimit";
import { authenticate, setPassword } from "../../../../db/userQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  current: z.string().min(1).max(1024),
  next: z.string().min(8, "new password must be at least 8 characters").max(1024),
});

/**
 * POST /api/auth/password { current, next } → change the logged-in user's password.
 * Revokes every other session; this browser gets a fresh cookie so the user stays logged in.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  // Shares the login budget: a hijacked session must not become an unthrottled password oracle.
  const key = loginRateLimitKey(clientIp(req.headers), user.name);
  const gate = loginRateLimiter.check(key);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "too many failed attempts — try again later" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }
  loginRateLimiter.recordFailure(key);
  // re-verify the current password by name (authenticate is the only verify path)
  if (!(await authenticate(user.name, parsed.data.current))) {
    return NextResponse.json({ error: "current password is incorrect" }, { status: 403 });
  }
  loginRateLimiter.recordSuccess(key);
  await setPassword(user.id, parsed.data.next);
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, user.id);
  return res;
}
