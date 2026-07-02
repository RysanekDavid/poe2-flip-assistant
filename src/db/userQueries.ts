import { getDb } from "./database";
import { hashPassword, verifyPassword, genApiKey } from "../auth/auth";
import { encryptSecret, decryptSecret } from "../auth/secretbox";
import { type TradeCred } from "../api/tradeClient";

export type UserRole = "owner" | "member";

export interface UserRow {
  id: number;
  name: string;
  password_hash: string;
  api_key: string;
  role: UserRole;
  created_at: string;
}

/** Public-safe view of a user — never leak the password hash or (beyond setup) the api key. */
export interface UserPublic {
  id: number;
  name: string;
  role: UserRole;
}

export function toPublic(u: UserRow): UserPublic {
  return { id: u.id, name: u.name, role: u.role };
}

export function getUserById(id: number): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function getUserByName(name: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE name = ? COLLATE NOCASE").get(name) as UserRow | undefined;
}

export function getUserByApiKey(apiKey: string): UserRow | undefined {
  if (!apiKey) return undefined;
  return getDb().prepare("SELECT * FROM users WHERE api_key = ?").get(apiKey) as UserRow | undefined;
}

export function listUsers(): UserPublic[] {
  return (getDb().prepare("SELECT id, name, role FROM users ORDER BY id").all() as UserRow[]).map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
  }));
}

/** Create a user. `id` may be forced (used to seed the owner as id=1 so existing data backfills cleanly). */
export function createUser(name: string, password: string, role: UserRole = "member", id?: number): UserRow {
  const stmt = id
    ? getDb().prepare(
        "INSERT INTO users (id, name, password_hash, api_key, role) VALUES (@id, @name, @hash, @key, @role)",
      )
    : getDb().prepare("INSERT INTO users (name, password_hash, api_key, role) VALUES (@name, @hash, @key, @role)");
  const info = stmt.run({ id, name, hash: hashPassword(password), key: genApiKey(), role });
  return getUserById(Number(info.lastInsertRowid))!;
}

/** Verify a login. Returns the user on success, null on bad name/password. */
export function authenticate(name: string, password: string): UserRow | null {
  const u = getUserByName(name);
  if (!u || !verifyPassword(password, u.password_hash)) return null;
  return u;
}

export function setPassword(id: number, password: string): void {
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), id);
}

/** Rotate a user's agent API key (e.g. if it leaks). Returns the new key. */
export function rotateApiKey(id: number): string {
  const key = genApiKey();
  getDb().prepare("UPDATE users SET api_key = ? WHERE id = ?").run(key, id);
  return key;
}

export function userCount(): number {
  return (getDb().prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;
}

interface PoeCols {
  poesessid_enc: string | null;
  poe_contact: string | null;
  poe_account: string | null;
}

/** Save a user's trade2 credentials. poesessid: non-empty = replace, "" = KEEP the stored
 *  secret (the form field is blank on every visit — saving contact/account must not wipe it),
 *  null = explicit disconnect. */
export function setUserPoe(id: number, poesessid: string | null, contact: string, account: string): void {
  const db = getDb();
  if (poesessid === "") {
    db.prepare("UPDATE users SET poe_contact = ?, poe_account = ? WHERE id = ?").run(contact || null, account || null, id);
    return;
  }
  db.prepare("UPDATE users SET poesessid_enc = ?, poe_contact = ?, poe_account = ? WHERE id = ?")
    .run(poesessid ? encryptSecret(poesessid) : null, contact || null, account || null, id);
}

/** Decrypted trade2 cred for a user, or null if none stored / key can't decrypt it. */
export function getUserCred(id: number): TradeCred | null {
  const r = getDb()
    .prepare("SELECT poesessid_enc, poe_contact, poe_account FROM users WHERE id = ?")
    .get(id) as PoeCols | undefined;
  if (!r?.poesessid_enc) return null;
  try {
    return { poesessid: decryptSecret(r.poesessid_enc), contact: r.poe_contact ?? "", account: r.poe_account ?? "" };
  } catch {
    return null; // key rotated / token corrupt → treat as not connected
  }
}

/** Settings status for a user WITHOUT exposing the secret. */
export function getUserPoeStatus(id: number): { connected: boolean; contact: string; account: string } {
  const r = getDb()
    .prepare("SELECT poesessid_enc, poe_contact, poe_account FROM users WHERE id = ?")
    .get(id) as PoeCols | undefined;
  return { connected: !!r?.poesessid_enc, contact: r?.poe_contact ?? "", account: r?.poe_account ?? "" };
}
