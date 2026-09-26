import "../config/env"; // load .env.local before touching the DB
import { getUserByName, setPassword } from "../db/userQueries";

/**
 * Reset a user's password (e.g. owner missed the temp password on first run).
 * Also revokes every existing session of that user.
 *   npx tsx src/scripts/setPassword.ts <name> <newPassword>
 */
async function main(): Promise<void> {
  const [name, password] = process.argv.slice(2);
  if (!name || !password) {
    throw new Error("usage: tsx src/scripts/setPassword.ts <name> <newPassword>");
  }
  const u = getUserByName(name);
  if (!u) throw new Error(`no user named "${name}"`);
  await setPassword(u.id, password);
  console.log(`password updated for #${u.id} "${u.name}" (all sessions revoked)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
