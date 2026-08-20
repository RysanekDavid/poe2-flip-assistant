import type Database from "better-sqlite3";
import { z } from "zod";
import { getDb } from "./database";
import {
  coachConversationDetailSchema,
  coachConversationListSchema,
  type CoachConversationDetail,
  type CoachConversationSummary,
  type CoachHistoryMessage,
} from "../lib/coachHistoryContract";
import { coachSourceSchema, type CoachSource } from "../lib/coachContract";

const stringArraySchema = z.array(z.string().min(1));
const sourceArraySchema = z.array(coachSourceSchema);
const MAX_CONVERSATIONS = 20;
const MAX_TURNS = 50;
const DEFAULT_LEASE_MS = 180_000;

export type CoachHistoryErrorCode =
  | "not_found"
  | "conversation_busy"
  | "stale_conversation"
  | "idempotency_conflict"
  | "conversation_full";

export class CoachHistoryError extends Error {
  public constructor(public readonly code: CoachHistoryErrorCode) {
    super(code);
    this.name = "CoachHistoryError";
  }
}

export interface BeginCoachTurnInput {
  conversationId: string;
  turnId: string;
  expectedTurnCount: number;
  message: string;
  nowMs?: number;
  leaseMs?: number;
}

export interface CompleteCoachTurnInput extends BeginCoachTurnInput {
  answer: string;
  toolsUsed: string[];
  processorsUsed: string[];
  sources: CoachSource[];
  completedAt?: string;
}

export interface StoredCoachTurn {
  conversationId: string;
  turnId: string;
  ordinal: number;
  userMessage: string;
  assistantAnswer: string;
  toolsUsed: string[];
  processorsUsed: string[];
  sources: CoachSource[];
  completedAt: string;
}

export interface ModelHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export type BeginCoachTurnResult =
  | { kind: "acquired"; history: ModelHistoryMessage[] }
  | { kind: "replay"; turn: StoredCoachTurn; turnCount: number };

