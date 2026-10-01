import type Database from "better-sqlite3";
import { getDb } from "../../db/database";
import {
  clearBoardMessageId,
  dropPending,
  dueRows,
  dueUserIds,
  getBoardSettings,
  lastAttemptAt,
  markFailed,
  markRetry,
  markSent,
  pruneQueue,
  readWebhook,
  recordBoardDelivery,
  type QueueRow,
} from "../../db/notifyQueries";
import { alertBatchMessage, embedMessage, MAX_EMBEDS, QueuedPayloadSchema, type DiscordMessage } from "./discordMessage";
import { axiosTransport, MessageIdSchema, type DeliveryResult, type DiscordTransport } from "./discordTransport";
import { enqueueDueBoards, renderBoard } from "./boardData";
import { enqueueDueDigests } from "./digest";
import { redactWebhook } from "./webhookUrl";

/**
 * Delivery policy. One message per user per 30 s is what keeps a snipe burst from becoming ten
 * pings (and stays far under Discord's 5-requests-per-2-s webhook bucket); up to 10 alerts ride
 * in that one message as separate embeds.
 *
 * Retries: 8 failed attempts with backoff 30 s → 60 s → … → 30 min (cap) span ~1 h, which rides
 * out a realistic Discord incident. A 429 is NOT a failed attempt — Discord told us exactly when
 * to come back, so it only moves next_attempt_at and never uses up the retry budget.
 *
 * Delivery is AT-LEAST-ONCE, deliberately: Discord webhooks have no idempotency key, so a POST
 * that Discord accepted but whose response we never saw (timeout, poller crash between the POST
 * and markSent) is retried and shows up twice. A rare duplicate ping is the accepted cost; do not
 * "fix" it by dropping retries — that trades a duplicate for a silently lost snipe.
 *
 * The live board inherits the same at-least-once rule: a POST ?wait=true whose response is lost
 * leaves an orphan board message in the channel (its id never stored) and the retry posts a second
 * one, which is then the one edited. Edits themselves are idempotent — a repeated PATCH is harmless.
 */
export const NOTIFY_POLICY = {
  windowMs: 30_000,
  maxAttempts: 8,
  baseBackoffMs: 30_000,
  maxBackoffMs: 30 * 60_000,
  drainEveryMs: 10_000,
} as const;

export interface DrainDeps {
  now: () => number;
  transport: DiscordTransport;
  db: Database.Database;
  /** Renders one user's live board at send time (injectable: tests must not need market data). */
  renderBoard: (userId: number, nowMs: number) => DiscordMessage;
}

export interface DrainSummary {
  sent: number; // queue rows delivered
  retried: number; // rows put back for a later attempt
  failed: number; // rows given up on
  throttled: number; // users skipped by the 30 s window
  digests: number; // digests queued this pass
  boards: number; // live board updates queued this pass
}

/** Exponential backoff after the Nth failed attempt: 30 s, 60 s, 120 s … capped at 30 min. */
export function backoffMs(attempt: number): number {
  return Math.min(NOTIFY_POLICY.baseBackoffMs * 2 ** Math.max(0, attempt - 1), NOTIFY_POLICY.maxBackoffMs);
}

/** A batch is either one digest, one board update, or a run of consecutive alert rows. */
function pickBatch(rows: QueueRow[]): QueueRow[] {
  if (rows[0]?.kind === "digest" || rows[0]?.kind === "board") return [rows[0]];
  const batch: QueueRow[] = [];
  for (const r of rows) {
    if (r.kind !== "alert" || batch.length === MAX_EMBEDS) break;
    batch.push(r);
  }
  return batch;
}

function buildMessage(batch: QueueRow[]): DiscordMessage {
  const first = batch[0];
  if (first?.kind === "digest") {
    const payload = QueuedPayloadSchema.parse(JSON.parse(first.payload_json ?? "null"));
    return embedMessage(payload.content, payload.embeds);
  }
  return alertBatchMessage(batch.map((r) => {
    if (!r.alert) throw new Error(`queue row ${r.queue_id} lost its alert`);
    return r.alert;
  }));
}

