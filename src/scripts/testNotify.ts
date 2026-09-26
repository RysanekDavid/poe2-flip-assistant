/* Discord notification contracts against a TEMP DB: webhook URL validation + masking, encryption
 * at rest (no plaintext token in the DB), per-type preference defaults, the alerts→queue trigger
 * honouring prefs for every writer, and Discord payload limits. No network.
 * Run: npm run test:notify (runWithTestEnv.ts notify sets DB_PATH + disables toasts). */
import { config } from "../config/env";
import { getDb } from "../db/database";
import { fireAlert } from "../core/alertEngine";
import { getPrefs, readWebhook, setPref, setWebhook, tickerMutedTypes, setDigestEnabled, getDigestEnabled } from "../db/notifyQueries";
import { maskWebhook, redactWebhook, WebhookUrlSchema } from "../core/notify/webhookUrl";
import { alertBatchMessage, messageChars, type NotifyAlert } from "../core/notify/discordMessage";
import { defaultPrefs, NOTIFY_TYPES } from "../core/notify/prefs";
import { ensureNotifySchema } from "../db/notifyMigrations";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const TOKEN = "AbCdEf_ghIJkl-MNOPqrstuVWXyz0123456789abcdefGHIJKLmnopQRSTUVwxyz0123";
const URL = `https://discord.com/api/webhooks/123456789012345678/${TOKEN}`;

const db = getDb();
db.exec("DELETE FROM notify_queue; DELETE FROM notify_prefs; DELETE FROM notify_settings; DELETE FROM alerts;");
db.prepare("INSERT OR IGNORE INTO users (id, name, password_hash, api_key, role) VALUES (2, 'notify-member', 'x', 'pk_notify_2', 'member')").run();
db.prepare("UPDATE users SET discord_webhook_enc = NULL").run();
const queued = (userId: number): number =>
  (db.prepare("SELECT COUNT(*) c FROM notify_queue WHERE user_id = ?").get(userId) as { c: number }).c;

testTriggerIdempotent();
testUrlValidation();
testEncryption();
testPrefDefaults();
testEnqueue();
testMessageLimits();

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);

function testTriggerIdempotent(): void {
  const version = (): number => db.pragma("schema_version", { simple: true }) as number;
  const before = version();
  ensureNotifySchema(db);
  ok("re-running the notify migration leaves the schema untouched", version() === before, `${before} → ${version()}`);
}

function testUrlValidation(): void {
  const valid = (u: string): boolean => WebhookUrlSchema.safeParse(u).success;
  ok("discord.com webhook accepted", valid(URL));
  ok("discordapp.com webhook accepted", valid(URL.replace("discord.com", "discordapp.com")));
  ok("surrounding whitespace trimmed", WebhookUrlSchema.safeParse(`  ${URL}\n`).data === URL);
  const bad = [
    URL.replace("https://", "http://"),
    URL.replace("discord.com", "discord.com.evil.io"),
    URL.replace("discord.com", "evil.io"),
    `${URL}/extra`,
    `${URL}?thread_id=1`,
    "https://discord.com/api/webhooks/123456789012345678",
    "https://discord.com/api/webhooks/abc/def",
    "not a url",
  ];
  ok("look-alikes / other hosts / extra paths rejected", bad.every((u) => !valid(u)), bad.filter(valid).join(", "));
  const issue = WebhookUrlSchema.safeParse(`${URL}x/y`).error?.issues[0]?.message ?? "";
  ok("validation error never echoes the token", issue.length > 0 && !issue.includes(TOKEN), issue);
  ok("mask keeps the id, hides the token", maskWebhook(URL).includes("123456789012345678") && !maskWebhook(URL).includes(TOKEN));
  ok("redact strips the token from free text", !redactWebhook(`POST ${URL} failed`).includes(TOKEN));
}

function testEncryption(): void {
  setWebhook(1, URL);
  const raw = (db.prepare("SELECT discord_webhook_enc AS enc FROM users WHERE id = 1").get() as { enc: string }).enc;
  ok("stored value is a secretbox token", raw.startsWith("v1.") && raw.split(".").length === 4);
  ok("no plaintext token or URL in the column", !raw.includes(TOKEN) && !raw.includes("discord.com"));
  const dump = JSON.stringify(db.prepare("SELECT * FROM users").all());
  ok("no plaintext token anywhere in users", !dump.includes(TOKEN));
  const back = readWebhook(1);
  ok("round-trip decrypts to the URL", back.state === "set" && back.url === URL);
  ok("user without a webhook reads none", readWebhook(2).state === "none");
  db.prepare("UPDATE users SET discord_webhook_enc = 'v1.bad.bad.bad' WHERE id = 2").run();
  ok("tampered token reads as unreadable, not as a URL", readWebhook(2).state === "unreadable");
  db.prepare("UPDATE users SET discord_webhook_enc = NULL WHERE id = 2").run();
}

