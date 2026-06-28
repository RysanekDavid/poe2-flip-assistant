import "../config/env"; // load .env.local (AUTH_SECRET, DB_PATH) before touching the DB
import { createUser, getUserByName } from "../db/userQueries";

/**
 * Provision a user (you manage the accounts manually for now).
 *   npx tsx src/scripts/addUser.ts <name> <password> [owner|member]
 * Prints the agent api_key once — the local agent uses it as a Bearer token to push
 * balance/hunt data. Treat it like a password.
 */
function main(): void {
  const [name, password, role] = process.argv.slice(2);
  if (!name || !password) {
    console.error("usage: tsx src/scripts/addUser.ts <name> <password> [owner|member]");
    process.exit(1);
  }
  if (getUserByName(name)) {
    console.error(`user "${name}" already exists`);
    process.exit(1);
  }
  const roleVal = role === "owner" ? "owner" : "member";
  const u = createUser(name, password, roleVal);
  console.log(`created user #${u.id} "${u.name}" (${u.role})`);
  console.log(`agent api_key: ${u.api_key}`);
  console.log("give this key to that user's local agent; it won't be shown again.");
}

main();