interface ConversationRow {
  id: string;
  title: string;
  turn_count: number;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

interface TurnRow {
  conversation_id: string;
  turn_id: string;
  ordinal: number;
  user_message: string;
  assistant_answer: string;
  tools_json: string;
  processors_json: string;
  sources_json: string;
  completed_at: string;
  turn_count?: number;
}

interface LeaseRow {
  turn_id: string;
}

export function normalizeCoachTitle(message: string): string {
  const normalized = message.trim().replace(/\s+/gu, " ");
  const codepoints = [...normalized];
  return codepoints.length <= 64 ? normalized : `${codepoints.slice(0, 63).join("")}…`;
}

export function listCoachConversations(
  userId: number,
  database: Database.Database = getDb(),
): CoachConversationSummary[] {
  const rows = database.prepare(`
    SELECT id, title, turn_count, created_at, updated_at, last_message_at
    FROM coach_conversations
    WHERE user_id = ?
    ORDER BY last_message_at DESC, id DESC
    LIMIT 20
  `).all(userId) as ConversationRow[];
  return coachConversationListSchema.parse({ conversations: rows.map(conversationSummary) })
    .conversations;
}

export function getCoachConversation(
  userId: number,
  conversationId: string,
  database: Database.Database = getDb(),
): CoachConversationDetail {
  const conversation = findConversation(userId, conversationId, database);
  if (!conversation) throw new CoachHistoryError("not_found");
  const turns = database.prepare(`
    SELECT conversation_id, turn_id, ordinal, user_message, assistant_answer,
           tools_json, processors_json, sources_json, completed_at
    FROM coach_turns
    WHERE user_id = ? AND conversation_id = ?
    ORDER BY ordinal ASC
  `).all(userId, conversationId) as TurnRow[];
  return coachConversationDetailSchema.parse({
    conversation: conversationSummary(conversation),
    messages: turns.flatMap(historyMessages),
  });
}

export function renameCoachConversation(
  userId: number,
  conversationId: string,
  title: string,
  database: Database.Database = getDb(),
): CoachConversationSummary {
  const normalized = title.trim();
  const now = new Date().toISOString();
  const rename = database.transaction(() => {
    const result = database.prepare(`
      UPDATE coach_conversations SET title = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(normalized, now, userId, conversationId);
    if (result.changes !== 1) throw new CoachHistoryError("not_found");
    const row = findConversation(userId, conversationId, database);
    if (!row) throw new CoachHistoryError("not_found");
    return conversationSummary(row);
  });
  return rename.immediate();
}

export function deleteCoachConversation(
  userId: number,
  conversationId: string,
  database: Database.Database = getDb(),
): void {
  const remove = database.transaction(() => {
    database.prepare(`
      DELETE FROM coach_conversation_leases WHERE user_id = ? AND conversation_id = ?
    `).run(userId, conversationId);
    const result = database.prepare(`
      DELETE FROM coach_conversations WHERE user_id = ? AND id = ?
    `).run(userId, conversationId);
    if (result.changes !== 1) throw new CoachHistoryError("not_found");
  });
  remove.immediate();
}

export function beginCoachTurn(
  userId: number,
  input: BeginCoachTurnInput,
  database: Database.Database = getDb(),
): BeginCoachTurnResult {
  const nowMs = input.nowMs ?? Date.now();
  const acquire = database.transaction(() => {
    const replay = findTurn(userId, input.conversationId, input.turnId, database);
    if (replay) return replayResult(replay, input.message);
    database.prepare(`
      DELETE FROM coach_conversation_leases
      WHERE user_id = ? AND conversation_id = ? AND expires_at <= ?
    `).run(userId, input.conversationId, nowMs);
    validateTurnBoundary(userId, input, database);
    const lease = database.prepare(`
      SELECT turn_id FROM coach_conversation_leases
      WHERE user_id = ? AND conversation_id = ?
    `).get(userId, input.conversationId) as LeaseRow | undefined;
    if (lease) throw new CoachHistoryError("conversation_busy");
    database.prepare(`
      INSERT INTO coach_conversation_leases
        (user_id, conversation_id, turn_id, expires_at) VALUES (?, ?, ?, ?)
    `).run(
      userId,
      input.conversationId,
      input.turnId,
      nowMs + (input.leaseMs ?? DEFAULT_LEASE_MS),
    );
    return {
      kind: "acquired",
      history: recentModelHistory(userId, input.conversationId, database),
    } satisfies BeginCoachTurnResult;
  });
  return acquire.immediate();
}

export function completeCoachTurn(
  userId: number,
  input: CompleteCoachTurnInput,
  database: Database.Database = getDb(),
): StoredCoachTurn {
  const complete = database.transaction(() => {
    const replay = findTurn(userId, input.conversationId, input.turnId, database);
    if (replay) return replayResult(replay, input.message).turn;
    requireOwnedLease(userId, input, database);
    let conversation = findConversation(userId, input.conversationId, database);
    const completedAt = input.completedAt ?? new Date().toISOString();
    if (!conversation) {
      insertConversation(userId, input, completedAt, database);
      conversation = findConversation(userId, input.conversationId, database);
    }
    if (!conversation) throw new CoachHistoryError("not_found");
    if (conversation.turn_count !== input.expectedTurnCount) {
      throw new CoachHistoryError("stale_conversation");
    }
    if (conversation.turn_count >= MAX_TURNS) throw new CoachHistoryError("conversation_full");
    insertTurn(userId, input, conversation.turn_count + 1, completedAt, database);
    incrementConversation(userId, input.conversationId, completedAt, database);
    releaseCoachTurn(userId, input.conversationId, input.turnId, database);
    pruneCoachConversations(userId, input.nowMs ?? Date.now(), database);
    const stored = findTurn(userId, input.conversationId, input.turnId, database);
    if (!stored) throw new CoachHistoryError("not_found");
    return storedTurn(stored);
  });
  return complete.immediate();
}

export function releaseCoachTurn(
  userId: number,
  conversationId: string,
  turnId: string,
  database: Database.Database = getDb(),
): void {
  database.prepare(`
    DELETE FROM coach_conversation_leases
    WHERE user_id = ? AND conversation_id = ? AND turn_id = ?
  `).run(userId, conversationId, turnId);
}

function validateTurnBoundary(
  userId: number,
  input: BeginCoachTurnInput,
  database: Database.Database,
): void {
  const conversation = findConversation(userId, input.conversationId, database);
  const count = conversation?.turn_count ?? 0;
  if (count !== input.expectedTurnCount) throw new CoachHistoryError("stale_conversation");
  if (count >= MAX_TURNS) throw new CoachHistoryError("conversation_full");
}

function requireOwnedLease(
  userId: number,
  input: CompleteCoachTurnInput,
  database: Database.Database,
): void {
  const lease = database.prepare(`
    SELECT turn_id FROM coach_conversation_leases
    WHERE user_id = ? AND conversation_id = ?
  `).get(userId, input.conversationId) as LeaseRow | undefined;
  if (!lease || lease.turn_id !== input.turnId) {
    throw new CoachHistoryError("conversation_busy");
  }
}

function insertConversation(
  userId: number,
  input: CompleteCoachTurnInput,
  completedAt: string,
  database: Database.Database,
): void {
  database.prepare(`
    INSERT INTO coach_conversations
      (user_id, id, title, turn_count, created_at, updated_at, last_message_at)
    VALUES (?, ?, ?, 0, ?, ?, ?)
  `).run(
    userId,
    input.conversationId,
    normalizeCoachTitle(input.message),
    completedAt,
    completedAt,
    completedAt,
  );
}

function insertTurn(
  userId: number,
  input: CompleteCoachTurnInput,
  ordinal: number,
  completedAt: string,
  database: Database.Database,
): void {
  const tools = stringArraySchema.parse(input.toolsUsed);
  const processors = stringArraySchema.parse(input.processorsUsed);
  const sources = sourceArraySchema.parse(input.sources);
  database.prepare(`
    INSERT INTO coach_turns
      (user_id, conversation_id, turn_id, ordinal, user_message, assistant_answer,
       tools_json, processors_json, sources_json, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    input.conversationId,
    input.turnId,
    ordinal,
    input.message,
    input.answer,
    JSON.stringify(tools),
    JSON.stringify(processors),
    JSON.stringify(sources),
    completedAt,
  );
}

function incrementConversation(
  userId: number,
  conversationId: string,
  completedAt: string,
  database: Database.Database,
): void {
  const result = database.prepare(`
    UPDATE coach_conversations
    SET turn_count = turn_count + 1, updated_at = ?, last_message_at = ?
    WHERE user_id = ? AND id = ?
  `).run(completedAt, completedAt, userId, conversationId);
  if (result.changes !== 1) throw new CoachHistoryError("not_found");
}

function pruneCoachConversations(
  userId: number,
  nowMs: number,
  database: Database.Database,
): void {
  const countRow = database.prepare(`
    SELECT COUNT(*) AS count FROM coach_conversations WHERE user_id = ?
  `).get(userId) as { count: number };
  const excess = countRow.count - MAX_CONVERSATIONS;
  if (excess <= 0) return;
  const rows = database.prepare(`
    SELECT c.id FROM coach_conversations AS c
    WHERE c.user_id = ? AND NOT EXISTS (
      SELECT 1 FROM coach_conversation_leases AS lease
      WHERE lease.user_id = c.user_id AND lease.conversation_id = c.id
        AND lease.expires_at > ?
    )
    ORDER BY c.last_message_at ASC, c.id ASC
    LIMIT ?
  `).all(userId, nowMs, excess) as Array<{ id: string }>;
  const remove = database.prepare(`
    DELETE FROM coach_conversations WHERE user_id = ? AND id = ?
  `);
  for (const row of rows) remove.run(userId, row.id);
}

function findConversation(
  userId: number,
  conversationId: string,
  database: Database.Database,
): ConversationRow | undefined {
  return database.prepare(`
    SELECT id, title, turn_count, created_at, updated_at, last_message_at
    FROM coach_conversations WHERE user_id = ? AND id = ?
  `).get(userId, conversationId) as ConversationRow | undefined;
}

function findTurn(
  userId: number,
  conversationId: string,
  turnId: string,
  database: Database.Database,
): TurnRow | undefined {
  return database.prepare(`
    SELECT turn.conversation_id, turn.turn_id, turn.ordinal, turn.user_message,
           turn.assistant_answer, turn.tools_json, turn.processors_json,
           turn.sources_json, turn.completed_at, conversation.turn_count
    FROM coach_turns AS turn
    JOIN coach_conversations AS conversation
      ON conversation.user_id = turn.user_id AND conversation.id = turn.conversation_id
    WHERE turn.user_id = ? AND turn.conversation_id = ? AND turn.turn_id = ?
  `).get(userId, conversationId, turnId) as TurnRow | undefined;
}

function recentModelHistory(
  userId: number,
  conversationId: string,
  database: Database.Database,
): ModelHistoryMessage[] {
  const rows = database.prepare(`
    SELECT user_message, assistant_answer FROM (
      SELECT ordinal, user_message, assistant_answer FROM coach_turns
      WHERE user_id = ? AND conversation_id = ?
      ORDER BY ordinal DESC LIMIT 7
    ) ORDER BY ordinal ASC
  `).all(userId, conversationId) as Array<{
    user_message: string;
    assistant_answer: string;
  }>;
  return rows.flatMap((row) => [
    { role: "user" as const, content: row.user_message },
    { role: "assistant" as const, content: row.assistant_answer },
  ]);
}

function replayResult(row: TurnRow, message: string): BeginCoachTurnResult & { turn: StoredCoachTurn } {
  if (row.user_message !== message) throw new CoachHistoryError("idempotency_conflict");
  return { kind: "replay", turn: storedTurn(row), turnCount: row.turn_count ?? row.ordinal };
}

function storedTurn(row: TurnRow): StoredCoachTurn {
  return {
    conversationId: row.conversation_id,
    turnId: row.turn_id,
    ordinal: row.ordinal,
    userMessage: row.user_message,
    assistantAnswer: row.assistant_answer,
    toolsUsed: parseJson(row.tools_json, stringArraySchema),
    processorsUsed: parseJson(row.processors_json, stringArraySchema),
    sources: parseJson(row.sources_json, sourceArraySchema),
    completedAt: isoTimestamp(row.completed_at),
  };
}

function conversationSummary(row: ConversationRow): CoachConversationSummary {
  return {
    id: row.id,
    title: row.title,
    turnCount: row.turn_count,
    messageCount: row.turn_count * 2,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
    lastMessageAt: isoTimestamp(row.last_message_at),
  };
}

function historyMessages(row: TurnRow): CoachHistoryMessage[] {
  const turn = storedTurn(row);
  return [
    {
      id: `${turn.turnId}:user`, turnId: turn.turnId, role: "user",
      content: turn.userMessage, toolsUsed: [], processorsUsed: [], sources: [],
      createdAt: turn.completedAt,
    },
    {
      id: `${turn.turnId}:assistant`, turnId: turn.turnId, role: "assistant",
      content: turn.assistantAnswer, toolsUsed: turn.toolsUsed,
      processorsUsed: turn.processorsUsed, sources: turn.sources,
      createdAt: turn.completedAt,
    },
  ];
}

function parseJson<T>(value: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(value) as unknown);
}

function isoTimestamp(value: string): string {
  const candidate = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(candidate);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Invalid Coach history timestamp");
  return parsed.toISOString();
}