function testPrefDefaults(): void {
  const prefs = getPrefs(2);
  const by = new Map(prefs.map((p) => [p.type, p]));
  ok("every notify type listed", prefs.length === NOTIFY_TYPES.length);
  ok("Discord ON by default: SNIPE, CRAFT_MARGIN, SPREAD", ["SNIPE", "CRAFT_MARGIN", "SPREAD"].every((t) => by.get(t as "SNIPE")?.discord === true));
  ok("Discord OFF by default: TREND, SPIKE", by.get("TREND")?.discord === false && by.get("SPIKE")?.discord === false);
  ok("ticker ON by default for every type", prefs.every((p) => p.ticker));
  ok("unknown legacy type stays off Discord", defaultPrefs("VOLUME").discord === false);
  setPref(2, "SPIKE", { ticker: false });
  const spike = getPrefs(2).find((p) => p.type === "SPIKE");
  ok("changing one channel keeps the other's default", spike?.ticker === false && spike.discord === false);
  ok("muted ticker types reported", tickerMutedTypes(2).join(",") === "SPIKE");
  ok("digest defaults on", getDigestEnabled(2));
  setDigestEnabled(2, false);
  ok("digest switch persists", !getDigestEnabled(2));
}

function testEnqueue(): void {
  const base = { itemName: "Doom Grip", message: "m", value: 40, threshold: 35 };
  fireAlert(2, "L", { ...base, type: "SNIPE", itemId: "u2-snipe" });
  ok("no webhook → nothing queued", queued(2) === 0);

  fireAlert(1, "L", { ...base, type: "SNIPE", itemId: "u1-snipe" });
  ok("SNIPE (default on) queued", queued(1) === 1);
  fireAlert(1, "L", { ...base, type: "TREND", itemId: "u1-trend" });
  ok("TREND (default off) not queued", queued(1) === 1);
  setPref(1, "TREND", { discord: true });
  fireAlert(1, "L", { ...base, type: "TREND", itemId: "u1-trend-2" });
  ok("TREND after opting in → queued", queued(1) === 2);
  setPref(1, "SNIPE", { discord: false });
  fireAlert(1, "L", { ...base, type: "SNIPE", itemId: "u1-snipe-2" });
  ok("SNIPE after opting out → not queued", queued(1) === 2);
  // league news is written by a raw INSERT on its own connection path — the trigger still sees it
  db.prepare("INSERT INTO alerts (user_id, league, type, item_id, item_name, message) VALUES (?, 'L', 'LEAGUE', 'league', 'L', 'new league')").run(1);
  ok("raw INSERT (league news) queued too", queued(1) === 3);
  const row = db.prepare("SELECT kind, status, attempts, alert_id FROM notify_queue ORDER BY id DESC LIMIT 1").get() as {
    kind: string; status: string; attempts: number; alert_id: number;
  };
  ok("queue row: pending alert delivery linked to its alert", row.kind === "alert" && row.status === "pending" && row.attempts === 0 && row.alert_id > 0);
  setWebhook(1, null);
  ok("clearing the webhook drops undelivered rows", queued(1) === 0);
  setPref(1, "SNIPE", { discord: true });
  setPref(1, "TREND", { discord: false });
}

function testMessageLimits(): void {
  const huge = (i: number): NotifyAlert => ({
    id: i, type: "SNIPE", item_id: `x${i}`, item_name: "N".repeat(400), message: "M".repeat(3000), value: 42.123, threshold: 35,
    whisper: `@seller Hi, I'd like to buy ${"W".repeat(1200)}`, link: `https://www.pathofexile.com/trade2/search/poe2/L/${"q".repeat(700)}`,
    league: "Runes of Aldur", created_at: "2026-09-26 10:00:00",
  });
  const msg = alertBatchMessage(Array.from({ length: 10 }, (_, i) => huge(i)));
  ok("10 alerts → one message with 10 embeds", msg.embeds.length === 10);
  ok("batch fits Discord's 6000-char budget", messageChars(msg) <= 6000, String(messageChars(msg)));
  ok("mentions disabled (listing text cannot ping @everyone)", msg.allowed_mentions.parse.length === 0);
  ok("titles within 256", msg.embeds.every((e) => e.title.length <= 256));
  ok("fields within 1024", msg.embeds.every((e) => e.fields.every((f) => f.value.length <= 1024)));
  const one = alertBatchMessage([{ ...huge(1), item_name: "Doom Grip", message: "40% under", whisper: "@x hi", link: "https://www.pathofexile.com/trade2/search/poe2/L/abc" }]);
  const fields = one.embeds[0]?.fields.map((f) => f.name).join(",") ?? "";
  ok("single alert keeps Value, League, Whisper and Trade fields", fields === "Value,League,Whisper,Trade", fields);
  ok("title links to the trade search", one.embeds[0]?.url === "https://www.pathofexile.com/trade2/search/poe2/L/abc");
  ok("value vs threshold rendered", one.embeds[0]?.fields[0]?.value === "42.1 vs threshold 35.0");
  ok("summary line for phone pushes", one.content === "1 new alert: SNIPE ×1", one.content);
  let threw = false;
  try {
    alertBatchMessage([]);
  } catch {
    threw = true;
  }
  ok("empty batch refused loudly", threw);
}
