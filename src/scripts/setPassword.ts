import "../config/env"; // load .env.local before touching the DB
import { getUserByName, setPassword } from "../db/userQueries";

/**
 * Reset a user's password (e.g. owner missed the temp password on first run).
 *   npx tsx src/scripts/setPassword.ts <name> <newPassword>
 */
function main(): void {
  const [name, password] = process.argv.slice(2);
  if (!name || !password) {
    console.error("usage: tsx src/scripts/setPassword.ts <name> <newPassword>");
    process.exit(1);
  }
  const u = getUserByName(name);
  if (!u) {
    console.error(`no user named "${name}"`);
    process.exit(1);
  }
  setPassword(u.id, password);
  console.log(`password updated for #${u.id} "${u.name}"`);
}

main();
