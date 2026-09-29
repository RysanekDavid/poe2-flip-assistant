/* Discord live board contracts, run from testNotifyDrain.ts against its TEMP DB, fake clock and
 * fake transports (never a real webhook): opt-in due logic, POST ?wait=true storing the message
 * id, later passes editing that same id, a 404 edit re-posting, failure throttling, the pure
 * renderer staying inside Discord's embed budget, and the axios transport's URLs and bodies. */
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import type Database from "better-sqlite3";
import { BOARD_LIMITS, boardMessage, type BoardData } from "../core/notify/board";
import { boardIntervalMs, renderBoard } from "../core/notify/boardData";
import { messageChars, type DiscordMessage } from "../core/notify/discordMessage";
import { axiosTransport, classifyResponse, type DeliveryResult, type DiscordTransport } from "../core/notify/discordTransport";
import { drainNotifications, NOTIFY_POLICY } from "../core/notify/drainer";
import { enqueueBoard, getBoardSettings, setBoardEnabled, setLastDigestAt, setWebhook } from "../db/notifyQueries";

export interface BoardHarness {
  db: Database.Database;
  ok: (name: string, cond: boolean, extra?: string) => void;
  url: string;
  token: string;
  user: number;
  t0: number;
}

interface Call {
  op: "post" | "edit";
  wait: boolean;
  messageId: string | null;
  message: DiscordMessage;
}

const ID_A = "112233445566778899";
const ID_B = "998877665544332211";

function recorder(h: BoardHarness, respond: (c: Call) => DeliveryResult): { calls: Call[]; transport: DiscordTransport } {
  const calls: Call[] = [];
  const check = (url: string): void => {
    if (url !== h.url) throw new Error("board sent to the wrong URL");
  };
  const transport: DiscordTransport = {
    post: async (url, message, opts) => {
      check(url);
      const call: Call = { op: "post", wait: opts?.wait === true, messageId: null, message };
      calls.push(call);
      return respond(call);
    },
    edit: async (url, messageId, message) => {
      check(url);
      const call: Call = { op: "edit", wait: false, messageId, message };
      calls.push(call);
      return respond(call);
    },
  };
  return { calls, transport };
}

const FAKE_BOARD: DiscordMessage = boardMessage({
  league: "Runes of Aldur",
  nowMs: 0,
  trades: { ok: true, value: { source: "cx", routes: [] } },
  farm: { ok: true, value: { bosses: [], hot: [] } },
  worth: { ok: true, value: null },
});

function boardRows(db: Database.Database): Array<{ status: string; attempts: number }> {
  return db.prepare("SELECT status, attempts FROM notify_queue WHERE kind = 'board' ORDER BY id").all() as Array<{ status: string; attempts: number }>;
}

function maxedBoard(nowMs: number): BoardData {
  const long = "Omen of the Very Long Item Name *with* `markdown` and _underscores_ ".repeat(4);
  return {
    league: "Runes of Aldur ".repeat(20),
    nowMs,
    trades: {
      ok: true,
      value: {
        source: "cx",
        routes: Array.from({ length: BOARD_LIMITS.routes }, (_, i) => ({ item: `${long}${i}`, from: "EXALT", to: "DIVINE", edgePct: 12.345, held6: 6, capDivPerHour: 1234.5 })),
      },
    },
    farm: {
      ok: true,
      value: {
        bosses: Array.from({ length: BOARD_LIMITS.bosses }, (_, i) => ({ name: `${long}${i}`, netDiv: 3.2, netBound: "lower" as const })),
        hot: Array.from({ length: BOARD_LIMITS.hot }, (_, i) => ({ label: `${long}${i}`, change7dPct: 55.5 })),
      },
    },
    worth: { ok: true, value: { league: "Standard", netWorthDiv: 812.4, change24hPct: null, change7dPct: -3.21, fetchedAt: "2026-09-29 13:55:02" } },
  };
}

