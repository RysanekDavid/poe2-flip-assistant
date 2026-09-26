import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { applicationSchemaSql } from "../db/schemaFiles";
import { verifyPassword } from "../auth/credentials";
import { beginCoachTurn, completeCoachTurn, listCoachConversations } from "../db/coachHistoryQueries";
import { ensureSmokeUser, purgeSmokeConversations, SMOKE_USER_NAME } from "./deploySmokeCore";

const db = new Database(":memory:");
db.pragma("foreign_keys = ON");
db.exec(applicationSchemaSql());
db.prepare(
  "INSERT INTO users (id, name, password_hash, api_key, role) VALUES (1, 'owner', 'hash', 'pk_owner', 'owner')",
).run();

const smokeId = ensureSmokeUser(db);
assert.notEqual(smokeId, 1, "deploy smokes must never run as the owner");
assert.equal(ensureSmokeUser(db), smokeId, "ensure is idempotent across deploys");
const row = db.prepare("SELECT role, password_hash FROM users WHERE id = ?").get(smokeId) as {
  role: string;
  password_hash: string;
};
assert.equal(row.role, "member");

commitTurn(1, "00000000-0000-4000-8000-000000000001");
commitTurn(smokeId, "00000000-0000-4000-8000-000000000002");
commitTurn(smokeId, "00000000-0000-4000-8000-000000000003");
db.prepare(`
  INSERT INTO coach_conversation_leases (user_id, conversation_id, turn_id, expires_at)
  VALUES (?, '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005', 1)
`).run(smokeId);
assert.equal(purgeSmokeConversations(db, smokeId), 2);
assert.equal(listCoachConversations(smokeId, db).length, 0);
assert.equal(listCoachConversations(1, db).length, 1, "the owner's history is untouched");
const leases = db.prepare("SELECT COUNT(*) AS c FROM coach_conversation_leases WHERE user_id = ?")
  .get(smokeId) as { c: number };
assert.equal(leases.c, 0);

// A real account that happens to use the reserved name is never adopted as the smoke user.
db.prepare("UPDATE users SET password_hash = 'scrypt$aa$bb' WHERE id = ?").run(smokeId);
assert.throws(() => ensureSmokeUser(db), new RegExp(SMOKE_USER_NAME));

db.close();

// verifyPassword is async (scrypt off the event loop); CommonJS tsx has no top-level await.
assertSmokeUserCannotLogIn(row.password_hash)
  .then(() => console.log("ALL PASS — deploy smoke user is isolated, no-login, and cleaned up"))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });

async function assertSmokeUserCannotLogIn(passwordHash: string): Promise<void> {
  for (const guess of ["", "deploy-smoke", passwordHash, "password"]) {
    assert.equal(await verifyPassword(guess, passwordHash), false, "smoke user must not be able to log in");
  }
}

function commitTurn(userId: number, conversationId: string): void {
  const input = {
    conversationId,
    turnId: "10000000-0000-4000-8000-000000000001",
    expectedTurnCount: 0,
    message: "smoke",
    answer: "answer",
    toolsUsed: [],
    processorsUsed: [],
    sources: [],
    nowMs: 1_900_000_000_000,
  };
  assert.equal(beginCoachTurn(userId, input, db).kind, "acquired");
  completeCoachTurn(userId, input, db);
}
