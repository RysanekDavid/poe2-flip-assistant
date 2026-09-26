import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const windowsBash = "C:\\Program Files\\Git\\bin\\bash.exe";
const bash = process.platform === "win32" && existsSync(windowsBash) ? windowsBash : "/bin/bash";

for (const script of ["deploy/test-err-trap.sh", "deploy/test-deploy-helpers.sh"]) {
  const result = spawnSync(bash, [script], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log(result.stdout.trim());
}

const deployScript = readFileSync("deploy/deploy.sh", "utf8");
assert.doesNotMatch(deployScript, /\|\s*node -e/);
assert.match(deployScript, /JSON\.parse\(process\.argv\[1\]\)/);
