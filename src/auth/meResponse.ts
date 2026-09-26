import { NextResponse } from "next/server";
import { resolveSessionUser } from "./session";
import { clearSessionCookie } from "./sessionCookie";

/**
 * Body of GET /api/auth/me for a raw session token. A cookie that no longer resolves (revoked by
 * "log out everywhere" / password change, or its user deleted) is cleared here: the edge
 * middleware only checks the signature, so without this a revoked browser would keep passing the
 * page gate. Kept out of the route file so tests can drive it without Next's request context.
 */
export function meResponse(token: string | undefined): Response {
  const user = resolveSessionUser(token);
  const res = NextResponse.json({ user: user ? { id: user.id, name: user.name, role: user.role } : null });
  if (token && !user) clearSessionCookie(res);
  return res;
}
