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
  local backups="$work/backups" day kept
  mkdir -p "$backups/units-x"
  : > "$backups/failed-x-poe2flip.db"
  for day in 1 2 3 4 5 6 7; do : > "$backups/poe2flip-$(release_name "$day").db"; done
  prune_backups "$backups" 5 >/dev/null
  kept=$(find "$backups" -maxdepth 1 -name 'poe2flip-*.db' | wc -l)
  [[ $kept -eq 5 ]] || fail "expected 5 backups, found $kept"
  [[ ! -e "$backups/poe2flip-$(release_name 1).db" ]] || fail "oldest backup should be pruned"
  [[ -e "$backups/poe2flip-$(release_name 7).db" ]] || fail "newest backup must be kept"
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

health() {
  printf '{"status":"%s","market_ready":%s,"knowledge_ready":%s,"item_data_ready":true,"model_configured":true}' "$@"
}

check_health_gate() {
  coach_health_gate "$(health ok true true)" 2>/dev/null || fail "healthy Coach rejected"
  coach_health_gate "$(health degraded false true)" 2>/dev/null \
    || fail "stale market must only warn during deploy"
  if coach_health_gate "$(health degraded true false)" 2>/dev/null; then
    fail "missing knowledge base must be fatal"
  fi
  if coach_health_gate "$(health degraded true true)" 2>/dev/null; then
    fail "degraded status with a ready market must be fatal"
  fi
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
