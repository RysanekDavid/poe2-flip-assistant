import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "../../../../auth/session";
import {
  getDigestEnabled,
  getPrefs,
  notifyStatus,
  readWebhook,
  setDigestEnabled,
  setPref,
  setWebhook,
} from "../../../../db/notifyQueries";
import { NotifyTypeSchema } from "../../../../core/notify/prefs";
import { maskWebhook, WebhookUrlSchema } from "../../../../core/notify/webhookUrl";
import { sendTestPing } from "../../../../core/notify/testPing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings view — the webhook only ever leaves the server masked (its token is a credential). */
function settingsView(userId: number) {
  const hook = readWebhook(userId);
  return {
    webhook: { state: hook.state, masked: hook.state === "set" ? maskWebhook(hook.url) : null },
    prefs: getPrefs(userId),
    digest: getDigestEnabled(userId),
    status: notifyStatus(userId),
  };
}

/** GET /api/settings/notify → webhook state (masked), per-type routing, digest switch, delivery health. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(settingsView(user.id));
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setWebhook"), url: WebhookUrlSchema }),
  z.object({ action: z.literal("clearWebhook") }),
  z.object({ action: z.literal("test") }),
  z.object({
    action: z.literal("pref"),
    type: NotifyTypeSchema,
    discord: z.boolean().optional(),
    ticker: z.boolean().optional(),
  }),
  z.object({ action: z.literal("digest"), enabled: z.boolean() }),
]);
type Body = z.infer<typeof Body>;

const TEST_COOLDOWN_MS = 10_000;
// Per web process, which is all there is: it only has to stop a mashed button from spamming the channel.
const lastTestAt = new Map<number, number>();

async function runTest(userId: number): Promise<Response> {
  const now = Date.now();
  const waitMs = (lastTestAt.get(userId) ?? 0) + TEST_COOLDOWN_MS - now;
  if (waitMs > 0) {
    const s = Math.ceil(waitMs / 1000);
    return NextResponse.json({ error: `test sent moments ago — wait ${s} s before sending another` }, { status: 429 });
  }
  const hook = readWebhook(userId);
  if (hook.state !== "set") {
    const why = hook.state === "none" ? "no webhook saved" : "stored webhook cannot be decrypted — paste it again";
    return NextResponse.json({ error: why }, { status: 409 });
  }
  // Stamped only when a POST will happen, and before its await, so a double-click cannot race it.
  lastTestAt.set(userId, now);
  const result = await sendTestPing(hook.url);
  if (result.kind !== "ok") return NextResponse.json({ error: result.detail }, { status: 502 });
  return NextResponse.json({ ...settingsView(userId), tested: true });
}

function apply(userId: number, b: Exclude<Body, { action: "test" }>): void {
  switch (b.action) {
    case "setWebhook":
      return setWebhook(userId, b.url);
    case "clearWebhook":
      return setWebhook(userId, null);
    case "pref":
      return setPref(userId, b.type, { discord: b.discord, ticker: b.ticker });
    case "digest":
      return setDigestEnabled(userId, b.enabled);
  }
}

/** POST /api/settings/notify { action, … } → change one setting (or send a test) and return the view. */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  if (parsed.data.action === "test") return runTest(user.id);
  apply(user.id, parsed.data);
  return NextResponse.json(settingsView(user.id));
}
