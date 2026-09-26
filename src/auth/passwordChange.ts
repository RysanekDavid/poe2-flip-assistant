import { NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "./sessionCookie";
import { clientIp, loginRateLimiter, loginRateLimitKey } from "./loginRateLimit";
import { authenticate, setPassword, type UserRow } from "../db/userQueries";

const Body = z.object({
  current: z.string().min(1).max(1024),
  next: z.string().min(8, "new password must be at least 8 characters").max(1024),
});

/**
 * Password change for an already-resolved user. Lives outside the route file so tests can drive
 * it without Next's request context (the route resolves the user from the cookie first).
 */
export async function changePassword(req: Request, user: UserRow): Promise<Response> {
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
