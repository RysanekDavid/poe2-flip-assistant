import { z } from "zod";
import { getDb } from "./database";
import { credStateSchema, type CredState, type CredStatus } from "../lib/poeSettingsContract";

/** Longest stored upstream error: enough to name the failure, too short to become a log dump. */
const MAX_ERROR_CHARS = 300;

const rowSchema = z.object({
  poe_cred_state: credStateSchema,
  poe_cred_checked_at: z.string().nullable(),
  poe_cred_error: z.string().nullable(),
});

/** A user's POESESSID health as last observed by a trade2 call (users.poe_cred_* columns). */
export function getCredStatus(userId: number): CredStatus {
  const row = getDb()
    .prepare("SELECT poe_cred_state, poe_cred_checked_at, poe_cred_error FROM users WHERE id = ?")
    .get(userId);
  if (row === undefined) throw new Error(`getCredStatus: no user ${userId}`);
  const r = rowSchema.parse(row);
  return { state: r.poe_cred_state, checkedAt: r.poe_cred_checked_at, error: r.poe_cred_error };
}

export function setCredStatus(userId: number, state: CredState, error: string | null, at: Date = new Date()): void {
  const res = getDb()
    .prepare("UPDATE users SET poe_cred_state = ?, poe_cred_checked_at = ?, poe_cred_error = ? WHERE id = ?")
    .run(state, at.toISOString(), error == null ? null : error.slice(0, MAX_ERROR_CHARS), userId);
  if (res.changes !== 1) throw new Error(`setCredStatus: no user ${userId}`);
}

/** A newly saved or removed cookie has not been tried yet — the old verdict no longer applies. */
export function resetCredStatus(userId: number): void {
  getDb()
    .prepare("UPDATE users SET poe_cred_state = 'unknown', poe_cred_checked_at = NULL, poe_cred_error = NULL WHERE id = ?")
    .run(userId);
}