function applyResult(userId: number, batch: QueueRow[], result: DeliveryResult, now: number, deps: DrainDeps, sum: DrainSummary): void {
  const ids = batch.map((r) => r.queue_id);
  if (result.kind === "ok") {
    markSent(ids, now, deps.db);
    sum.sent += ids.length;
    return;
  }
  if (result.kind === "rejected") {
    markFailed(ids, now, result.detail, deps.db);
    sum.failed += ids.length;
    console.error(`[notify] user ${userId}: ${result.detail} — gave up on ${ids.length} deliver${ids.length === 1 ? "y" : "ies"} (fix the webhook on the Alerts page)`);
    return;
  }
  if (result.kind === "rate_limited") {
    const retryAt = now + result.retryAfterMs;
    deps.db.transaction(() => {
      for (const r of batch) markRetry(r.queue_id, now, retryAt, result.detail, { counts: false, giveUp: false }, deps.db);
    })();
    sum.retried += ids.length;
    console.warn(`[notify] user ${userId}: ${result.detail}`);
    return;
  }
  deps.db.transaction(() => {
    for (const r of batch) {
      const attempt = r.attempts + 1;
      const giveUp = attempt >= NOTIFY_POLICY.maxAttempts;
      markRetry(r.queue_id, now, now + backoffMs(attempt), result.detail, { counts: true, giveUp }, deps.db);
      if (giveUp) sum.failed++;
      else sum.retried++;
    }
  })();
  const gaveUp = batch.some((r) => r.attempts + 1 >= NOTIFY_POLICY.maxAttempts);
  const log = gaveUp ? console.error : console.warn;
  log(`[notify] user ${userId}: ${result.detail}${gaveUp ? ` — gave up after ${NOTIFY_POLICY.maxAttempts} attempts` : " — will retry"}`);
}

/** Deliver at most one message for one user. */
async function deliverForUser(userId: number, deps: DrainDeps, sum: DrainSummary): Promise<void> {
  const now = deps.now();
  const last = lastAttemptAt(userId, deps.db);
  if (last != null && now - last < NOTIFY_POLICY.windowMs) {
    sum.throttled++;
    return;
  }
  const webhook = readWebhook(userId, deps.db);
  if (webhook.state === "none") {
    const dropped = dropPending(userId, deps.db);
    console.warn(`[notify] user ${userId}: webhook removed — dropped ${dropped} undelivered notification(s)`);
    return;
  }
  const batch = pickBatch(dueRows(userId, now, MAX_EMBEDS, deps.db));
  if (batch.length === 0) return;
  if (webhook.state === "unreadable") {
    const ids = batch.map((r) => r.queue_id);
    markFailed(ids, now, "stored webhook cannot be decrypted (server key changed?) — paste it again on the Alerts page", deps.db);
    sum.failed += ids.length;
    return;
  }
  const first = batch[0];
  if (first?.kind === "board") return deliverBoard(userId, webhook.url, first, now, deps, sum);
  const message = tryBuild(userId, batch, now, () => buildMessage(batch), deps, sum);
  if (message == null) return;
  const result = await attempt(() => deps.transport.post(webhook.url, message));
  applyResult(userId, batch, result, now, deps, sum);
}

/** A message that cannot be built never will be: fail its rows loudly instead of retrying. */
function tryBuild(
  userId: number,
  batch: QueueRow[],
  now: number,
  build: () => DiscordMessage,
  deps: DrainDeps,
  sum: DrainSummary,
): DiscordMessage | null {
  try {
    return build();
  } catch (e) {
    const ids = batch.map((r) => r.queue_id);
    const detail = redactWebhook(`could not build the Discord message: ${e instanceof Error ? e.message : String(e)}`);
    markFailed(ids, now, detail, deps.db);
    sum.failed += ids.length;
    console.error(`[notify] user ${userId}: ${detail}`);
    return null;
  }
}

/** A throwing transport is still an attempt: recorded + backed off, so it cannot spin every tick. */
function attempt(send: () => Promise<DeliveryResult>): Promise<DeliveryResult> {
  return send().catch(
    (e: unknown): DeliveryResult => ({
      kind: "failed",
      detail: redactWebhook(`transport error: ${e instanceof Error ? e.message : String(e)}`),
    }),
  );
}

/** The stored board message id, or null (post a new board) when none — or a corrupt one — is stored. */
function boardMessageId(userId: number, db: Database.Database): string | null {
  const stored = getBoardSettings(userId, db).messageId;
  if (stored == null) return null;
  if (MessageIdSchema.safeParse(stored).success) return stored;
  console.error(`[notify] user ${userId}: stored board message id is not a Discord snowflake — posting a new board`);
  clearBoardMessageId(userId, db);
  return null;
}

