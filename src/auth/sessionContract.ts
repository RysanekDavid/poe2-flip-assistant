export const SESSION_COOKIE = "poe2flip_session";
export const SESSION_TTL_MS = 30 * 24 * 3600_000;

export interface SessionPayload {
  uid: number;
  exp: number;
  /**
   * users.session_version at signing time. Optional because tokens issued before revocation
   * shipped carry none; they count as version 0 so the deploy logs nobody out.
   */
  ver?: number;
}

export function parseSessionToken(token: string): { payload: string; signature: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { payload: parts[0], signature: parts[1] };
}

export function decodeSessionPayload(encoded: string, now = Date.now()): SessionPayload | null {
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isSessionPayload(value) || value.exp <= now) return null;
    return value;
  } catch (error: unknown) {
    if (error instanceof SyntaxError || error instanceof DOMException) return null;
    throw error;
  }
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value == null) return false;
  const candidate = value as { uid?: unknown; exp?: unknown; ver?: unknown };
  const validVersion = candidate.ver === undefined ||
    (Number.isSafeInteger(candidate.ver) && Number(candidate.ver) >= 0);
  return Number.isSafeInteger(candidate.uid) && Number(candidate.uid) > 0 &&
    typeof candidate.exp === "number" && Number.isFinite(candidate.exp) && validVersion;
}

/** Session version a payload was signed with; pre-revocation tokens carry none and mean 0. */
export function sessionVersionOf(payload: SessionPayload): number {
  return payload.ver ?? 0;
}
