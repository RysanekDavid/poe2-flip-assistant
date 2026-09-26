import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "../../../../db/userQueries";
import { setSessionCookie } from "../../../../auth/sessionCookie";
import { clientIp, loginRateLimiter, loginRateLimitKey } from "../../../../auth/loginRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().min(1).max(200), password: z.string().min(1).max(1024) });

/** POST /api/auth/login → verify credentials, set the signed session cookie. */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const key = loginRateLimitKey(clientIp(req.headers), parsed.data.name);
  const gate = loginRateLimiter.check(key);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "too many failed logins — try again later" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }
  // Count the attempt before the (async) scrypt so a parallel burst can't slip past the gate;
  // a successful login clears the key again.
  loginRateLimiter.recordFailure(key);

  const u = await authenticate(parsed.data.name, parsed.data.password);
  if (!u) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  loginRateLimiter.recordSuccess(key);

  const res = NextResponse.json({ user: { id: u.id, name: u.name, role: u.role } });
  setSessionCookie(res, u.id);
  return res;
}
