import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "../../../../auth/session";
import {
  enqueueBoard,
  getBoardSettings,
  getDigestEnabled,
  getPrefs,
  notifyStatus,
  readWebhook,
  setBoardEnabled,
  setDigestEnabled,
  setPref,
  setWebhook,
} from "../../../../db/notifyQueries";
import { config } from "../../../../config/env";
import { NotifyTypeSchema } from "../../../../core/notify/prefs";
import { maskWebhook, WebhookUrlSchema } from "../../../../core/notify/webhookUrl";
import { sendTestPing } from "../../../../core/notify/testPing";
import { NotifySettingsSchema, type NotifySettings } from "../../../../lib/notifySettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings view — the webhook only ever leaves the server masked (its token is a credential), and
 * the board's Discord message id stays server-side (only whether one is posted).
 */
function settingsView(userId: number, extra: Pick<NotifySettings, "tested" | "boardQueued"> = {}): NotifySettings {
  const hook = readWebhook(userId);
  const board = getBoardSettings(userId);
  return NotifySettingsSchema.parse({
    webhook: { state: hook.state, masked: hook.state === "set" ? maskWebhook(hook.url) : null },
    prefs: getPrefs(userId),
    digest: getDigestEnabled(userId),
    board: {
      enabled: board.enabled,
      posted: board.messageId != null,
      updatedAt: board.updatedAt,
      intervalMin: config.discordBoard.intervalMin,
    },
    status: notifyStatus(userId),
    ...extra,
  });
}

/** GET /api/settings/notify → webhook state (masked), per-type routing (ticker/sound/popup/Discord), digest switch, delivery health. */
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
    ticker: z.boolean().optional(),
    sound: z.boolean().optional(),
    popup: z.boolean().optional(),
    discord: z.boolean().optional(),
  }),
  z.object({ action: z.literal("digest"), enabled: z.boolean() }),
  z.object({ action: z.literal("board"), enabled: z.boolean() }),
  z.object({ action: z.literal("boardNow") }),
]);
type Body = z.infer<typeof Body>;

const TEST_COOLDOWN_MS = 10_000;
const BOARD_NOW_COOLDOWN_MS = 60_000;
// Per web process, which is all there is: it only has to stop a mashed button from spamming the channel.
const lastTestAt = new Map<number, number>();
const lastBoardNowAt = new Map<number, number>();

function cooldownLeft(stamps: Map<number, number>, userId: number, cooldownMs: number, now: number): number {
  return Math.ceil(((stamps.get(userId) ?? 0) + cooldownMs - now) / 1000);
}

function webhookMissing(userId: number): Response | null {
  const hook = readWebhook(userId);
  if (hook.state === "set") return null;
  const why = hook.state === "none" ? "no webhook saved" : "stored webhook cannot be decrypted — paste it again";
  return NextResponse.json({ error: why }, { status: 409 });
}

async function runTest(userId: number): Promise<Response> {
  const now = Date.now();
  const waitS = cooldownLeft(lastTestAt, userId, TEST_COOLDOWN_MS, now);
  if (waitS > 0) return NextResponse.json({ error: `test sent moments ago — wait ${waitS} s before sending another` }, { status: 429 });
  const hook = readWebhook(userId);
  if (hook.state !== "set") {
    const why = hook.state === "none" ? "no webhook saved" : "stored webhook cannot be decrypted — paste it again";
    return NextResponse.json({ error: why }, { status: 409 });
  }
  // Stamped only when a POST will happen, and before its await, so a double-click cannot race it.
  lastTestAt.set(userId, now);
  const result = await sendTestPing(hook.url);
  if (result.kind !== "ok") return NextResponse.json({ error: result.detail }, { status: 502 });
  return NextResponse.json(settingsView(userId, { tested: true }));
}

/**
 * "Refresh now": queues one board update for the drainer, which still applies the per-user
 * window, 429 handling and backoff — this route never calls Discord itself.
 */
function runBoardNow(userId: number): Response {
  const now = Date.now();
  const waitS = cooldownLeft(lastBoardNowAt, userId, BOARD_NOW_COOLDOWN_MS, now);
  if (waitS > 0) return NextResponse.json({ error: `board refreshed moments ago — wait ${waitS} s` }, { status: 429 });
  const missing = webhookMissing(userId);
  if (missing) return missing;
  if (!getBoardSettings(userId).enabled) return NextResponse.json({ error: "switch the live board on first" }, { status: 409 });
  lastBoardNowAt.set(userId, now);
  enqueueBoard(userId); // false = one already waiting, which delivers the same fresh board
  return NextResponse.json(settingsView(userId, { boardQueued: true }));
}

function setBoard(userId: number, enabled: boolean): Response | null {
  if (enabled) {
    const missing = webhookMissing(userId);
    if (missing) return missing;
  }
  setBoardEnabled(userId, enabled);
  return null;
}

function apply(userId: number, b: Exclude<Body, { action: "test" | "boardNow" | "board" }>): void {
  switch (b.action) {
    case "setWebhook":
      return setWebhook(userId, b.url);
    case "clearWebhook":
      return setWebhook(userId, null);
    case "pref":
      return setPref(userId, b.type, { ticker: b.ticker, sound: b.sound, popup: b.popup, discord: b.discord });
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
  const b = parsed.data;
  if (b.action === "test") return runTest(user.id);
  if (b.action === "boardNow") return runBoardNow(user.id);
  if (b.action === "board") {
    const refused = setBoard(user.id, b.enabled);
    if (refused) return refused;
    return NextResponse.json(settingsView(user.id));
  }
  apply(user.id, b);
  return NextResponse.json(settingsView(user.id));
}
