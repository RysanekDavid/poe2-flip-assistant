import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config/env";

/**
 * Authenticated symmetric encryption for secrets stored at rest (per-user POESESSID).
 * AES-256-GCM. Key is derived from SECRET_KEY (or AUTH_SECRET as a fallback) via scrypt.
 * Token format: "v1.<iv>.<tag>.<cipher>" (each part base64url).
 *
 * Fails loud in production if no key material is set — never encrypt account session
 * cookies under an empty/guessable key.
 */

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const material = config.secretKey || config.authSecret;
  if (!material) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SECRET_KEY (or AUTH_SECRET) is required in production to encrypt stored secrets");
    }
    cachedKey = scryptSync("dev-insecure-secretbox-key", "poe2flip", 32); // dev-only; prod throws above
    return cachedKey;
  }
  cachedKey = scryptSync(material, "poe2flip-secretbox-v1", 32);
  return cachedKey;
}

const PREFIX = "v1";

/** Encrypt a UTF-8 string → "v1.<iv>.<tag>.<cipher>" (base64url parts). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

/** Decrypt a token from encryptSecret. Throws on tamper / wrong key / bad format. */
export function decryptSecret(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error("bad secret token format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[1]!, "base64url"));
  d.setAuthTag(Buffer.from(parts[2]!, "base64url"));
  return Buffer.concat([d.update(Buffer.from(parts[3]!, "base64url")), d.final()]).toString("utf8");
}
