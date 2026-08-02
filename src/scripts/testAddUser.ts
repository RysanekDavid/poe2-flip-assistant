import assert from "node:assert/strict";
import { parsePasswordInput, parseProvisionArgs } from "./addUserInput";

assert.deepEqual(parseProvisionArgs(["demo_user"]), { name: "demo_user", role: "member" });
assert.deepEqual(parseProvisionArgs(["demo-user", "owner"]), { name: "demo-user", role: "owner" });
assert.throws(() => parseProvisionArgs(["demo", "admin"]), /role/);
assert.throws(() => parseProvisionArgs(["demo", "member", "secret"]), /usage/);
assert.equal(parsePasswordInput("long-demo-passphrase\n"), "long-demo-passphrase");
assert.throws(() => parsePasswordInput("short\n"), /12-256/);
assert.throws(() => parsePasswordInput("long-enough-line\nsecond"), /one line/);

console.log("ALL PASS — secret-safe demo user input");
