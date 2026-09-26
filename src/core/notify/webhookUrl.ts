import { z } from "zod";

/**
 * Discord webhook URL: `https://discord.com/api/webhooks/<id>/<token>` (discordapp.com is the
 * legacy host Discord still serves). Anchored and host-pinned on purpose — the server POSTs to
 * whatever is stored here, so a loose pattern would turn this into an SSRF primitive.
 */
const WEBHOOK_RE = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/(\d{15,22})\/([A-Za-z0-9_-]{20,100})$/;

export const WebhookUrlSchema = z
  .string()
  .trim()
  .regex(WEBHOOK_RE, "must be a Discord webhook URL: https://discord.com/api/webhooks/<id>/<token>");

/** Display form: the webhook id is not a credential (it cannot post), the token is — never echo it. */
export function maskWebhook(url: string): string {
  const m = WEBHOOK_RE.exec(url);
  if (!m) return "invalid webhook";
  return `discord.com/api/webhooks/${m[1]}/••••••••`;
}

/**
 * Strip any webhook token from free text before it is logged or stored as an error. Transport
 * errors (axios, undici) routinely embed the request URL in their message.
 */
export function redactWebhook(text: string): string {
  return text.replace(/(\/api\/webhooks\/\d+\/)[A-Za-z0-9_-]+/g, "$1<redacted>");
}
