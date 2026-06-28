import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "./auth";
import { getUserById, getUserByApiKey, type UserRow } from "../db/userQueries";

/**
 * Server-side auth resolution for route handlers (node runtime only).
 *  - getCurrentUser: the logged-in web user, from the signed session cookie
 *  - getAgentUser:   the local agent, from a Bearer api_key (balance/hunt push)
 *
 * Both return null when unauthenticated; routes decide whether that's a 401.
 */
export async function getCurrentUser(): Promise<UserRow | null> {
  const jar = await cookies();
  const uid = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (uid == null) return null;
  return getUserById(uid) ?? null;
}

/** Resolve the local agent from an `Authorization: Bearer pk_...` header. */
export function getAgentUser(req: Request): UserRow | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(pk_[a-f0-9]+)$/i);
  if (!m) return null;
  return getUserByApiKey(m[1]!) ?? null;
}
