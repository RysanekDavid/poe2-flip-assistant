import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  CoachHistoryError,
  beginCoachTurn,
  completeCoachTurn,
  deleteCoachConversation,
  getCoachConversation,
  listCoachConversations,
  normalizeCoachTitle,
  releaseCoachTurn,
  renameCoachConversation,
  type CompleteCoachTurnInput,
} from "../db/coachHistoryQueries";

const db = new Database(":memory:");
db.pragma("foreign_keys = ON");
db.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));
db.prepare(`
  INSERT INTO users (id, name, password_hash, api_key, role)
  VALUES (?, ?, 'hash', ?, 'member')
`).run(1, "one", "pk_one");
db.prepare(`
  INSERT INTO users (id, name, password_hash, api_key, role)
  VALUES (?, ?, 'hash', ?, 'member')
`).run(2, "two", "pk_two");

assert.equal(normalizeCoachTitle("  hello\n  world  "), "hello world");
const emojiTitle = normalizeCoachTitle("😀".repeat(65));
assert.equal([...emojiTitle].length, 64);
assert.ok(emojiTitle.endsWith("…"));

testAtomicFirstTurn();
testIdempotenceAndLeases();
testHistoryAndLimits();
testPruningAndActiveLease();
testOwnershipAndStrictJson();
testEmojiTitleRoundTrip();

db.close();
console.log("ALL PASS — persisted Coach history, leases, limits and isolation");

function testAtomicFirstTurn(): void {
  const conversationId = uuid(1);
  const turnId = uuid(2);
  const pending = turnInput(conversationId, turnId, 0, "  First   useful question  ");
  assert.equal(beginCoachTurn(1, pending, db).kind, "acquired");
  assert.equal(rowCount("coach_conversations", 1), 0);
  assert.equal(rowCount("coach_turns", 1), 0);
  releaseCoachTurn(1, conversationId, turnId, db);
  assert.equal(rowCount("coach_conversations", 1), 0);
  assert.equal(beginCoachTurn(1, pending, db).kind, "acquired");
  const stored = completeCoachTurn(1, pending, db);
  assert.equal(stored.ordinal, 1);
  const detail = getCoachConversation(1, conversationId, db);
  assert.equal(detail.conversation.title, "First useful question");
  assert.equal(detail.messages.length, 2);
  assert.deepEqual(detail.messages[1]?.toolsUsed, ["retrieve_knowledge"]);
  assert.equal(detail.messages[1]?.sources[0]?.id, "K1");
}

function testIdempotenceAndLeases(): void {
  const conversationId = uuid(10);
  const first = turnInput(conversationId, uuid(11), 0, "same prompt");
  assert.equal(beginCoachTurn(1, first, db).kind, "acquired");
  completeCoachTurn(1, first, db);
  const replay = beginCoachTurn(1, first, db);
  assert.equal(replay.kind, "replay");
  if (replay.kind === "replay") assert.equal(replay.turn.assistantAnswer, "answer");
  expectHistoryError(
    () => beginCoachTurn(1, { ...first, message: "different prompt" }, db),
    "idempotency_conflict",
  );
  expectHistoryError(
    () => beginCoachTurn(1, turnInput(conversationId, uuid(12), 0, "stale"), db),
    "stale_conversation",
  );
  const active = turnInput(conversationId, uuid(13), 1, "active", 1_000, 100);
  beginCoachTurn(1, active, db);
  expectHistoryError(
    () => beginCoachTurn(1, turnInput(conversationId, uuid(14), 1, "busy", 1_050), db),
    "conversation_busy",
  );
  const recovered = turnInput(conversationId, uuid(15), 1, "recovered", 1_101);
  assert.equal(beginCoachTurn(1, recovered, db).kind, "acquired");
  releaseCoachTurn(1, conversationId, recovered.turnId, db);
}

function testHistoryAndLimits(): void {
  const conversationId = uuid(100);
  for (let ordinal = 0; ordinal < 8; ordinal += 1) {
    commit(1, turnInput(conversationId, uuid(101 + ordinal), ordinal, `question ${ordinal}`));
  }
  const next = turnInput(conversationId, uuid(120), 8, "ninth");
  const acquired = beginCoachTurn(1, next, db);
  assert.equal(acquired.kind, "acquired");
  if (acquired.kind === "acquired") {
    assert.equal(acquired.history.length, 14);
    assert.equal(acquired.history[0]?.content, "question 1");
    assert.equal(acquired.history.at(-1)?.role, "assistant");
  }
  releaseCoachTurn(1, conversationId, next.turnId, db);

  const fullId = uuid(200);
  for (let ordinal = 0; ordinal < 50; ordinal += 1) {
    commit(1, turnInput(fullId, uuid(201 + ordinal), ordinal, `full ${ordinal}`));
  }
  assert.equal(getCoachConversation(1, fullId, db).conversation.turnCount, 50);
  expectHistoryError(
    () => beginCoachTurn(1, turnInput(fullId, uuid(260), 50, "too many"), db),
    "conversation_full",
  );
}