function testRenderer(h: BoardHarness): void {
  const now = Date.UTC(2026, 8, 29, 14, 5, 30);
  const m = boardMessage(maxedBoard(now));
  h.ok("maxed-out board stays ≤ 5800 embed chars", messageChars(m) <= 5800, String(messageChars(m)));
  h.ok("board never pings (allowed_mentions parse: [])", Array.isArray(m.allowed_mentions.parse) && m.allowed_mentions.parse.length === 0);
  const embed = m.embeds[0];
  h.ok("footer: updated HH:MM UTC · edited in place", embed?.footer?.text === "updated 14:05 UTC · this message is edited in place", embed?.footer?.text);
  const worth = embed?.fields.find((f) => f.name === "Net worth")?.value ?? "";
  h.ok("unknown 24 h change renders as — (null never 0)", worth.includes("24 h —") && worth.includes("7 d −3.2%"), worth);
  h.ok("market names are markdown-escaped", embed?.fields[0]?.value.includes("\\*with\\*") === true);
  h.ok("lower-bound boss net shows ≥", embed?.fields.some((f) => f.value.includes("≥3.20 div/kill")) === true);
  const failed = boardMessage({ ...maxedBoard(now), farm: { ok: false } });
  h.ok("a failed section is shown, not dropped", failed.embeds[0]?.fields.some((f) => f.name === "Farm" && f.value === "unavailable — see server log") === true);
  h.ok("board embed uses the amber accent", m.embeds[0]?.color === 0xfbbf24);
  const fallback = boardMessage({ ...maxedBoard(now), trades: { ok: true, value: { source: "watchlist", spreads: [] } } });
  h.ok("no CX loops → watchlist fallback field", fallback.embeds[0]?.fields[0]?.name.startsWith("Watchlist spreads") === true);
}

async function testLifecycle(h: BoardHarness): Promise<void> {
  const { db, ok } = h;
  db.exec("DELETE FROM notify_queue; DELETE FROM notify_settings;");
  setLastDigestAt(h.user, h.t0); // keep the digest out of the way
  const nextId = { value: ID_A };
  const rec = recorder(h, (c) => ({ kind: "ok", messageId: c.op === "post" && c.wait ? nextId.value : c.messageId }));
  const drain = (now: number, transport: DiscordTransport = rec.transport) =>
    drainNotifications({ now: () => now, transport, db, renderBoard: () => FAKE_BOARD });
  let t = h.t0 + 50_000_000;

  await drain(t);
  ok("board is opt-in: off by default, nothing queued or sent", rec.calls.length === 0 && boardRows(db).length === 0 && !getBoardSettings(h.user, db).enabled);

  setBoardEnabled(h.user, true, db);
  const first = await drain(t);
  ok("switched on → queued and posted in the same pass", first.boards === 1 && rec.calls.length === 1, JSON.stringify(first));
  ok("first delivery is POST ?wait=true", rec.calls[0]?.op === "post" && rec.calls[0]?.wait === true);
  const stored = getBoardSettings(h.user, db);
  ok("returned message id stored with the update time", stored.messageId === ID_A && stored.updatedAt === t, JSON.stringify(stored));

  t += NOTIFY_POLICY.windowMs + 1;
  const early = await drain(t);
  ok("inside the interval: no new board", early.boards === 0 && rec.calls.length === 1);

  t += boardIntervalMs();
  await drain(t);
  ok("next interval edits the SAME message", rec.calls[1]?.op === "edit" && rec.calls[1]?.messageId === ID_A, JSON.stringify(rec.calls[1]?.op));
  ok("1 request per user per pass", rec.calls.length === 2);

  enqueueBoard(h.user, db);
  ok("Refresh now twice → one pending row", !enqueueBoard(h.user, db) && boardRows(db).filter((r) => r.status === "pending").length === 1);
  const gone = recorder(h, (c) =>
    c.op === "edit" ? classifyResponse(404, { message: "Unknown Message", code: 10008 }, undefined) : { kind: "ok", messageId: ID_B },
  );
  t += NOTIFY_POLICY.windowMs + 1;
  const r404 = await drain(t, gone.transport);
  ok("edit 404 → id forgotten, row kept pending (no retry budget spent)", getBoardSettings(h.user, db).messageId === null && r404.retried === 1 && boardRows(db).at(-1)?.attempts === 0);
  ok("…and no second request in that pass", gone.calls.length === 1);
  t += NOTIFY_POLICY.windowMs + 1;
  await drain(t, gone.transport);
  ok("next pass re-posts with wait=true and stores the new id", gone.calls[1]?.op === "post" && gone.calls[1]?.wait === true && getBoardSettings(h.user, db).messageId === ID_B);
  await testFailureThrottle(h, drain, t);
}

