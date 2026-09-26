/**
 * The shared trade2 budget can't admit a request soon enough for the caller to wait inline.
 * Web routes turn it into 503 + Retry-After instead of holding the HTTP request open; the poller
 * lets it fail the scan step and retries on its next tick.
 */
export class TradeRateLimitedError extends Error {
  readonly retryAfterSec: number;

  constructor(kind: string, waitMs: number) {
    const sec = Math.max(1, Math.ceil(waitMs / 1000));
    super(`trade2 ${kind} budget is busy (shared rate limit) — retry in ${sec}s`);
    this.name = "TradeRateLimitedError";
    this.retryAfterSec = sec;
  }
}
