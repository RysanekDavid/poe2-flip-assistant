import { getCurrentUser } from "./session";
import { credForUser } from "./credForUser";
import { type TradeCred } from "../api/tradeClient";

/**
 * Resolve which POESESSID the current request should call trade2 with: the logged-in user's
 * own stored (encrypted) cookie (owner falls back to .env, see credForUser). Returns null
 * when no usable cred exists (route should 409/503).
 */
export async function getCallerCred(): Promise<TradeCred | null> {
  const u = await getCurrentUser();
  if (!u) return null;
  return credForUser(u);
}
