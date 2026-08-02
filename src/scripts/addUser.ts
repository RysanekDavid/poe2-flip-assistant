import "../config/env"; // load .env.local (AUTH_SECRET, DB_PATH) before touching the DB
import { createUser, getUserByName } from "../db/userQueries";
import { parsePasswordInput, parseProvisionArgs } from "./addUserInput";

/**
 * Provision a user (you manage the accounts manually for now).
 * Password input is piped from a shell's non-echoing read; it is never accepted in argv.
 * The generated agent API key stays in the database and is never printed by this workflow.
 */
async function main(): Promise<void> {
  const { name, role } = parseProvisionArgs(process.argv.slice(2));
  if (process.stdin.isTTY) {
    throw new Error("refusing echoed password input; pipe one line from a shell read -s command");
  }
  let input = "";
  for await (const chunk of process.stdin) input += String(chunk);
  const password = parsePasswordInput(input);
  if (getUserByName(name)) {
    throw new Error(`user "${name}" already exists`);
  }
  const u = createUser(name, password, role);
  console.log(`created user #${u.id} "${u.name}" (${u.role})`);
  console.log("No API key or password was printed. POESESSID remains unset.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
