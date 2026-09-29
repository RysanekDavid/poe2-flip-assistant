import type { TradeCred } from "../api/tradeClient";
import { TradeAuthError } from "../api/tradeErrors";
import { setCredStatus } from "../db/credStatusQueries";

/**
 * Run a per-user trade2 call and record what it says about the user's POESESSID: success → ok,
 * a 403 (TradeAuthError) → expired, then rethrow. Any other failure (rate limit, 5xx, network)
 * says nothing about the cookie, so the stored state is left alone and the error propagates.
 *
 * Only the user's own stored cookie is judged: the owner's .env fallback (source "env") is not
 * what Settings shows, so its 403 must not tell the owner their saved cookie expired.
 * Only wrap work that actually reaches trade2 — a call that returns without a request would mark
 * an expired cookie ok.
 */
export async function withCredStatus<T>(userId: number, cred: TradeCred, fn: () => Promise<T>): Promise<T> {
  if (cred.source !== "stored") return fn();
  let result: T;
  try {
    result = await fn();
  } catch (e: unknown) {
    if (e instanceof TradeAuthError) setCredStatus(userId, "expired", e.message);
    throw e;
  }
  setCredStatus(userId, "ok", null);
  return result;
}
