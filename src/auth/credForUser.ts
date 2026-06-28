import { getUserCred } from "../db/userQueries";
import { type TradeCred } from "../api/tradeClient";
import { config } from "../config/env";

/**
 * Resolve a user's trade2 cred WITHOUT a request context (usable from the poller / background
 * scans). The owner falls back to the .env.local POESESSID so the box operator works without
 * re-entering it; members must store their own. Returns null when no usable cred exists.
 *
 * Kept separate from tradeCred.ts because that module imports next/headers (request-only).
 */
export function credForUser(u: { id: number; role: string }): TradeCred | null {
  const c = getUserCred(u.id);
  if (c) return c;
  if (u.role === "owner" && config.poesessid) {
    return { poesessid: config.poesessid, contact: config.poeContact, account: config.poeAccount };
  }
  return null;
}
