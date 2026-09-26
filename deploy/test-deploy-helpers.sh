#!/usr/bin/env bash
# Executable checks for deploy-helpers.sh: pruning, the Coach health gate, the contract-smoke
# validator, and that an optional (non-fatal) step can never trigger the rollback trap.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy-helpers.sh
source "$script_dir/deploy-helpers.sh"

work=$(mktemp -d "${TMPDIR:-/tmp}/poe2flip-helpers-XXXXXX")
trap 'rm -rf "$work"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

release_name() {
  printf '2026090%sT120000Z-0123456789ab-%s-1' "$1" "$1"
}

check_release_pruning() {
  local releases="$work/releases" day
  mkdir -p "$releases/manual-notes"
  for day in 1 2 3 4 5 6; do mkdir -p "$releases/$(release_name "$day")"; done
  prune_releases "$releases" 3 "$releases/$(release_name 6)" "$releases/$(release_name 1)" >/dev/null
  for day in 1 4 5 6; do
    [[ -d "$releases/$(release_name "$day")" ]] || fail "release $day should be kept"
  done
  for day in 2 3; do
    [[ ! -e "$releases/$(release_name "$day")" ]] || fail "release $day should be pruned"
  done
  [[ -d "$releases/manual-notes" ]] || fail "unrecognized entries must never be pruned"
}

check_backup_pruning() {
  local backups="$work/backups" day kept units
  mkdir -p "$backups/units-x"
  : > "$backups/failed-x-poe2flip.db"
  for day in 1 2 3 4 5 6 7; do
    : > "$backups/poe2flip-$(release_name "$day").db"
    mkdir -p "$backups/units-$(release_name "$day")"
    : > "$backups/units-$(release_name "$day")/poe2flip-web.service"
  done
  prune_backups "$backups" 5 >/dev/null
  kept=$(find "$backups" -maxdepth 1 -name 'poe2flip-*.db' | wc -l)
  units=$(find "$backups" -maxdepth 1 -type d -name 'units-2026*' | wc -l)
  [[ $kept -eq 5 ]] || fail "expected 5 DB backups, found $kept"
  [[ $units -eq 5 ]] || fail "expected 5 unit backups, found $units"
  [[ ! -e "$backups/poe2flip-$(release_name 1).db" ]] || fail "oldest backup should be pruned"
  [[ ! -e "$backups/units-$(release_name 2)" ]] || fail "old unit backup should be pruned"
  [[ -e "$backups/poe2flip-$(release_name 7).db" ]] || fail "newest backup must be kept"
  [[ -d "$backups/units-$(release_name 7)" ]] || fail "newest unit backup must be kept"
  [[ -e "$backups/failed-x-poe2flip.db" && -d "$backups/units-x" ]] || fail "other files kept"
}

check_nonfatal_step_never_rolls_back() {
  local marker="$work/rollback-count"
  : > "$marker"
  MARKER="$marker" bash -c '
set -euo pipefail
source "$1"
trap "echo rollback >> \"\$MARKER\"" ERR
broken_step() { false; echo "continued after failure"; false; }
run_nonfatal "optional step" broken_step 2>/dev/null
echo survived
' _ "$script_dir/deploy-helpers.sh" | grep -q survived || fail "run_nonfatal aborted the script"
  [[ ! -s "$marker" ]] || fail "run_nonfatal triggered the rollback trap"
}

# status market_ready knowledge_ready agent_ready market_schema_ready
health() {
  printf '{"status":"%s","market_ready":%s,"knowledge_ready":%s,"agent_ready":%s,"market_schema_ready":%s,"item_data_ready":true,"model_configured":true}' "$@"
}

legacy_health() {
  printf '{"status":"%s","market_ready":%s,"knowledge_ready":true,"item_data_ready":true,"model_configured":true}' "$@"
}

rejects() {
  if coach_health_gate "$@" 2>/dev/null; then
    return 1
  fi
}

check_health_gate() {
  coach_health_gate "$(health ok true true true true)" 2>/dev/null || fail "healthy Coach rejected"
  coach_health_gate "$(health degraded false true true true)" 2>/dev/null \
    || fail "stale market data must only warn during deploy"
  rejects "$(health degraded true false true true)" || fail "missing knowledge base must be fatal"
  rejects "$(health degraded true true true true)" || fail "degraded status + fresh market is fatal"
  rejects "$(health degraded false true false true)" || fail "agent build failure must be fatal"
  rejects "$(health degraded false true true false)" || fail "broken market schema must be fatal"
  rejects "$(legacy_health ok true)" || fail "a new release must report agent/schema flags"
  coach_health_gate "$(legacy_health ok true)" rollback 2>/dev/null \
    || fail "rollback must accept the previous release's older health contract"
  coach_health_gate "$(legacy_health degraded false)" rollback 2>/dev/null \
    || fail "rollback treats an old market_ready=false as a warning"
  rejects "$(health degraded false true false true)" rollback \
    || fail "rollback still fails an explicit agent build failure"
}

rejection() {
  printf '{"error":{"code":"request_rejected","message":"%s","requestId":"abcdef0123456789abcdef01","retryable":false,"resetConversation":false}}\n%s' "$1" "$2"
}

check_rejected_smoke_validator() {
  assert_rejected_coach_smoke "$(rejection 'Prompt-injection attempt blocked.' 400)" \
    2>/dev/null || fail "guard rejection must pass"
  if assert_rejected_coach_smoke "$(rejection 'Invalid Coach request.' 400)" 2>/dev/null; then
    fail "a web-side validation 400 must not pass for the FastAPI path"
  fi
  if assert_rejected_coach_smoke "$(rejection 'Prompt-injection attempt blocked.' 409)" 2>/dev/null; then
    fail "a leaked lease (409) must fail the smoke"
  fi
  if assert_rejected_coach_smoke $'not json\n503' 2>/dev/null; then
    fail "an unavailable Coach must fail the smoke"
  fi
}

check_release_pruning
check_backup_pruning
check_nonfatal_step_never_rolls_back
check_health_gate
check_rejected_smoke_validator
echo "ALL PASS - deploy pruning, Coach health gate, contract smoke, non-fatal steps"
