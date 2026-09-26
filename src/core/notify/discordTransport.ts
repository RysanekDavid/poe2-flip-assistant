import axios, { type AxiosInstance } from "axios";
import { z } from "zod";
import type { DiscordMessage } from "./discordMessage";
import { redactWebhook } from "./webhookUrl";

/**
 * Outcome of one webhook POST, already classified for the retry policy:
 *  - ok:           2xx, delivered
 *  - rate_limited: 429, retry no sooner than `retryAfterMs` (Discord says exactly when)
 *  - rejected:     other 4xx — the webhook was deleted/revoked or the payload is invalid;
 *                  retrying cannot help, so the drainer fails the batch at once
 *  - failed:       5xx / network / timeout — transient, retried with backoff
 * `detail` is always token-free: it is logged and shown in Settings.
 */
export type DeliveryResult =
  | { kind: "ok" }
  | { kind: "rate_limited"; retryAfterMs: number; detail: string }
  | { kind: "rejected"; status: number; detail: string }
  | { kind: "failed"; detail: string };

export type DiscordTransport = (url: string, message: DiscordMessage) => Promise<DeliveryResult>;

const TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_AFTER_MS = 5_000; // 429 with no usable hint — Discord always sends one in practice

const RateLimitBody = z.object({ retry_after: z.number().nonnegative() });
const ErrorBody = z.object({ message: z.string(), code: z.number().optional() });

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function retryAfterMs(data: unknown, header: unknown): number {
  const body = RateLimitBody.safeParse(data);
  if (body.success) return Math.ceil(body.data.retry_after * 1000); // seconds (float) in the body
  const seconds = typeof header === "string" ? Number(header) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : DEFAULT_RETRY_AFTER_MS;
}

function discordDetail(status: number, data: unknown): string {
  const body = ErrorBody.safeParse(data);
  const why = body.success ? ` ${body.data.message}${body.data.code != null ? ` (code ${body.data.code})` : ""}` : "";
  return redactWebhook(`Discord HTTP ${status}${why}`);
}

/** Map an HTTP response to the retry policy. Exported for tests. */
export function classifyResponse(status: number, data: unknown, retryAfterHeader: unknown): DeliveryResult {
  if (status >= 200 && status < 300) return { kind: "ok" };
  if (status === 429) {
    const ms = retryAfterMs(data, retryAfterHeader);
    return { kind: "rate_limited", retryAfterMs: ms, detail: `Discord rate limit — retry after ${ms} ms` };
  }
  if (status >= 400 && status < 500) return { kind: "rejected", status, detail: discordDetail(status, data) };
  return { kind: "failed", detail: discordDetail(status, data) };
}

/** Real transport. `client` is injectable so tests can mount a fake axios adapter (no network). */
export function axiosTransport(client: AxiosInstance = axios): DiscordTransport {
  return async (url, message) => {
    try {
      const res = await client.post(url, message, {
        timeout: TIMEOUT_MS,
        headers: { "Content-Type": "application/json" },
        validateStatus: () => true, // every status is classified below, none thrown
      });
      return classifyResponse(res.status, res.data, res.headers["retry-after"]);
    } catch (e) {
      // axios network errors carry the request config (and so the URL) — redact before it leaves
      return { kind: "failed", detail: redactWebhook(`network error: ${errText(e)}`) };
    }
  };
}
