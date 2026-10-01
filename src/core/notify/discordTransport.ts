import axios, { type AxiosInstance } from "axios";
import { z } from "zod";
import type { DiscordMessage } from "./discordMessage";
import { redactWebhook } from "./webhookUrl";

/**
 * Outcome of one webhook request, already classified for the retry policy:
 *  - ok:           2xx, delivered. `messageId` is set only when Discord returned the message
 *                  (a POST with ?wait=true, or an edit) — a plain POST answers 204 with no body.
 *  - rate_limited: 429, retry no sooner than `retryAfterMs` (Discord says exactly when)
 *  - rejected:     other 4xx — the webhook was deleted/revoked (404, code 10015), the edited
 *                  message is gone (404, code 10008), or the payload is invalid; the same request
 *                  cannot succeed. `code` is Discord's JSON error code when the body carried one.
 *  - failed:       5xx / network / timeout — transient, retried with backoff
 * `detail` is always token-free: it is logged and shown on the Alerts page.
 */
export type DeliveryResult =
  | { kind: "ok"; messageId: string | null }
  | { kind: "rate_limited"; retryAfterMs: number; detail: string }
  | { kind: "rejected"; status: number; code?: number; detail: string } // code = Discord JSON error code, when sent
  | { kind: "failed"; detail: string };

/**
 * The Discord webhook calls the app makes. `post` executes the webhook; `wait: true` appends
 * ?wait=true so Discord answers with the created message, whose id the live board edits later.
 * `edit` is PATCH /webhooks/{id}/{token}/messages/{messageId}.
 */
export interface DiscordTransport {
  post: (url: string, message: DiscordMessage, opts?: { wait: boolean }) => Promise<DeliveryResult>;
  edit: (url: string, messageId: string, message: DiscordMessage) => Promise<DeliveryResult>;
}

const TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_AFTER_MS = 5_000; // 429 with no usable hint — Discord always sends one in practice

/** Discord ids are snowflakes; anything else must never be spliced into a request path. */
export const MessageIdSchema = z.string().regex(/^\d{15,22}$/, "Discord message id must be a snowflake");
const MessageBody = z.object({ id: MessageIdSchema });
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
  if (status >= 200 && status < 300) {
    const msg = MessageBody.safeParse(data);
    return { kind: "ok", messageId: msg.success ? msg.data.id : null };
  }
  if (status === 429) {
    const ms = retryAfterMs(data, retryAfterHeader);
    return { kind: "rate_limited", retryAfterMs: ms, detail: `Discord rate limit — retry after ${ms} ms` };
  }
  if (status >= 400 && status < 500) {
    const code = ErrorBody.safeParse(data).data?.code;
    return { kind: "rejected", status, ...(code != null ? { code } : {}), detail: discordDetail(status, data) };
  }
  return { kind: "failed", detail: discordDetail(status, data) };
}

/** An edit carries only what PATCH accepts — the posting name is fixed when the message is created. */
function editBody(message: DiscordMessage): Omit<DiscordMessage, "username"> {
  return { content: message.content, embeds: message.embeds, allowed_mentions: message.allowed_mentions };
}

async function send(client: AxiosInstance, method: "post" | "patch", url: string, body: unknown): Promise<DeliveryResult> {
  try {
    const res = await client.request({
      method,
      url,
      data: body,
      timeout: TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true, // every status is classified below, none thrown
    });
    return classifyResponse(res.status, res.data, res.headers["retry-after"]);
  } catch (e) {
    // axios network errors carry the request config (and so the URL) — redact before it leaves
    return { kind: "failed", detail: redactWebhook(`network error: ${errText(e)}`) };
  }
}

/** Real transport. `client` is injectable so tests can mount a fake axios adapter (no network). */
export function axiosTransport(client: AxiosInstance = axios): DiscordTransport {
  return {
    // The stored URL is regex-pinned with no query string (webhookUrl.ts), so appending is safe.
    post: (url, message, opts) => send(client, "post", opts?.wait ? `${url}?wait=true` : url, message),
    edit: (url, messageId, message) => {
      const id = MessageIdSchema.safeParse(messageId);
      if (!id.success) return Promise.resolve({ kind: "rejected", status: 400, detail: "stored board message id is not a Discord snowflake" });
      return send(client, "patch", `${url}/messages/${id.data}`, editBody(message));
    },
  };
}
