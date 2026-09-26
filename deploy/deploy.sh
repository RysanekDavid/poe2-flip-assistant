#!/usr/bin/env bash
# Build a versioned release, back up/migrate SQLite, atomically switch, then health-check.
# Usage (as root): bash deploy/deploy.sh [git-ref]
set -euo pipefail
umask 077

APP_DIR=/opt/poe2flip
APP_USER=poe2flip
TARGET_REF=${1:-HEAD}
CURRENT_LINK="$APP_DIR/current"
SERVICES_STOPPED=0
PRODUCT_BACKUP=""
PRODUCT_EXISTED=0
WEB_UNIT_EXISTED=0
POLLER_UNIT_EXISTED=0
COACH_UNIT_EXISTED=0
PREVIOUS_CURRENT_EXISTS=0
PREVIOUS_TARGET=""
PREVIOUS_WEB_ENABLED=0
PREVIOUS_POLLER_ENABLED=0
PREVIOUS_COACH_ENABLED=0
ROLLBACK_READY_TIMEOUT_SECONDS=45
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy-helpers.sh
source "$SCRIPT_DIR/deploy-helpers.sh"

if [[ $(id -u) -ne 0 ]]; then
  echo "run this as root: release setup and systemd require root" >&2
  exit 1
fi

run_as_app() { runuser -u "$APP_USER" -- "$@"; }

run_in_release() {
  runuser -u "$APP_USER" -- sh -c 'cd "$1" && shift && exec "$@"' sh "$RELEASE_DIR" "$@"
}

quick_check() {
  local database=$1
  local result
  result=$(run_as_app sqlite3 "$database" "PRAGMA quick_check;")
  if [[ "$result" != "ok" ]]; then
    echo "SQLite quick_check failed for $database: $result" >&2
    return 1
  fi
}

backup_db() {
  local source=$1
  local destination=$2
  [[ -f "$source" ]] || return 0
  quick_check "$source"
  run_as_app sqlite3 "$source" ".backup '$destination'"
  chmod 0600 "$destination"
  quick_check "$destination"
}

