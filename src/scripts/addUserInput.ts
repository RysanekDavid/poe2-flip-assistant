export type ProvisionRole = "owner" | "member";

export interface ProvisionArgs {
  name: string;
  role: ProvisionRole;
}

/** Parse only non-secret CLI metadata; passwords are never accepted in argv. */
export function parseProvisionArgs(args: readonly string[]): ProvisionArgs {
  if (args.length < 1 || args.length > 2) {
    throw new Error("usage: addUser.ts <name> [owner|member] < password-on-stdin");
  }
  const name = args[0]?.trim() ?? "";
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(name)) {
    throw new Error("name must be 3-32 letters, digits, underscores or hyphens");
  }
  const role = args[1] ?? "member";
  if (role !== "owner" && role !== "member") {
    throw new Error("role must be owner or member");
  }
  return { name, role };
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
