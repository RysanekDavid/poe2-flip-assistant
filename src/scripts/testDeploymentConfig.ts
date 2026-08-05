import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const read = (path: string): string => readFileSync(path, "utf8");
const caddy = read("deploy/Caddyfile");
const ipTest = read("deploy/Caddyfile.ip-test");
const webUnit = read("deploy/poe2flip-web.service");
const coachUnit = read("deploy/poe2flip-coach.service");
const deploy = read("deploy/deploy.sh");
const productEnv = read("deploy/.env.production.example");
const coachEnv = read("deploy/coach.env.example");
const runtimeTimeouts = read("deploy/runtime-timeouts.env");
const appConfig = read("src/config/env.ts");
const validatorMatch = deploy.match(
  /validate_timeout_hierarchy\(\) \{[\s\S]*?\r?\n\s+node -e '\r?\n([\s\S]*?)\r?\n' "\$runtime_env"/,
);
assert.ok(validatorMatch?.[1], "timeout validator body must remain executable by the test");
const timeoutValidator = validatorMatch[1];

assert.match(caddy, /\{\$SITE_ADDRESS\}/);
assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3000/);
assert.match(caddy, /www\.\{\$SITE_ADDRESS\}/);
assert.match(caddy, /redir https:\/\/\{\$SITE_ADDRESS\}\{uri\} permanent/);
assert.doesNotMatch(caddy, /tls internal|0\.0\.0\.0/);
assert.match(ipTest, /tls internal/);
assert.match(webUnit, /EnvironmentFile=\/opt\/poe2flip\/current\/\.release\.env/);
assert.ok(webUnit.indexOf("/.env.local") < webUnit.indexOf("/current/deploy/runtime-timeouts.env"));
assert.match(webUnit, /--hostname 127\.0\.0\.1/);
assert.match(coachUnit, /--host 127\.0\.0\.1/);
assert.match(coachUnit, /EnvironmentFile=\/opt\/poe2flip\/\.coach\.env/);
assert.ok(
  coachUnit.indexOf("/.coach.env") < coachUnit.indexOf("/current/deploy/runtime-timeouts.env"),
);
assert.doesNotMatch(coachUnit, /EnvironmentFile=.*\.env\.local/);
assert.match(coachUnit, /InaccessiblePaths=.*\.env\.local/);
assert.match(deploy, /APP_COMMIT_SHA=%s/);
assert.match(deploy, /health\.build !== expected/);
assert.match(deploy, /"\$\{TARGET_SHA:0:12\}"/);
assert.match(deploy, /npm run verify:poe2-data/);
assert.match(deploy, /\.env\.local must have mode 600/);
assert.match(deploy, /Omen of Sinistral Annulment/);
assert.match(deploy, /ROLLBACK_READY_TIMEOUT_SECONDS=45/);
assert.match(deploy, /wait_for_http poe2flip-web/);
assert.match(deploy, /wait_for_coach_health/);
assert.match(deploy, /health\.status !== "ok"/);
assert.match(deploy, /--max-time 180/);
assert.match(deploy, /validate_timeout_hierarchy/);
assert.doesNotMatch(productEnv, /^COACH_TIMEOUT_MS=/m);
assert.doesNotMatch(
  coachEnv,
  /^(?:CHAT_MODEL|COACH_MODEL_TIMEOUT_SECONDS|COACH_TOTAL_TIMEOUT_SECONDS|COACH_MAX_TOOL_ROUNDS)=/m,
);
assert.match(runtimeTimeouts, /^CHAT_MODEL=gpt-5\.4-mini$/m);
assert.match(runtimeTimeouts, /^COACH_MODEL_TIMEOUT_SECONDS=45$/m);
assert.match(runtimeTimeouts, /^COACH_TOTAL_TIMEOUT_SECONDS=140$/m);
assert.match(runtimeTimeouts, /^COACH_MAX_TOOL_ROUNDS=2$/m);
assert.match(runtimeTimeouts, /^COACH_TIMEOUT_MS=160000$/m);
assert.match(appConfig, /num\("COACH_TIMEOUT_MS", 160_000\)/);
assert.match(deploy, /const runtime = fs\.readFileSync\(process\.argv\[1\], "utf8"\)/);
assert.doesNotMatch(deploy, /install -m 0644 .*runtime-timeouts\.env/);
assert.ok(
  deploy.indexOf('switch_current "$PREVIOUS_TARGET"') <
    deploy.indexOf("restore_previous_services || rollback_ok=0"),
);
assert.match(deploy, /wait_for_active poe2flip-poller/);
assert.match(deploy, /rollback timed out waiting for/);
assert.match(deploy, /^set -euo pipefail$/m);
assert.doesNotMatch(deploy, /^set -Eeuo pipefail$/m);
assert.doesNotMatch(deploy, /sleep 2/);
assert.doesNotMatch(deploy, /services remain stopped/);
assert.doesNotMatch(deploy, /const terms =/);

const validRuntime = [
  "CHAT_MODEL=gpt-5.4-mini",
  "COACH_MODEL_TIMEOUT_SECONDS=45",
  "COACH_TOTAL_TIMEOUT_SECONDS=140",
  "COACH_MAX_TOOL_ROUNDS=2",
  "COACH_TIMEOUT_MS=160000",
].join("\n");
assert.equal(runTimeoutValidator(validRuntime), 0);
assert.notEqual(runTimeoutValidator(`${validRuntime}\nCOACH_TOTAL_TIMEOUT_SECONDS=70`), 0);
assert.notEqual(runTimeoutValidator(`${validRuntime}\nCHAT_MODEL=gpt-5.4`), 0);
assert.notEqual(runTimeoutValidator(validRuntime.replace("gpt-5.4-mini", "gpt-5.4")), 0);

function runTimeoutValidator(runtime: string): number | null {
  const directory = mkdtempSync(join(tmpdir(), "poe2-timeout-validator-"));
  const runtimePath = join(directory, "runtime.env");
  try {
    writeFileSync(runtimePath, `${runtime}\n`, { encoding: "utf8", mode: 0o600 });
    return spawnSync(process.execPath, ["-e", timeoutValidator, runtimePath], {
      encoding: "utf8",
      stdio: "ignore",
    }).status;
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

console.log("ALL PASS — domain TLS, loopback services, and deployment provenance");
