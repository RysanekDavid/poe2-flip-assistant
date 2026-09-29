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

/**
 * trade2 answered 403: the POESESSID is expired/invalid (or Cloudflare challenged the request).
 * Typed so per-user call sites can flip the user's stored cred state to "expired" (auth/credStatus)
 * and the UI can say so once, instead of every panel showing its own opaque upstream error.
 */
export class TradeAuthError extends Error {
  readonly status = 403;

  constructor(method: string, path: string) {
    super(`trade2 403 on ${method.toUpperCase()} ${path} — POESESSID invalid/expired or Cloudflare challenge. Refresh your cookie in Settings.`);
    this.name = "TradeAuthError";
  }
}