quarantine_db() {
  local database=$1
  local name=${database##*/}
  local suffix
  for suffix in "" "-wal" "-shm"; do
    if [[ -f "${database}${suffix}" ]]; then
      mv "${database}${suffix}" "$APP_DIR/backups/failed-$RELEASE_ID-${name}${suffix}"
    fi
  done
}

backup_unit() {
  local name=$1
  local source="/etc/systemd/system/$name"
  install -m 0600 "$source" "$UNIT_BACKUP_DIR/$name"
}

restore_unit() {
  local name=$1
  local existed=$2
  local target="/etc/systemd/system/$name"
  if [[ $existed -eq 1 ]]; then
    install -m 0644 "$UNIT_BACKUP_DIR/$name" "$target"
  elif [[ -f "$target" ]]; then
    mv "$target" "$UNIT_BACKUP_DIR/failed-$name"
  fi
}

env_path() {
  local key=$1
  local fallback=$2
  local env_file=${3:-$APP_DIR/.env.local}
  run_in_release node -e '
const path = require("node:path");
require("dotenv").config({ path: process.argv[1] });
process.stdout.write(path.resolve(process.env[process.argv[2]] || process.argv[3]));
' "$env_file" "$key" "$fallback"
}

was_active() {
  systemctl is-active --quiet "$1" && printf '1' || printf '0'
}

was_enabled() {
  systemctl is-enabled --quiet "$1" && printf '1' || printf '0'
}

restore_enablement() {
  local service=$1
  local enabled=$2
  if [[ $enabled -eq 1 ]]; then
    systemctl enable "$service" >/dev/null
  else
    systemctl disable "$service" >/dev/null 2>&1 || true
    ! systemctl is-enabled --quiet "$service"
  fi
}

wait_for_active() {
  local service=$1
  local timeout=$2
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    systemctl is-active --quiet "$service" && return 0
    sleep 1
  done
  echo "rollback timed out waiting for $service to become active" >&2
  systemctl --no-pager --full status "$service" >&2 || true
  return 1
}

wait_for_http() {
  local service=$1
  local url=$2
  local timeout=$3
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if systemctl is-active --quiet "$service" \
      && curl --fail --silent --max-time 3 "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "rollback timed out waiting for $service readiness at $url" >&2
  systemctl --no-pager --full status "$service" >&2 || true
  curl --fail --show-error --max-time 3 "$url" >/dev/null || true
  return 1
}

coach_health_ok() {
  local body
  body=$(curl --fail --silent --max-time 3 http://127.0.0.1:8000/health) || return 1
  # Only called while restoring the previous release, whose /health may predate newer flags.
  coach_health_gate "$body" rollback
}

wait_for_coach_health() {
  local timeout=$1
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if systemctl is-active --quiet poe2flip-coach && coach_health_ok; then
      return 0
    fi
    sleep 1
  done
  echo "rollback timed out waiting for poe2flip-coach status ok" >&2
  systemctl --no-pager --full status poe2flip-coach >&2 || true
  coach_health_ok || true
  return 1
}

restore_previous_services() {
  local restore_ok=1
  if [[ $PREVIOUS_COACH_ACTIVE -eq 1 ]]; then
    systemctl start poe2flip-coach || restore_ok=0
  fi
  if [[ $PREVIOUS_WEB_ACTIVE -eq 1 ]]; then
    systemctl start poe2flip-web || restore_ok=0
  fi
  if [[ $PREVIOUS_POLLER_ACTIVE -eq 1 ]]; then
    systemctl start poe2flip-poller || restore_ok=0
  fi
  if [[ $PREVIOUS_WEB_ACTIVE -eq 1 ]]; then
    wait_for_http poe2flip-web http://127.0.0.1:3000/login \
      "$ROLLBACK_READY_TIMEOUT_SECONDS" || restore_ok=0
  fi
  if [[ $PREVIOUS_COACH_ACTIVE -eq 1 ]]; then
    wait_for_coach_health "$ROLLBACK_READY_TIMEOUT_SECONDS" || restore_ok=0
  fi
  if [[ $PREVIOUS_POLLER_ACTIVE -eq 1 ]]; then
    wait_for_active poe2flip-poller "$ROLLBACK_READY_TIMEOUT_SECONDS" || restore_ok=0
  fi
  if [[ $restore_ok -eq 0 ]]; then
    echo "FATAL: rollback validation failed; inspect restored service status" >&2
    return 1
  fi
}

rollback() {
  local status=$?
  local rollback_ok=1
  trap - ERR
  set +e
  echo "deploy failed; restoring previous release and databases" >&2
  if [[ $SERVICES_STOPPED -eq 1 ]]; then
    for service in poe2flip-poller poe2flip-web poe2flip-coach; do
      if systemctl cat "$service" >/dev/null 2>&1; then
        systemctl stop "$service" || rollback_ok=0
        systemctl is-active --quiet "$service" && rollback_ok=0
      fi
    done
    if [[ $rollback_ok -eq 0 ]]; then
      echo "FATAL: a service would not stop; databases were not touched" >&2
      exit 90
    fi
    if [[ $PREVIOUS_CURRENT_EXISTS -eq 1 ]]; then
      switch_current "$PREVIOUS_TARGET" || rollback_ok=0
    elif [[ -L "$CURRENT_LINK" ]]; then
      mv "$CURRENT_LINK" "$UNIT_BACKUP_DIR/failed-current-$RELEASE_ID" || rollback_ok=0
    fi
    if [[ -n "$PRODUCT_BACKUP" ]]; then
      run_as_app sqlite3 "$PRODUCT_DB" ".restore '$PRODUCT_BACKUP'" || rollback_ok=0
      quick_check "$PRODUCT_DB" || rollback_ok=0
    elif [[ $PRODUCT_EXISTED -eq 0 ]]; then
      quarantine_db "$PRODUCT_DB" || rollback_ok=0
    fi
    restore_unit poe2flip-web.service "$WEB_UNIT_EXISTED" || rollback_ok=0
    restore_unit poe2flip-poller.service "$POLLER_UNIT_EXISTED" || rollback_ok=0
    restore_unit poe2flip-coach.service "$COACH_UNIT_EXISTED" || rollback_ok=0
    systemctl daemon-reload || rollback_ok=0
    restore_enablement poe2flip-web "$PREVIOUS_WEB_ENABLED" || rollback_ok=0
    restore_enablement poe2flip-poller "$PREVIOUS_POLLER_ENABLED" || rollback_ok=0
    restore_enablement poe2flip-coach "$PREVIOUS_COACH_ENABLED" || rollback_ok=0
    restore_previous_services || rollback_ok=0
    if [[ $rollback_ok -eq 0 ]]; then
      exit 90
    fi
  fi
  echo "failed release kept for inspection: $RELEASE_DIR" >&2
  exit "$status"
}

for command in curl date df git mv node npm sqlite3 stat systemctl tar; do
  require_command "$command"
done
validate_node_version
if [[ ! -x /usr/local/bin/uv ]]; then
  echo "missing /usr/local/bin/uv; install uv first (see deploy/README.md)" >&2
  exit 1
fi

cd "$APP_DIR"
if [[ ! -f .env.local ]]; then
  echo "missing $APP_DIR/.env.local" >&2
  exit 1
fi
if [[ ! -f .coach.env ]]; then
  echo "missing $APP_DIR/.coach.env" >&2
  exit 1
fi
if [[ $(stat -c '%a' .env.local) != 600 ]]; then
  echo "$APP_DIR/.env.local must have mode 600" >&2
  exit 1
fi
for key in AUTH_SECRET SECRET_KEY COACH_THREAD_SECRET COACH_PROXY_SECRET APP_ORIGIN; do
  if ! grep -Eq "^${key}=.+$" .env.local; then
    echo "missing required value for $key in $APP_DIR/.env.local" >&2
    exit 1
  fi
done
# The middleware only degrades (logs + Host fallback) on a bad APP_ORIGIN so the site stays up;
# the deploy is where a malformed value must fail loudly. Production requires https.
if ! grep -Eq '^APP_ORIGIN=https://[A-Za-z0-9.-]+(:[0-9]+)?/?$' .env.local; then
  echo "APP_ORIGIN in $APP_DIR/.env.local must be https://host[:port] with no path, quotes or spaces" >&2
  exit 1
fi
patch_notes_enabled=$(awk -F= '$1 == "PATCH_NOTES_ENABLED" { value=substr($0, index($0, "=") + 1) } END { print value }' .env.local)
if [[ -z "$patch_notes_enabled" || "${patch_notes_enabled,,}" == "true" ]]; then
  if ! grep -Eq '^DATA_SOURCE_CONTACT=[^[:space:]].*$' .env.local; then
    echo "DATA_SOURCE_CONTACT is required when PATCH_NOTES_ENABLED is true or omitted" >&2
    exit 1
  fi
fi
# contract (default): deterministic, free Coach smoke. live: additionally one real, non-fatal
# LLM turn that only logs latency. The process environment wins over .env.local.
COACH_SMOKE_MODE=${COACH_SMOKE_MODE:-$(awk -F= '$1 == "COACH_SMOKE_MODE" { value=substr($0, index($0, "=") + 1) } END { print value }' .env.local)}
COACH_SMOKE_MODE=${COACH_SMOKE_MODE:-contract}
if [[ "$COACH_SMOKE_MODE" != "contract" && "$COACH_SMOKE_MODE" != "live" ]]; then
  echo "COACH_SMOKE_MODE must be contract or live, got: $COACH_SMOKE_MODE" >&2
  exit 1
fi
for key in OPENAI_API_KEY COACH_PROXY_SECRET POE_DB_PATH POE2_DATA_MANIFEST; do
  if ! grep -Eq "^${key}=.+$" .coach.env; then
    echo "missing required value for $key in $APP_DIR/.coach.env" >&2
    exit 1
  fi
done
web_proxy_secret=$(awk -F= '$1 == "COACH_PROXY_SECRET" { print substr($0, index($0, "=") + 1) }' .env.local)
coach_proxy_secret=$(awk -F= '$1 == "COACH_PROXY_SECRET" { print substr($0, index($0, "=") + 1) }' .coach.env)
if [[ "$web_proxy_secret" != "$coach_proxy_secret" ]]; then
  echo "COACH_PROXY_SECRET must match in .env.local and .coach.env" >&2
  exit 1
fi
if [[ $(stat -c '%a' .coach.env) != 600 ]]; then
  echo "$APP_DIR/.coach.env must have mode 600" >&2
  exit 1
fi
git_status=$(git status --porcelain)
dirty=$(printf '%s\n' "$git_status" | grep -Ev '^\?\? (\.cache/|\.npm/|backups/|releases/|current$|\.current-|\.deployed-revision$)' || true)
if [[ -n "$dirty" ]]; then
  echo "server Git worktree is dirty; refusing to deploy" >&2
  printf '%s\n' "$dirty" >&2
  exit 1
fi

TARGET_SHA=$(git rev-parse --verify "${TARGET_REF}^{commit}")
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-${TARGET_SHA:0:12}-$$-$RANDOM"
RELEASE_DIR="$APP_DIR/releases/$RELEASE_ID"
if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_CURRENT_EXISTS=1
  PREVIOUS_TARGET=$(readlink -f "$CURRENT_LINK")
elif [[ -e "$CURRENT_LINK" ]]; then
  echo "$CURRENT_LINK exists but is not a symlink" >&2
  exit 1
fi
PREVIOUS_WEB_ACTIVE=$(was_active poe2flip-web)
PREVIOUS_POLLER_ACTIVE=$(was_active poe2flip-poller)
PREVIOUS_COACH_ACTIVE=$(was_active poe2flip-coach)
PREVIOUS_WEB_ENABLED=$(was_enabled poe2flip-web)
PREVIOUS_POLLER_ENABLED=$(was_enabled poe2flip-poller)
PREVIOUS_COACH_ENABLED=$(was_enabled poe2flip-coach)
# Reclaim space BEFORE the free-disk gate and before the rollback trap is armed: releases and backups accumulated unpruned for months
# (every failed release is also kept for inspection), and a full disk otherwise blocks the very
# deploy that would prune them. The live `current` target is always protected.
run_nonfatal "pre-flight release pruning" prune_releases "$APP_DIR/releases" 2 "$PREVIOUS_TARGET"
run_nonfatal "pre-flight backup pruning" prune_backups "$APP_DIR/backups" 5

trap rollback ERR

available_kb=$(df -Pk "$APP_DIR" | awk 'NR==2 {print $4}')
if [[ ${available_kb:-0} -lt 2097152 ]]; then
  echo "at least 2 GiB free disk is required for a parallel release" >&2
  exit 1
fi
echo "==> preparing release $RELEASE_ID from $TARGET_REF"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_DIR/releases" "$RELEASE_DIR"
install -d -o "$APP_USER" -g "$APP_USER" -m 0700 "$APP_DIR/data" "$APP_DIR/backups"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_DIR/.cache/uv" "$APP_DIR/.cache/uv-python"
git archive "$TARGET_SHA" | tar -x -C "$RELEASE_DIR"
validate_timeout_hierarchy "$RELEASE_DIR/deploy/runtime-timeouts.env"
printf 'APP_COMMIT_SHA=%s\n' "${TARGET_SHA:0:12}" > "$RELEASE_DIR/.release.env"
chmod 0644 "$RELEASE_DIR/.release.env"
ln -s "$APP_DIR/.env.local" "$RELEASE_DIR/.env.local"
ln -s "$APP_DIR/data" "$RELEASE_DIR/data"
chown -R "$APP_USER":"$APP_USER" "$RELEASE_DIR" "$APP_DIR/.cache"

echo "==> installing locked dependencies and building off-line from the live release"
run_in_release npm ci --include=dev
run_in_release env \
  UV_CACHE_DIR="$APP_DIR/.cache/uv" \
  UV_PYTHON_INSTALL_DIR="$APP_DIR/.cache/uv-python" \
  /usr/local/bin/uv sync --locked --no-dev --python 3.13 --project "$RELEASE_DIR/services/coach"
run_in_release npm run verify:poe2-data
run_in_release npm run build

PRODUCT_DB=$(env_path DB_PATH "$RELEASE_DIR/data/poe2flip.db")
[[ -f "$PRODUCT_DB" ]] && PRODUCT_EXISTED=1
if [[ ! -f "$PRODUCT_DB" ]] && ! grep -Eq '^OWNER_PASSWORD=.+$' "$APP_DIR/.env.local"; then
  echo "OWNER_PASSWORD is required when creating the first product database" >&2
  exit 1
fi
UNIT_BACKUP_DIR="$APP_DIR/backups/units-$RELEASE_ID"
install -d -o root -g root -m 0700 "$UNIT_BACKUP_DIR"
if [[ -f /etc/systemd/system/poe2flip-web.service ]]; then
  backup_unit poe2flip-web.service
  WEB_UNIT_EXISTED=1
fi
if [[ -f /etc/systemd/system/poe2flip-poller.service ]]; then
  backup_unit poe2flip-poller.service
  POLLER_UNIT_EXISTED=1
fi
if [[ -f /etc/systemd/system/poe2flip-coach.service ]]; then
  backup_unit poe2flip-coach.service
  COACH_UNIT_EXISTED=1
fi

echo "==> stopping services for migration and atomic switch"
SERVICES_STOPPED=1
for service in poe2flip-poller poe2flip-web poe2flip-coach; do
  if systemctl cat "$service" >/dev/null 2>&1; then
    systemctl stop "$service"
  fi
done

product_backup_candidate="$APP_DIR/backups/poe2flip-$RELEASE_ID.db"
backup_db "$PRODUCT_DB" "$product_backup_candidate"
[[ -f "$product_backup_candidate" ]] && PRODUCT_BACKUP="$product_backup_candidate"

run_in_release npm run db:migrate
quick_check "$PRODUCT_DB"
install -m 0644 "$RELEASE_DIR/deploy/poe2flip-web.service" /etc/systemd/system/poe2flip-web.service
install -m 0644 "$RELEASE_DIR/deploy/poe2flip-poller.service" /etc/systemd/system/poe2flip-poller.service
install -m 0644 "$RELEASE_DIR/deploy/poe2flip-coach.service" /etc/systemd/system/poe2flip-coach.service
switch_current "$RELEASE_DIR"
systemctl daemon-reload
systemctl enable poe2flip-web poe2flip-poller poe2flip-coach

echo "==> starting and checking Coach"
systemctl start poe2flip-coach
for _ in {1..30}; do
  # First probe pays a one-off full catalog validation (gunzip + parse); later probes
  # are served from the snapshot identity cache and answer in milliseconds.
  curl --fail --silent --max-time 5 http://127.0.0.1:8000/health >/dev/null && break
  sleep 1
done
COACH_HEALTH=$(curl --fail --silent --max-time 10 http://127.0.0.1:8000/health)
coach_health_gate "$COACH_HEALTH"
echo "==> starting web"
systemctl start poe2flip-web
for _ in {1..30}; do
  curl --fail --silent --max-time 5 http://127.0.0.1:3000/login >/dev/null && break
  sleep 1
done
# Smokes run as a dedicated no-login member, never the owner: persisted smoke conversations used
# to evict the owner's real history (prune-to-20) and billed two LLM turns per deploy.
SESSION_TOKEN=$(run_in_release "$RELEASE_DIR/node_modules/.bin/tsx" src/scripts/deploySmoke.ts ensure | tail -n 1)
[[ "$SESSION_TOKEN" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]] || {
  echo "deploy smoke session token is malformed" >&2
  false
}
WEB_COACH_HEALTH=$(curl --fail --silent --max-time 30 \
  --cookie "poe2flip_session=$SESSION_TOKEN" \
  http://127.0.0.1:3000/api/coach/health)
coach_health_gate "$WEB_COACH_HEALTH"
APP_HEALTH=$(curl --fail --silent --max-time 10 \
  --cookie "poe2flip_session=$SESSION_TOKEN" \
  http://127.0.0.1:3000/api/health)
node -e '
  const health = JSON.parse(process.argv[1]);
  const expected = process.argv[2];
  if (health.build !== expected) {
    console.error(`deployed build mismatch: expected ${expected}, received ${health.build}`);
    process.exit(1);
  }
' "$APP_HEALTH" "${TARGET_SHA:0:12}"

echo "==> Coach contract smoke (deterministic; the input guard rejects before any model call)"
# Exercises session auth -> history lease -> signed proxy -> FastAPI auth/rate limit/guard ->
# correlated error contract -> lease release, without a paid or nondeterministic LLM turn.
SMOKE_CONVERSATION_ID=$(new_uuid)
SMOKE_TURN_ID=$(new_uuid)
REJECTED_SMOKE=$(coach_chat "$COACH_REJECTED_PROMPT" "$SMOKE_CONVERSATION_ID" "$SMOKE_TURN_ID")
assert_rejected_coach_smoke "$REJECTED_SMOKE"
# The same turn id again: a lease leaked by the failed turn would answer 409 conversation_busy.
REPLAYED_SMOKE=$(coach_chat "$COACH_REJECTED_PROMPT" "$SMOKE_CONVERSATION_ID" "$SMOKE_TURN_ID")
assert_rejected_coach_smoke "$REPLAYED_SMOKE"
# A rejected turn must persist nothing.
test "$(curl --silent --max-time 10 --output /dev/null --write-out '%{http_code}' \
  --cookie "poe2flip_session=$SESSION_TOKEN" \
  "http://127.0.0.1:3000/api/coach/conversations/$SMOKE_CONVERSATION_ID")" = "404"
if [[ "$COACH_SMOKE_MODE" == "live" ]]; then
  run_nonfatal "live Coach smoke turn" live_coach_smoke
fi
run_in_release "$RELEASE_DIR/node_modules/.bin/tsx" src/scripts/deploySmoke.ts cleanup

echo "==> starting poller"
systemctl start poe2flip-poller
systemctl is-active --quiet poe2flip-web poe2flip-poller poe2flip-coach
curl --fail --silent --max-time 10 http://127.0.0.1:3000/login >/dev/null
test "$(curl --silent --max-time 10 --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3000/api/coach/health)" = "401"
printf '%s\n' "$TARGET_SHA" > "$APP_DIR/.deployed-revision"
chmod 0600 "$APP_DIR/.deployed-revision"
systemctl --no-pager --lines=0 status poe2flip-web poe2flip-poller poe2flip-coach

trap - ERR
# Housekeeping after success only: failure warns loudly but never un-deploys a healthy release.
echo "==> pruning old releases and pre-deploy backups"
run_nonfatal "release pruning" prune_releases "$APP_DIR/releases" 3 "$RELEASE_DIR" "$PREVIOUS_TARGET"
run_nonfatal "backup pruning" prune_backups "$APP_DIR/backups" 5
echo "done: $RELEASE_ID"
