import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "./auth";
import { getUserById, getUserByApiKey, type UserRow } from "../db/userQueries";

/**
 * Server-side auth resolution for route handlers (node runtime only).
 *  - getCurrentUser: the logged-in web user, from the signed session cookie
 *  - getAgentUser:   the local agent, from a Bearer api_key (balance/hunt push)
 *
 * Both return null when unauthenticated; routes decide whether that's a 401.
 * The edge middleware can only check signature + expiry; revocation (session_version) is
 * enforced here, where the database is reachable.
 */
export async function getCurrentUser(): Promise<UserRow | null> {
  const jar = await cookies();
  return resolveSessionUser(jar.get(SESSION_COOKIE)?.value);
}

/** Token → user, rejecting tokens signed before the user's latest session revocation. */
export function resolveSessionUser(token: string | undefined | null): UserRow | null {
  const session = verifySession(token);
  if (session == null) return null;
  const user = getUserById(session.uid);
  if (!user || user.session_version !== session.ver) return null;
  return user;
}

/** Resolve the local agent from an `Authorization: Bearer pk_...` header. */
export function getAgentUser(req: Request): UserRow | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(pk_[a-f0-9]+)$/i);
  if (!m) return null;
  return getUserByApiKey(m[1]!) ?? null;
}
