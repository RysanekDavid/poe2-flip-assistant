import type { NavMode } from "../lib/navMode";

export type ProvisionRole = "owner" | "member";

export interface ProvisionArgs {
  name: string;
  role: ProvisionRole;
  /** New accounts start in beginner nav; --advanced opts an experienced trader into the full nav. */
  navMode: NavMode;
}

const USAGE = "usage: addUser.ts <name> [owner|member] [--advanced] < password-on-stdin";

/** Parse only non-secret CLI metadata; passwords are never accepted in argv. */
export function parseProvisionArgs(args: readonly string[]): ProvisionArgs {
  const flags = args.filter((a) => a.startsWith("--"));
  const positional = args.filter((a) => !a.startsWith("--"));
  const unknown = flags.filter((f) => f !== "--advanced");
  if (unknown.length > 0) throw new Error(`unknown flag ${unknown.join(", ")} — ${USAGE}`);
  if (positional.length < 1 || positional.length > 2 || flags.length > 1) throw new Error(USAGE);
  const name = positional[0]?.trim() ?? "";
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(name)) {
    throw new Error("name must be 3-32 letters, digits, underscores or hyphens");
  }
  const role = positional[1] ?? "member";
  if (role !== "owner" && role !== "member") {
    throw new Error("role must be owner or member");
  }
  return { name, role, navMode: flags.includes("--advanced") ? "advanced" : "beginner" };
}

/** Validate a password already read from a non-echoing stdin pipe. */
export function parsePasswordInput(value: string): string {
  const password = value.replace(/\r?\n$/, "");
  if (password.includes("\n") || password.includes("\r")) {
    throw new Error("password input must contain exactly one line");
  }
  if (password.length < 12 || password.length > 256) {
    throw new Error("password must contain 12-256 characters");
  }
  return password;
}
