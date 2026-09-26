import "../config/env"; // load .env.local (AUTH_SECRET, DB_PATH) before touching the DB
import { signSession } from "../auth/auth";
import { getDb } from "../db/database";
import { ensureSmokeUser, purgeSmokeConversations } from "./deploySmokeCore";

/** Long enough for the slowest optional live turn plus the checks around it. */
const SMOKE_SESSION_TTL_MS = 420_000;

/**
 * deploy.sh entrypoint.
 *   ensure  — create/verify the no-login smoke member, purge leftovers from an interrupted
 *             deploy, and print a short-lived session token for it (stdout only).
 *   cleanup — delete the smoke member's conversations after the smoke checks.
 */
function main(command: string | undefined): void {
  const database = getDb();
  const userId = ensureSmokeUser(database);
  if (command === "ensure") {
    purgeSmokeConversations(database, userId);
    process.stdout.write(`${signSession(userId, SMOKE_SESSION_TTL_MS)}\n`);
    return;
  }
  if (command === "cleanup") {
    const removed = purgeSmokeConversations(database, userId);
    console.log(`removed ${removed} deploy-smoke conversation(s)`);
    return;
  }
  throw new Error("usage: deploySmoke.ts ensure|cleanup");
}

try {
  main(process.argv[2]);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