async function testFailureThrottle(
  h: BoardHarness,
  drain: (now: number, transport: DiscordTransport) => Promise<unknown>,
  from: number,
): Promise<void> {
  const { db, ok } = h;
  const dead = recorder(h, () => classifyResponse(404, { message: "Unknown Webhook", code: 10015 }, undefined));
  let t = from + boardIntervalMs() + 1;
  await drain(t, dead.transport);
  const deadRow = boardRows(db).at(-1);
  ok("edit 404 code 10015 (webhook gone) → row fails normally, no re-post", deadRow?.status === "failed" && dead.calls.length === 1, JSON.stringify(deadRow));
  ok("…and the id is forgotten, so the next cycle POSTs instead of PATCHing", getBoardSettings(h.user, db).messageId === null);
  for (let i = 0; i < 5; i++) {
    t += NOTIFY_POLICY.windowMs + 1;
    await drain(t, dead.transport);
  }
  ok("a failing board is not re-queued every tick", dead.calls.length === 1, String(dead.calls.length));
  await drain(t + boardIntervalMs(), dead.transport);
  ok("…only once per interval, as a fresh POST", dead.calls.length === 2 && dead.calls[1]?.op === "post", String(dead.calls.length));
  t += 2 * boardIntervalMs();
  await testEditRefused(h, drain, t);

  setBoardEnabled(h.user, false, db);
  const off = getBoardSettings(h.user, db);
  ok("switching off forgets the message and drops queued updates", !off.enabled && off.messageId === null && boardRows(db).every((r) => r.status !== "pending"));
  setBoardEnabled(h.user, true, db);
  db.prepare("UPDATE notify_settings SET board_message_id = ? WHERE user_id = ?").run(ID_A, h.user);
  setWebhook(h.user, h.url, db);
  ok("re-saving the same webhook keeps the board message", getBoardSettings(h.user, db).messageId === ID_A);
  setWebhook(h.user, h.url.replace("987654321098765432", "111111111111111111"), db);
  ok("a different webhook forgets the board message (it cannot edit it)", getBoardSettings(h.user, db).messageId === null);
  setWebhook(h.user, h.url, db);
  setBoardEnabled(h.user, false, db);
}

/** Any non-10008 4xx on an edit forgets the id: repeating a refused PATCH every cycle can never succeed. */
async function testEditRefused(h: BoardHarness, drain: (now: number, transport: DiscordTransport) => Promise<unknown>, from: number): Promise<void> {
  const { db, ok } = h;
  db.prepare("UPDATE notify_settings SET board_message_id = ?, board_updated_at = NULL WHERE user_id = ?").run(ID_A, h.user);
  const refused = recorder(h, (c) =>
    c.op === "edit" ? classifyResponse(400, { message: "Invalid Form Body", code: 50035 }, undefined) : { kind: "ok", messageId: ID_B },
  );
  await drain(from, refused.transport);
  ok("edit 400 → row failed, id forgotten", boardRows(db).at(-1)?.status === "failed" && getBoardSettings(h.user, db).messageId === null);
  await drain(from + boardIntervalMs() + 1, refused.transport);
  ok("…next cycle POSTs a fresh board instead of repeating the PATCH", refused.calls[1]?.op === "post" && getBoardSettings(h.user, db).messageId === ID_B);
}

