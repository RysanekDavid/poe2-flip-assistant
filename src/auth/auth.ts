import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { config } from "../config/env";

/**
 * Auth primitives — dependency-free (node:crypto only).
 *  - passwords: scrypt with a per-password salt, stored as `scrypt$<saltHex>$<hashHex>`
 *  - sessions:  HMAC-signed `<payload>.<sig>` token (kept in an httpOnly cookie)
 *  - api keys:  opaque random tokens for the local agent (bearer auth, no expiry)
 *
 * Secret comes from AUTH_SECRET. We fail loud in production if it's missing so sessions
 * can never be forged against an empty/guessable key.
 */

const SESSION_TTL_MS = 30 * 24 * 3600_000; // 30 days

function secret(): string {
  if (config.authSecret) return config.authSecret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production — set it in the environment");
  }
  // dev-only stable fallback so logins survive restarts; never used in prod (throws above)
  return "dev-insecure-auth-secret-change-me";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const want = Buffer.from(parts[2]!, "hex");
  const dk = scryptSync(password, Buffer.from(parts[1]!, "hex"), want.length);
  return dk.length === want.length && timingSafeEqual(dk, want);
}

export function genApiKey(): string {
  return "pk_" + randomBytes(24).toString("hex");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Sign a session token for a user. Default 30-day TTL. */
export function signSession(userId: number, ttlMs: number = SESSION_TTL_MS): string {
  const payload = b64url(Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + ttlMs })));
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Verify a session token. Returns the user id, or null if invalid/expired/tampered. */
export function verifySession(token: string | undefined | null): number | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const want = b64url(createHmac("sha256", secret()).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid?: number; exp?: number };
    if (typeof data.uid !== "number" || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "poe2flip_session";
