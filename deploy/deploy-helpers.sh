#!/usr/bin/env bash
# Shared release helpers; sourced by deploy.sh after global paths are configured.

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

validate_node_version() {
  node -e '
function parse(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error(`invalid Node.js version: ${value}`);
  return match.slice(1).map(Number);
}
const actual = parse(process.argv[1]);
const minimum = parse(process.argv[2]);
for (let index = 0; index < minimum.length; index += 1) {
  if (actual[index] > minimum[index]) process.exit(0);
  if (actual[index] < minimum[index]) {
    throw new Error(`Node.js ${process.argv[2]}+ is required; found ${process.argv[1]}`);
  }
}
' "$(node --version)" "20.18.1"
}

switch_current() {
  local target=$1
  local temporary="$APP_DIR/.current-$RELEASE_ID-$$-$RANDOM"
  ln -s "$target" "$temporary"
  mv -Tf "$temporary" "$CURRENT_LINK"
}

validate_timeout_hierarchy() {
  local runtime_env=$1
  node -e '
const fs = require("node:fs");
const runtime = fs.readFileSync(process.argv[1], "utf8");
function singleValue(source, key) {
  const matches = [...source.matchAll(new RegExp(`^${key}=([^\\r\\n]*)$`, "gm"))];
  if (matches.length !== 1) throw new Error(`${key} must appear exactly once`);
  return matches[0][1];
}
function numeric(source, key) {
  const raw = singleValue(source, key);
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error(`${key} must be numeric`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be positive`);
  return value;
}
if (singleValue(runtime, "CHAT_MODEL") !== "gpt-5.4-mini") {
  throw new Error("CHAT_MODEL must equal gpt-5.4-mini");
}
const providerSeconds = numeric(runtime, "COACH_MODEL_TIMEOUT_SECONDS");
const totalSeconds = numeric(runtime, "COACH_TOTAL_TIMEOUT_SECONDS");
const toolRounds = numeric(runtime, "COACH_MAX_TOOL_ROUNDS");
const webMilliseconds = numeric(runtime, "COACH_TIMEOUT_MS");
if (providerSeconds !== 45 || totalSeconds !== 140 || toolRounds !== 2) {
  throw new Error("Coach backend timeouts must match the approved release budget");
}
if (webMilliseconds !== 160000) throw new Error("Coach web timeout must equal 160000ms");
if (!Number.isInteger(toolRounds) || toolRounds > 2) throw new Error("invalid tool-round cap");
if (totalSeconds < providerSeconds * (toolRounds + 1) + 5) {
  throw new Error("Coach total timeout does not cover its provider-call budget");
}
if (webMilliseconds <= totalSeconds * 1000 || webMilliseconds >= 180000) {
  throw new Error("Coach web timeout must sit between backend and deployment deadlines");
}
console.log("Coach timeout hierarchy OK");
' "$runtime_env"
}
