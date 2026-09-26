import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password + API-key primitives (node:crypto only).
 * Passwords are stored as `scrypt$<saltHex>$<hashHex>` with Node's default scrypt cost
 * (N=16384, r=8, p=1). The format and cost are unchanged from the original sync
 * implementation, so every hash already in the database keeps verifying.
 */

const KEY_LENGTH = 64;

function scryptAsync(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

function encodeHash(salt: Buffer, derived: Buffer): string {
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Hash a password off the event loop (libuv threadpool) — use this on every request path. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return encodeHash(salt, await scryptAsync(password, salt, KEY_LENGTH));
}

/**
 * Synchronous hash for one-shot bootstrap only (seeding the owner inside the synchronous
 * `getDb()` initializer). Never call it from a request handler.
 */
export function hashPasswordSync(password: string): string {
  const salt = randomBytes(16);
  return encodeHash(salt, scryptSync(password, salt, KEY_LENGTH));
}

/** Verify a password against a stored hash without blocking the event loop. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt" || !parts[1] || !parts[2]) return false;
  const want = Buffer.from(parts[2], "hex");
  if (want.length === 0) return false;
  const derived = await scryptAsync(password, Buffer.from(parts[1], "hex"), want.length);
  return derived.length === want.length && timingSafeEqual(derived, want);
}

let dummyHash: Promise<string> | null = null;

/**
 * Burn one scrypt verification against a throwaway hash. Login calls this for unknown users so
 * "no such user" costs the same as "wrong password" and response time doesn't reveal usernames.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
}

export function genApiKey(): string {
  return "pk_" + randomBytes(24).toString("hex");
}
