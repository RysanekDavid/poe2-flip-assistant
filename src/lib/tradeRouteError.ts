import { NextResponse } from "next/server";
import { TradeRateLimitedError } from "../api/tradeErrors";

/**
 * Route-level mapping for a failed trade2 lookup: the shared budget being busy is a 503 with
 * Retry-After (the UI shows "retry in N s"), anything else is a 502 with the upstream message.
 */
export function tradeErrorResponse(e: unknown): Response {
  if (e instanceof TradeRateLimitedError) {
    return NextResponse.json(
      { error: e.message, retryAfterSec: e.retryAfterSec },
      { status: 503, headers: { "Retry-After": String(e.retryAfterSec) } },
    );
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
}
