import { timingSafeEqual, createHmac } from "node:crypto";
import { config } from "../config/env";
import { getSessionVersion } from "../db/userQueries";
import {
  decodeSessionPayload,
  parseSessionToken,
  sessionVersionOf,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "./sessionContract";

/**
 * Session tokens: HMAC-signed `<payload>.<sig>` (kept in an httpOnly cookie). The payload
 * carries users.session_version so bumping that column revokes every outstanding token for the
 * user (password change, "log out everywhere"). Password + api-key primitives live in
 * ./credentials.
 *
 * Secret comes from AUTH_SECRET. We fail loud in production if it's missing so sessions
 * can never be forged against an empty/guessable key.
 */

function secret(): string {
  if (config.authSecret) return config.authSecret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production — set it in the environment");
  }
  // dev-only stable fallback so logins survive restarts; never used in prod (throws above)
  return "dev-insecure-auth-secret-change-me";
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * Sign a session token for a user. Default 30-day TTL. The version defaults to the user's
 * current session_version so callers that only know the id (deploy smoke) mint a valid token.
 */
export function signSession(
  userId: number,
  ttlMs: number = SESSION_TTL_MS,
  version: number = requireSessionVersion(userId),
): string {
  const body = { uid: userId, exp: Date.now() + ttlMs, ver: version };
  const payload = b64url(Buffer.from(JSON.stringify(body)));
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

function requireSessionVersion(userId: number): number {
  const version = getSessionVersion(userId);
  if (version === undefined) throw new Error(`cannot sign a session for unknown user #${userId}`);
  return version;
}

export interface VerifiedSession {
  uid: number;
  ver: number;
}

/**
 * Verify a token's signature and expiry. Returns uid + signed version, or null if
 * invalid/expired/tampered. The caller must still compare `ver` with the user's current
 * session_version (see session.ts) — this function is DB-free on purpose.
 */
export function verifySession(token: string | undefined | null): VerifiedSession | null {
  if (!token) return null;
  const parsed = parseSessionToken(token);
  if (!parsed) return null;
  const { payload, signature: sig } = parsed;
  const want = b64url(createHmac("sha256", secret()).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const decoded = decodeSessionPayload(payload);
  return decoded ? { uid: decoded.uid, ver: sessionVersionOf(decoded) } : null;
}

export { SESSION_COOKIE };
