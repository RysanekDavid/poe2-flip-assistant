import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { genApiKey } from "../auth/credentials";

/** Dedicated member account for deploy smokes, so no deploy ever writes into a real user's data. */
export const SMOKE_USER_NAME = "deploy-smoke";

/**
 * Not a `scrypt$salt$hash` record, so verifyPassword rejects every password: the account can
 * only be used through a session token signed on the server by deploy.sh.
 */
const DISABLED_HASH_PREFIX = "disabled$deploy-smoke$";

interface SmokeUserRow {
  id: number;
  role: string;
  password_hash: string;
}

/** Create the smoke user once, or return it — refusing to adopt any account that can log in. */
export function ensureSmokeUser(database: Database.Database): number {
  const existing = database
    .prepare("SELECT id, role, password_hash FROM users WHERE name = ? COLLATE NOCASE")
    .get(SMOKE_USER_NAME) as SmokeUserRow | undefined;
  if (existing) {
    if (existing.role !== "member" || !existing.password_hash.startsWith(DISABLED_HASH_PREFIX)) {
      throw new Error(
        `user "${SMOKE_USER_NAME}" exists but is not the no-login smoke member; refusing to use it`,
      );
    }
    return existing.id;
  }
  const hash = `${DISABLED_HASH_PREFIX}${randomBytes(24).toString("hex")}`;
  const info = database
    .prepare("INSERT INTO users (name, password_hash, api_key, role) VALUES (?, ?, ?, 'member')")
    .run(SMOKE_USER_NAME, hash, genApiKey());
  return Number(info.lastInsertRowid);
}

/** Remove every Coach conversation and lease the smoke user owns; returns conversations removed. */
export function purgeSmokeConversations(database: Database.Database, userId: number): number {
  const purge = database.transaction((): number => {
    database.prepare("DELETE FROM coach_conversation_leases WHERE user_id = ?").run(userId);
    return database.prepare("DELETE FROM coach_conversations WHERE user_id = ?").run(userId).changes;
  });
  return purge.immediate();
}
