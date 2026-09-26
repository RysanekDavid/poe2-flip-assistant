/* Discord drainer contracts against a TEMP DB with a fake clock and fake transports (no network):
 * burst batching + the 30 s per-user window, 429 retry_after, exponential backoff and give-up,
 * permanent 4xx, the axios transport's response classification (fake adapter), the daily
 * digest, and that no webhook token ever reaches a log line or a stored error.
 * Run: npm run test:notify (runWithTestEnv.ts notify-drain). */
import axios, { type AxiosAdapter } from "axios";
import { config } from "../config/env";
import { getDb } from "../db/database";
import { insertAlert } from "../db/alertQueries";
import { notifyStatus, setLastDigestAt, setWebhook } from "../db/notifyQueries";
import { backoffMs, drainNotifications, NOTIFY_POLICY } from "../core/notify/drainer";
import { axiosTransport, classifyResponse, type DeliveryResult, type DiscordTransport } from "../core/notify/discordTransport";
import type { DiscordMessage } from "../core/notify/discordMessage";
import { digestPayload } from "../core/notify/digest";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  process.stdout.write(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}\n`);
  if (!cond) fail++;
};

const TOKEN = "ZyXwVu_tsRQp-ONMLkjihgfedcba9876543210ZYXWVUTSRQPONMLKJIHGFEDCBAzyxw";
const URL = `https://discord.com/api/webhooks/987654321098765432/${TOKEN}`;
const USER = 1;
const T0 = 1_000_000_000_000;

// Capture every console line the drainer emits; asserted token-free at the end.
const captured: string[] = [];
for (const level of ["log", "warn", "error"] as const) {
  console[level] = (...args: unknown[]): void => {
    captured.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(" "));
  };
}

const db = getDb();
const sent: DiscordMessage[] = [];
const fakeTransport = (respond: () => DeliveryResult): DiscordTransport => async (url, message) => {
  if (url !== URL) throw new Error("drainer posted to the wrong URL");
  sent.push(message);
  return respond();
};
const okTransport = fakeTransport(() => ({ kind: "ok" }));
const drain = (now: number, transport: DiscordTransport = okTransport) => drainNotifications({ now: () => now, transport, db });
const alert = (i: number): void =>
  insertAlert(USER, "Runes of Aldur", { type: "SNIPE", itemId: `l-${i}-${Math.random()}`, itemName: `Item ${i}`, message: "m", value: 40, threshold: 35 });
const statuses = (): Record<string, number> =>
  Object.fromEntries((db.prepare("SELECT status, COUNT(*) c FROM notify_queue GROUP BY status").all() as Array<{ status: string; c: number }>).map((r) => [r.status, r.c]));
const reset = (): void => {
  db.exec("DELETE FROM notify_queue; DELETE FROM notify_settings; DELETE FROM alerts;");
  sent.length = 0;
};