/** Webhook swap or switch-off while the POST is in flight: the returned id must not be stored. */
async function testMidSendRaces(h: BoardHarness): Promise<void> {
  const { db, ok } = h;
  const other = h.url.replace("987654321098765432", "111111111111111111");
  const drain = (now: number, transport: DiscordTransport) => drainNotifications({ now: () => now, transport, db, renderBoard: () => FAKE_BOARD });
  const during = (sideEffect: () => void): DiscordTransport =>
    recorder(h, () => {
      sideEffect();
      return { kind: "ok", messageId: ID_A };
    }).transport;
  let t = h.t0 + 900_000_000;
  db.exec("DELETE FROM notify_queue;");
  setBoardEnabled(h.user, true, db);
  await drain(t, during(() => setWebhook(h.user, other, db)));
  const swapped = getBoardSettings(h.user, db);
  ok("webhook changed mid-send → no stale id stored", swapped.messageId === null && swapped.updatedAt === null, JSON.stringify(swapped));
  setWebhook(h.user, h.url, db);
  db.exec("DELETE FROM notify_queue;");
  t += 2 * boardIntervalMs();
  await drain(t, during(() => setBoardEnabled(h.user, false, db)));
  const off = getBoardSettings(h.user, db);
  ok("switched off mid-send → id not resurrected, board stays off", !off.enabled && off.messageId === null && off.updatedAt === null, JSON.stringify(off));
}

async function testAxiosBoard(h: BoardHarness): Promise<void> {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter = (status: number, data: unknown): AxiosAdapter => async (cfg) => {
    seen.push(cfg);
    return { status, statusText: "", data, headers: {}, config: cfg };
  };
  const posted = await axiosTransport(axios.create({ adapter: adapter(200, { id: ID_A, channel_id: "1" }) })).post(h.url, FAKE_BOARD, { wait: true });
  h.ok("POST wait=true → ?wait=true URL", seen[0]?.method === "post" && seen[0]?.url === `${h.url}?wait=true`, seen[0]?.url?.replace(h.token, "<t>"));
  h.ok("POST wait=true → message id parsed", posted.kind === "ok" && posted.messageId === ID_A, JSON.stringify(posted));
  await axiosTransport(axios.create({ adapter: adapter(200, { id: ID_A }) })).edit(h.url, ID_A, FAKE_BOARD);
  const body = typeof seen[1]?.data === "string" ? (JSON.parse(seen[1].data) as Record<string, unknown>) : {};
  h.ok("edit → PATCH …/messages/{id}", seen[1]?.method === "patch" && seen[1]?.url === `${h.url}/messages/${ID_A}`);
  h.ok("edit body keeps allowed_mentions, drops username", "allowed_mentions" in body && !("username" in body), Object.keys(body).join(","));
  const gone = await axiosTransport(axios.create({ adapter: adapter(404, { message: "Unknown Message", code: 10008 }) })).edit(h.url, ID_A, FAKE_BOARD);
  h.ok("edit 404 → rejected with status 404 and Discord code 10008", gone.kind === "rejected" && gone.status === 404 && gone.code === 10008 && !gone.detail.includes(h.token), JSON.stringify(gone));
  const before = seen.length;
  const bad = await axiosTransport(axios.create({ adapter: adapter(200, {}) })).edit(h.url, "../../evil", FAKE_BOARD);
  h.ok("non-snowflake id → rejected without any request", bad.kind === "rejected" && seen.length === before);
}

/** The real renderer against the temp DB (no market data): must still produce a valid, bounded board. */
function testRealRender(h: BoardHarness): void {
  const m = renderBoard(h.user, h.t0);
  h.ok("real board renders on an empty DB within limits", m.embeds.length === 1 && messageChars(m) <= 5800, String(messageChars(m)));
}

export async function runBoardTests(h: BoardHarness): Promise<void> {
  testRenderer(h);
  await testLifecycle(h);
  await testMidSendRaces(h);
  await testAxiosBoard(h);
  testRealRender(h);
}
