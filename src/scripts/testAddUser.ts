import assert from "node:assert/strict";
import { parsePasswordInput, parseProvisionArgs } from "./addUserInput";

assert.deepEqual(parseProvisionArgs(["demo_user"]), { name: "demo_user", role: "member", navMode: "beginner" });
assert.deepEqual(parseProvisionArgs(["demo-user", "owner"]), { name: "demo-user", role: "owner", navMode: "beginner" });
assert.deepEqual(parseProvisionArgs(["trader", "--advanced"]), { name: "trader", role: "member", navMode: "advanced" });
assert.deepEqual(parseProvisionArgs(["trader", "owner", "--advanced"]), { name: "trader", role: "owner", navMode: "advanced" });
assert.throws(() => parseProvisionArgs(["demo", "admin"]), /role/);
assert.throws(() => parseProvisionArgs(["demo", "member", "secret"]), /usage/);
assert.throws(() => parseProvisionArgs(["demo", "--beginner"]), /unknown flag/);
assert.equal(parsePasswordInput("long-demo-passphrase\n"), "long-demo-passphrase");
assert.throws(() => parsePasswordInput("short\n"), /12-256/);
assert.throws(() => parsePasswordInput("long-enough-line\nsecond"), /one line/);

console.log("ALL PASS — secret-safe demo user input, --advanced nav flag");