main()
  .then(() => {
    const leaked = captured.filter((l) => l.includes(TOKEN));
    ok("no log line contains the webhook token", leaked.length === 0, leaked[0] ?? `${captured.length} lines checked`);
    const errors = JSON.stringify(db.prepare("SELECT last_error FROM notify_queue").all());
    ok("no stored error contains the webhook token", !errors.includes(TOKEN));
    process.stdout.write(fail === 0 ? "\nALL PASS\n" : `\n${fail} FAILED\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
    process.exit(1);
  });

async function main(): Promise<void> {
  reset();
  setWebhook(USER, URL);
  setLastDigestAt(USER, T0); // keep the digest out of the delivery tests
  await testBatching();
  await testRateLimit();
  await testGiveUp();
  await testRejected();
  await testWebhookRemoved();
  await testAxiosTransport();
  await testDigest();
  await testReplaceKeepsQueue();
}

async function testBatching(): Promise<void> {
  for (let i = 0; i < 12; i++) alert(i);
  const first = await drain(T0);
  ok("burst of 12 → ONE message", sent.length === 1 && first.sent === 10, JSON.stringify(first));
  ok("first message carries 10 embeds", sent[0]?.embeds.length === 10);
  ok("2 left queued", statuses().pending === 2);
  const early = await drain(T0 + 10_000);
  ok("within 30 s: nothing sent, user throttled", sent.length === 1 && early.throttled === 1);
  await drain(T0 + NOTIFY_POLICY.windowMs + 1);
  ok("after the window: the remaining 2 in one message", sent.length === 2 && sent[1]?.embeds.length === 2);
  ok("all 12 sent", statuses().sent === 12 && statuses().pending === undefined);
}

async function testRateLimit(): Promise<void> {
  reset();
  const t = T0 + 600_000;
  alert(100);
  const limited = fakeTransport(() => classifyResponse(429, { retry_after: 45.5, global: false }, undefined));
  const r = await drain(t, limited);
  const row = db.prepare("SELECT status, attempts, next_attempt_at FROM notify_queue").get() as { status: string; attempts: number; next_attempt_at: number };
  ok("429 → row stays pending, retry budget untouched", r.retried === 1 && row.status === "pending" && row.attempts === 0, JSON.stringify(row));
  ok("429 → next attempt exactly retry_after later", row.next_attempt_at === t + 45_500, String(row.next_attempt_at - t));
  sent.length = 0;
  await drain(t + 31_000); // window open, but Discord said 45.5 s
  ok("not retried before retry_after", sent.length === 0);
  await drain(t + 46_000);
  ok("retried after retry_after → sent", sent.length === 1 && statuses().sent === 1);

  // a long run of 429s must never exhaust the retry budget
  reset();
  alert(101);
  const brief = fakeTransport(() => classifyResponse(429, { retry_after: 1 }, undefined));
  let at = t + 120_000;
  for (let i = 0; i < NOTIFY_POLICY.maxAttempts + 3; i++) {
    await drain(at, brief);
    at += NOTIFY_POLICY.windowMs + 1;
  }
  const after = db.prepare("SELECT status, attempts FROM notify_queue").get() as { status: string; attempts: number };
  ok(`${NOTIFY_POLICY.maxAttempts + 3} × 429 → still pending, 0 attempts spent`, after.status === "pending" && after.attempts === 0, JSON.stringify(after));
  await drain(at);
  ok("delivered once Discord lets up", statuses().sent === 1);
}

async function testGiveUp(): Promise<void> {
  reset();
  alert(200);
  const down = fakeTransport(() => classifyResponse(503, { message: "upstream down" }, undefined));
  let t = T0 + 1_200_000;
  const delays: number[] = [];
  for (let attempt = 1; attempt <= NOTIFY_POLICY.maxAttempts; attempt++) {
    await drain(t, down);
    const row = db.prepare("SELECT next_attempt_at FROM notify_queue").get() as { next_attempt_at: number };
    delays.push(row.next_attempt_at - t);
    t = Math.max(row.next_attempt_at, t + NOTIFY_POLICY.windowMs) + 1;
  }
  const expected = [30, 60, 120, 240, 480, 960, 1800].map((s) => s * 1000); // doubling, then the 30 min cap
  ok("backoff doubles up to the 30 min cap", delays.slice(0, 7).join(",") === expected.join(","), delays.join(","));
  ok("backoffMs matches the schedule", [1, 2, 3, 4, 5, 6, 7, 8].map(backoffMs).slice(0, 7).join(",") === expected.join(","));
  const span = delays.slice(0, NOTIFY_POLICY.maxAttempts - 1).reduce((a, b) => a + b, 0);
  ok("retries ride out a ~1 h outage", span >= 3_600_000, `${Math.round(span / 60_000)} min`);
  const row = db.prepare("SELECT status, attempts, last_error FROM notify_queue").get() as { status: string; attempts: number; last_error: string };
  ok(`gave up after ${NOTIFY_POLICY.maxAttempts} attempts`, row.status === "failed" && row.attempts === NOTIFY_POLICY.maxAttempts, JSON.stringify(row));
  ok("error stored for Settings", row.last_error.includes("503") && row.last_error.includes("upstream down"), row.last_error);
  sent.length = 0;
  await drain(t + 3_600_000, down);
  ok("failed rows are not retried", sent.length === 0);
  const status = notifyStatus(USER);
  ok("Settings status shows the failure", status.lastError?.includes("503") === true && status.failed7d === 1, JSON.stringify(status));
}

async function testRejected(): Promise<void> {
  reset();
  alert(300);
  const gone = fakeTransport(() => classifyResponse(404, { message: "Unknown Webhook", code: 10015 }, undefined));
  await drain(T0 + 7_200_000, gone);
  const row = db.prepare("SELECT status, attempts, last_error FROM notify_queue").get() as { status: string; attempts: number; last_error: string };
  ok("404 → failed at once (retrying cannot help)", row.status === "failed" && row.attempts === 1);
  ok("Discord's reason kept", row.last_error.includes("Unknown Webhook"), row.last_error);
  // a throwing transport (e.g. a URL-bearing network error) is recorded, redacted, and backed off
  reset();
  alert(301);
  await drain(T0 + 7_300_000, async () => {
    throw new Error(`connect ECONNREFUSED ${URL}`);
  });
  const thrown = db.prepare("SELECT status, attempts, last_error FROM notify_queue").get() as { status: string; attempts: number; last_error: string };
  ok("throwing transport → retry with a redacted error", thrown.status === "pending" && thrown.attempts === 1 && !thrown.last_error.includes(TOKEN), thrown.last_error);
}

async function testWebhookRemoved(): Promise<void> {
  reset();
  alert(400);
  db.prepare("UPDATE users SET discord_webhook_enc = NULL WHERE id = ?").run(USER);
  await drain(T0 + 8_000_000);
  ok("webhook gone before delivery → rows dropped, nothing posted", sent.length === 0 && Object.keys(statuses()).length === 0);
  setWebhook(USER, URL);
}

async function testAxiosTransport(): Promise<void> {
  const via = (status: number, data: unknown, headers: Record<string, string> = {}): Promise<DeliveryResult> => {
    const adapter: AxiosAdapter = async (cfg) => ({ status, statusText: "", data, headers, config: cfg });
    return axiosTransport(axios.create({ adapter }))(URL, { username: "t", embeds: [], allowed_mentions: { parse: [] } });
  };
  ok("204 → ok", (await via(204, "")).kind === "ok");
  const body429 = await via(429, { retry_after: 2.5, global: false });
  ok("429 body retry_after (seconds) → ms", body429.kind === "rate_limited" && body429.retryAfterMs === 2500, JSON.stringify(body429));
  const header429 = await via(429, "", { "retry-after": "3" });
  ok("429 Retry-After header fallback", header429.kind === "rate_limited" && header429.retryAfterMs === 3000, JSON.stringify(header429));
  ok("404 → rejected", (await via(404, { message: "Unknown Webhook", code: 10015 })).kind === "rejected");
  ok("502 → failed (transient)", (await via(502, "bad gateway")).kind === "failed");
  const boom: AxiosAdapter = async () => {
    throw new Error(`getaddrinfo ENOTFOUND while calling ${URL}`);
  };
  const net = await axiosTransport(axios.create({ adapter: boom }))(URL, { username: "t", embeds: [], allowed_mentions: { parse: [] } });
  ok("network error → failed with the token redacted", net.kind === "failed" && !net.detail.includes(TOKEN), JSON.stringify(net));
}

async function testDigest(): Promise<void> {
  ok("empty window → no digest", digestPayload({ counts: [], top: [] }, 0, 1) === null);
  reset();
  alert(500);
  insertAlert(USER, "Runes of Aldur", { type: "TREND", itemId: "t", itemName: "Trendy", message: "up", value: 60, threshold: 50 });
  insertAlert(USER, "Runes of Aldur", { type: "SPREAD", itemId: "old", itemName: "Stale", message: "old", value: 99, threshold: 15 });
  db.prepare("UPDATE alerts SET created_at = datetime('now', '-10 days') WHERE item_id = 'old'").run();
  const now = Date.now() + 2_000; // created_at has 1 s resolution — close the window after the inserts
  db.prepare("DELETE FROM notify_queue").run(); // only the digest under test
  setLastDigestAt(USER, now - 30 * 24 * 3600_000); // e.g. the poller was down for a month
  const r = await drain(now);
  ok("closed 24 h window → one digest queued and sent", r.digests === 1 && sent.length === 1, JSON.stringify(r));
  const embed = sent[0]?.embeds[0];
  ok("digest counts muted-from-Discord types too", embed?.description?.includes("TREND 1") === true, embed?.description);
  ok("digest window capped at 24 h (10-day-old alert excluded)", embed?.description?.includes("SPREAD") === false, embed?.description);
  const since = new Date(now - 24 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  ok("digest footer states the capped start", embed?.footer?.text.includes(since) === true, embed?.footer?.text);
  ok("digest lists the top snipe", embed?.fields.some((f) => f.name === "Top SNIPE" && f.value.includes("Item 500")) === true);
  const again = await drain(now + NOTIFY_POLICY.windowMs + 1);
  ok("no second digest inside the same day", again.digests === 0 && sent.length === 1);
  db.prepare("DELETE FROM notify_settings").run();
  const baseline = await drain(now + 2 * NOTIFY_POLICY.windowMs);
  ok("first sight of a user only sets the baseline", baseline.digests === 0);

  const lastDigest = (): number | null =>
    (db.prepare("SELECT last_digest_at AS t FROM notify_settings WHERE user_id = ?").get(USER) as { t: number | null } | undefined)?.t ?? null;
  ok("baseline stamped", lastDigest() != null);
  setWebhook(USER, null);
  ok("clearing the webhook forgets the digest baseline", lastDigest() === null);
  setWebhook(USER, URL);
}

async function testReplaceKeepsQueue(): Promise<void> {
  reset();
  alert(600);
  setWebhook(USER, URL.replace("987654321098765432", "111111111111111111"));
  ok("replacing the webhook keeps queued alerts (they go to the new URL)", statuses().pending === 1);
  setWebhook(USER, URL);
  ok("…and still pending after switching back", statuses().pending === 1);
}