/** Discord JSON error code for "Unknown Message" — the board message was deleted in the channel. */
const UNKNOWN_MESSAGE = 10008;

/**
 * Store the delivered board's id — unless, during the await, the user switched webhooks (the id
 * belongs to the old one and could never be edited through the new one) or switched the board off
 * (recordBoardDelivery only writes while board = 1, so a toggle-off is never undone).
 */
function recordIfCurrent(userId: number, sentTo: string, id: string | null, now: number, db: Database.Database): void {
  const current = readWebhook(userId, db);
  if (current.state !== "set" || current.url !== sentTo) {
    console.warn(`[notify] user ${userId}: webhook changed while the board was being sent — not storing its message id`);
    return;
  }
  if (id == null) console.error(`[notify] user ${userId}: Discord accepted the board but returned no message id — the next update posts a new one`);
  recordBoardDelivery(userId, id, now, db);
}

/**
 * One board update: edit the stored message, or POST ?wait=true and keep the returned id.
 *  - edit answered 404 / code 10008 (message deleted in Discord): forget the id and put the row
 *    back, so the next pass (after the per-user window — still one request per pass) posts afresh;
 *  - any other 4xx on an edit: forget the id too (a PATCH that failed once would fail every cycle)
 *    and fail the row normally — the next interval POSTs a new board, or fails again loudly if the
 *    webhook itself is gone (404 / code 10015).
 */
async function deliverBoard(userId: number, url: string, row: QueueRow, now: number, deps: DrainDeps, sum: DrainSummary): Promise<void> {
  const message = tryBuild(userId, [row], now, () => deps.renderBoard(userId, now), deps, sum);
  if (message == null) return;
  const editId = boardMessageId(userId, deps.db);
  const result = await attempt(() =>
    editId != null ? deps.transport.edit(url, editId, message) : deps.transport.post(url, message, { wait: true }),
  );
  if (editId != null && result.kind === "rejected") {
    clearBoardMessageId(userId, deps.db);
    if (result.code === UNKNOWN_MESSAGE) {
      markRetry(row.queue_id, now, now, result.detail, { counts: false, giveUp: false }, deps.db);
      sum.retried++;
      console.warn(`[notify] user ${userId}: board message gone (${result.detail}) — re-posting it`);
      return;
    }
  }
  if (result.kind === "ok") recordIfCurrent(userId, url, editId ?? result.messageId, now, deps.db);
  applyResult(userId, [row], result, now, deps, sum);
}

let lastPruneAt = 0;

/**
 * One drain pass: queue due digests and boards, then send at most one message per user whose
 * window is open. Per-user failures are recorded on their rows and never abort other users.
 */
export async function drainNotifications(overrides: Partial<DrainDeps> = {}): Promise<DrainSummary> {
  const deps: DrainDeps = {
    now: overrides.now ?? Date.now,
    transport: overrides.transport ?? axiosTransport(),
    db: overrides.db ?? getDb(),
    renderBoard: overrides.renderBoard ?? renderBoard,
  };
  const sum: DrainSummary = { sent: 0, retried: 0, failed: 0, throttled: 0, digests: 0, boards: 0 };
  sum.digests = enqueueDueDigests(deps.now(), deps.db);
  sum.boards = enqueueDueBoards(deps.now(), deps.db);
  for (const userId of dueUserIds(deps.now(), deps.db)) {
    await deliverForUser(userId, deps, sum);
  }
  if (deps.now() - lastPruneAt > 3600_000) {
    lastPruneAt = deps.now();
    pruneQueue(14, deps.db);
  }
  return sum;
}

/**
 * Poller hook: drain every 10 s, never overlapping (a slow Discord must not stack passes).
 * A pass that throws is logged loudly and the next tick tries again.
 */
export function startNotifyDrainer(): void {
  let running = false;
  console.log(`[notify] Discord drainer every ${NOTIFY_POLICY.drainEveryMs / 1000}s`);
  setInterval(() => {
    if (running) return;
    running = true;
    drainNotifications()
      .catch((e: unknown) => console.error("[notify] drain failed:", redactWebhook(e instanceof Error ? e.message : String(e))))
      .finally(() => {
        running = false;
      });
  }, NOTIFY_POLICY.drainEveryMs);
}