function testPruningAndActiveLease(): void {
  const base = 1_800_000_000_000;
  const ids = Array.from({ length: 20 }, (_, index) => uuid(300 + index));
  ids.forEach((id, index) => {
    commit(1, {
      ...turnInput(id, uuid(400 + index), 0, `conversation ${index}`, base + index),
      completedAt: new Date(base + index).toISOString(),
    });
  });
  const protectedId = ids[0]!;
  const protectedTurn = turnInput(protectedId, uuid(500), 1, "leased", base + 100, 10_000);
  beginCoachTurn(1, protectedTurn, db);
  const newest = turnInput(uuid(501), uuid(502), 0, "newest", base + 200);
  commit(1, { ...newest, completedAt: new Date(base + 200).toISOString() });
  const conversations = listCoachConversations(1, db);
  assert.equal(conversations.length, 20);
  assert.ok(conversations.some((conversation) => conversation.id === protectedId));
  releaseCoachTurn(1, protectedId, protectedTurn.turnId, db);

  const cascadeId = uuid(503);
  commit(2, turnInput(cascadeId, uuid(504), 0, "cascade"));
  deleteCoachConversation(2, cascadeId, db);
  assert.equal(rowCount("coach_turns", 2), 0);
}

function testOwnershipAndStrictJson(): void {
  const conversationId = uuid(600);
  commit(1, turnInput(conversationId, uuid(601), 0, "private", 1_900_000_000_000));
  expectHistoryError(() => getCoachConversation(2, conversationId, db), "not_found");
  expectHistoryError(() => renameCoachConversation(2, conversationId, "stolen", db), "not_found");
  expectHistoryError(() => deleteCoachConversation(2, conversationId, db), "not_found");
  assert.equal(renameCoachConversation(1, conversationId, " Renamed ", db).title, "Renamed");

  db.pragma("ignore_check_constraints = ON");
  db.prepare(`
    UPDATE coach_turns SET tools_json = '{"unexpected":true}'
    WHERE user_id = ? AND conversation_id = ?
  `).run(1, conversationId);
  db.pragma("ignore_check_constraints = OFF");
  assert.throws(() => getCoachConversation(1, conversationId, db));
}

function testEmojiTitleRoundTrip(): void {
  // 64 astral code points = 128 UTF-16 units; the read contract must accept what
  // the write path stores or the whole sidebar 500s on one emoji-heavy prompt.
  const conversationId = uuid(700);
  commit(1, turnInput(conversationId, uuid(701), 0, "🧿".repeat(64), 1_950_000_000_000));
  const summary = listCoachConversations(1, db)
    .find((conversation) => conversation.id === conversationId);
  assert.ok(summary);
  assert.equal([...summary.title].length, 64);
  assert.equal(getCoachConversation(1, conversationId, db).conversation.title, summary.title);
}

function commit(userId: number, input: CompleteCoachTurnInput): void {
  assert.equal(beginCoachTurn(userId, input, db).kind, "acquired");
  completeCoachTurn(userId, input, db);
}

function turnInput(
  conversationId: string,
  turnId: string,
  expectedTurnCount: number,
  message: string,
  nowMs = 1_700_000_000_000 + expectedTurnCount,
  leaseMs = 180_000,
): CompleteCoachTurnInput {
  return {
    conversationId,
    turnId,
    expectedTurnCount,
    message,
    answer: "answer",
    toolsUsed: ["retrieve_knowledge"],
    processorsUsed: ["deterministic_item_inspection"],
    sources: [{ id: "K1", type: "knowledge", title: "Source", url: "https://example.com" }],
    nowMs,
    leaseMs,
    completedAt: new Date(nowMs).toISOString(),
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function rowCount(table: "coach_conversations" | "coach_turns", userId: number): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`).get(userId) as {
    count: number;
  };
  return row.count;
}

function expectHistoryError(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => {
    return error instanceof CoachHistoryError && error.code === code;
  });
}
