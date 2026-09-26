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
const deployHelpers = read("deploy/deploy-helpers.sh");
const deploySources = `${deploy}\n${deployHelpers}`;
const productEnv = read("deploy/.env.production.example");
const coachEnv = read("deploy/coach.env.example");
const runtimeTimeouts = read("deploy/runtime-timeouts.env");
const appConfig = read("src/config/env.ts");
const packageConfig = JSON.parse(read("package.json")) as { engines?: { node?: string } };
const rootReadme = read("README.md");
const deployReadme = read("deploy/README.md");
const validatorMatch = deploySources.match(
  /validate_timeout_hierarchy\(\) \{[\s\S]*?\r?\n\s+node -e '\r?\n([\s\S]*?)\r?\n' "\$runtime_env"/,
);
assert.ok(validatorMatch?.[1], "timeout validator body must remain executable by the test");
const timeoutValidator = validatorMatch[1];
const nodeValidatorMatch = deploySources.match(
  /validate_node_version\(\) \{\s+node -e '\r?\n([\s\S]*?)\r?\n' "\$\(node --version\)" "20\.18\.1"/,
);
assert.ok(nodeValidatorMatch?.[1], "Node version validator must remain executable by the test");
const nodeValidator = nodeValidatorMatch[1];

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
assert.match(deploy, /ROLLBACK_READY_TIMEOUT_SECONDS=45/);
assert.match(deploy, /wait_for_http poe2flip-web/);
assert.match(deploy, /wait_for_coach_health/);
assert.match(deploySources, /health\.status !== "ok"/);
assert.match(deploySources, /--max-time 180/);
assert.match(deploy, /validate_timeout_hierarchy/);
// Deploy smokes run as the dedicated no-login smoke member, never as the owner (user 1).
assert.doesNotMatch(deploySources, /signSession\(1\b/);
assert.match(deploy, /deploySmoke\.ts ensure/);
assert.match(deploy, /deploySmoke\.ts cleanup/);
// Deterministic contract smoke: no paid/LLM-dependent assertions, one optional non-fatal live turn.
assert.match(deploy, /assert_rejected_coach_smoke "\$REJECTED_SMOKE"/);
assert.match(deploy, /assert_rejected_coach_smoke "\$REPLAYED_SMOKE"/);
assert.match(deploy, /api\/coach\/conversations\/\$SMOKE_CONVERSATION_ID"\)" = "404"/);
assert.match(deploy, /run_nonfatal "live Coach smoke turn" live_coach_smoke/);
assert.match(deploy, /COACH_SMOKE_MODE must be contract or live/);
assert.doesNotMatch(deploySources, /Dueling Wand|Omen of Sinistral Annulment|PRESENTATION_/);
assert.equal((deploy.match(/live_coach_smoke/g) ?? []).length, 1, "at most one live turn");
// Stale market (poller stopped mid-deploy) warns; model/knowledge/item data stay fatal.
assert.match(deploy, /coach_health_gate "\$COACH_HEALTH"/);
assert.match(deploy, /coach_health_gate "\$WEB_COACH_HEALTH"/);
assert.doesNotMatch(deploy, /!health\.market_ready/);
// Rollback restores an older Coach whose /health lacks the newer flags; only it gets the lenient gate.
assert.match(deploy, /coach_health_gate "\$body" rollback/);
assert.equal((deploy.match(/coach_health_gate "[^"]+" rollback/g) ?? []).length, 1);
assert.match(deployHelpers, /"agent_ready", "market_schema_ready"/);
assert.match(deployHelpers, /UNIT_BACKUP_NAME_PATTERN/);
// Housekeeping after the ERR trap is cleared, so it can never roll a healthy release back.
assert.match(deploy, /prune_releases "\$APP_DIR\/releases" 3 "\$RELEASE_DIR" "\$PREVIOUS_TARGET"/);
assert.match(deploy, /prune_backups "\$APP_DIR\/backups" 5/);
assert.ok(deploy.lastIndexOf("trap - ERR") < deploy.indexOf("prune_releases"));
assert.doesNotMatch(deploy, /date \+%s%3N/);
assert.doesNotMatch(productEnv, /^COACH_TIMEOUT_MS=/m);
assert.match(productEnv, /^DATA_SOURCE_CONTACT=$/m);
assert.match(productEnv, /^COACH_PROXY_SECRET=$/m);
assert.match(coachEnv, /^COACH_PROXY_SECRET=$/m);
assert.match(deploy, /COACH_PROXY_SECRET must match in \.env\.local and \.coach\.env/);
assert.match(deploy, /source "\$SCRIPT_DIR\/deploy-helpers\.sh"/);
assert.doesNotMatch(productEnv, /^POE_CONTACT=$/m);
assert.match(deploy, /DATA_SOURCE_CONTACT is required when PATCH_NOTES_ENABLED is true or omitted/);
assert.equal(packageConfig.engines?.node, ">=20.18.1");
assert.match(rootReadme, /Node\.js 20\.18\.1\+/);
assert.match(deployReadme, /Node 20\.18\.1 or newer/);
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
assert.match(deploySources, /const runtime = fs\.readFileSync\(process\.argv\[1\], "utf8"\)/);
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
assert.equal(runNodeValidator("v20.18.1"), 0);
assert.equal(runNodeValidator("v22.0.0"), 0);
assert.notEqual(runNodeValidator("v20.18.0"), 0);
assert.notEqual(runNodeValidator("v18.20.8"), 0);

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

function runNodeValidator(version: string): number | null {
  return spawnSync(process.execPath, ["-e", nodeValidator, version, "20.18.1"], {
    encoding: "utf8",
    stdio: "ignore",
  }).status;
}

console.log("ALL PASS — domain TLS, loopback services, and deployment provenance");
