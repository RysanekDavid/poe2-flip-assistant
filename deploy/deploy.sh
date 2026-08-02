#!/usr/bin/env bash
# Build a versioned release, back up/migrate SQLite, atomically switch, then health-check.
# Usage (as root): bash deploy/deploy.sh [git-ref]
set -Eeuo pipefail
umask 077

APP_DIR=/opt/poe2flip
APP_USER=poe2flip
TARGET_REF=${1:-HEAD}
CURRENT_LINK="$APP_DIR/current"
SERVICES_STOPPED=0
PRODUCT_BACKUP=""
CHECKPOINT_BACKUP=""
PRODUCT_EXISTED=0
CHECKPOINT_EXISTED=0
WEB_UNIT_EXISTED=0
POLLER_UNIT_EXISTED=0
COACH_UNIT_EXISTED=0
PREVIOUS_CURRENT_EXISTS=0
PREVIOUS_TARGET=""
PREVIOUS_WEB_ENABLED=0
PREVIOUS_POLLER_ENABLED=0
PREVIOUS_COACH_ENABLED=0

if [[ $(id -u) -ne 0 ]]; then
  echo "run this as root: release setup and systemd require root" >&2
  exit 1
fi

run_as_app() { runuser -u "$APP_USER" -- "$@"; }

run_in_release() {
  runuser -u "$APP_USER" -- sh -c 'cd "$1" && shift && exec "$@"' sh "$RELEASE_DIR" "$@"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

switch_current() {
  local target=$1
  local temporary="$APP_DIR/.current-$RELEASE_ID-$$-$RANDOM"
  ln -s "$target" "$temporary"
  mv -Tf "$temporary" "$CURRENT_LINK"
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
    if [[ -n "$CHECKPOINT_BACKUP" ]]; then
      run_as_app sqlite3 "$CHECKPOINT_DB" ".restore '$CHECKPOINT_BACKUP'" || rollback_ok=0
      quick_check "$CHECKPOINT_DB" || rollback_ok=0
    elif [[ $CHECKPOINT_EXISTED -eq 0 ]]; then
      quarantine_db "$CHECKPOINT_DB" || rollback_ok=0
    fi
    restore_unit poe2flip-web.service "$WEB_UNIT_EXISTED" || rollback_ok=0
    restore_unit poe2flip-poller.service "$POLLER_UNIT_EXISTED" || rollback_ok=0
    restore_unit poe2flip-coach.service "$COACH_UNIT_EXISTED" || rollback_ok=0
    systemctl daemon-reload || rollback_ok=0
    restore_enablement poe2flip-web "$PREVIOUS_WEB_ENABLED" || rollback_ok=0
    restore_enablement poe2flip-poller "$PREVIOUS_POLLER_ENABLED" || rollback_ok=0
    restore_enablement poe2flip-coach "$PREVIOUS_COACH_ENABLED" || rollback_ok=0
    if [[ $PREVIOUS_COACH_ACTIVE -eq 1 ]] && ! systemctl start poe2flip-coach; then
      rollback_ok=0
    fi
    if [[ $PREVIOUS_WEB_ACTIVE -eq 1 ]] && ! systemctl start poe2flip-web; then
      rollback_ok=0
    fi
    if [[ $PREVIOUS_POLLER_ACTIVE -eq 1 ]] && ! systemctl start poe2flip-poller; then
      rollback_ok=0
    fi
    sleep 2
    [[ $PREVIOUS_COACH_ACTIVE -eq 1 ]] && ! systemctl is-active --quiet poe2flip-coach && rollback_ok=0
    [[ $PREVIOUS_WEB_ACTIVE -eq 1 ]] && ! systemctl is-active --quiet poe2flip-web && rollback_ok=0
    [[ $PREVIOUS_POLLER_ACTIVE -eq 1 ]] && ! systemctl is-active --quiet poe2flip-poller && rollback_ok=0
    if [[ $PREVIOUS_WEB_ACTIVE -eq 1 ]]; then
      curl --fail --silent --max-time 10 http://127.0.0.1:3000/login >/dev/null || rollback_ok=0
    fi
    if [[ $PREVIOUS_COACH_ACTIVE -eq 1 ]]; then
      curl --fail --silent --max-time 10 http://127.0.0.1:8000/health >/dev/null || rollback_ok=0
    fi
    if [[ $rollback_ok -eq 0 ]]; then
      systemctl stop poe2flip-poller poe2flip-web poe2flip-coach 2>/dev/null
      echo "FATAL: rollback validation failed; services remain stopped" >&2
      exit 90
    fi
  fi
  echo "failed release kept for inspection: $RELEASE_DIR" >&2
  exit "$status"
}

for command in curl date df git mv node npm sqlite3 stat systemctl tar; do
  require_command "$command"
done
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
for key in AUTH_SECRET SECRET_KEY COACH_THREAD_SECRET; do
  if ! grep -Eq "^${key}=.+$" .env.local; then
    echo "missing required value for $key in $APP_DIR/.env.local" >&2
    exit 1
  fi
done
for key in OPENAI_API_KEY POE_DB_PATH COACH_CHECKPOINT_DB_PATH POE2_DATA_MANIFEST; do
  if ! grep -Eq "^${key}=.+$" .coach.env; then
    echo "missing required value for $key in $APP_DIR/.coach.env" >&2
    exit 1
  fi
done
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
CHECKPOINT_DB=$(env_path COACH_CHECKPOINT_DB_PATH "$RELEASE_DIR/data/coach-checkpoints.db" "$APP_DIR/.coach.env")
[[ -f "$PRODUCT_DB" ]] && PRODUCT_EXISTED=1
[[ -f "$CHECKPOINT_DB" ]] && CHECKPOINT_EXISTED=1
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
checkpoint_backup_candidate="$APP_DIR/backups/coach-checkpoints-$RELEASE_ID.db"
backup_db "$PRODUCT_DB" "$product_backup_candidate"
[[ -f "$product_backup_candidate" ]] && PRODUCT_BACKUP="$product_backup_candidate"
backup_db "$CHECKPOINT_DB" "$checkpoint_backup_candidate"
[[ -f "$checkpoint_backup_candidate" ]] && CHECKPOINT_BACKUP="$checkpoint_backup_candidate"

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
  curl --fail --silent --max-time 2 http://127.0.0.1:8000/health >/dev/null && break
  sleep 1
done
curl --fail --silent --max-time 10 http://127.0.0.1:8000/health | node -e '
let body = "";
process.stdin.on("data", chunk => body += chunk);
process.stdin.on("end", () => {
  const health = JSON.parse(body);
  if (health.status !== "ok" || !health.market_ready || !health.knowledge_ready || !health.model_configured) {
    console.error("Coach health is degraded", health);
    process.exit(1);
  }
});'
echo "==> starting web"
systemctl start poe2flip-web
for _ in {1..30}; do
  curl --fail --silent --max-time 5 http://127.0.0.1:3000/login >/dev/null && break
  sleep 1
done
SESSION_TOKEN=$(run_in_release "$RELEASE_DIR/node_modules/.bin/tsx" -e 'import { signSession } from "./src/auth/auth"; console.log(signSession(1, 60_000));')
CONVERSATION_ID=$(node -e 'console.log(require("node:crypto").randomUUID())')
curl --fail --silent --max-time 30 \
  --cookie "poe2flip_session=$SESSION_TOKEN" \
  http://127.0.0.1:3000/api/coach/health | node -e '
let body = "";
process.stdin.on("data", chunk => body += chunk);
process.stdin.on("end", () => {
  const health = JSON.parse(body);
  if (health.status !== "ok") process.exit(1);
});'
curl --fail --silent --max-time 10 \
  --cookie "poe2flip_session=$SESSION_TOKEN" \
  http://127.0.0.1:3000/api/health | node -e '
let body = "";
process.stdin.on("data", chunk => body += chunk);
process.stdin.on("end", () => {
  const expected = process.argv[1];
  const health = JSON.parse(body);
  if (health.build !== expected) {
    console.error(`deployed build mismatch: expected ${expected}, received ${health.build}`);
    process.exit(1);
  }
});' "${TARGET_SHA:0:12}"
CHAT_STARTED_MS=$(date +%s%3N)
CHAT_RESPONSE=$(curl --fail --silent --max-time 120 \
  --cookie "poe2flip_session=$SESSION_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "{\"message\":\"On a desecrated Time-Lost jewel, when should I use Omen of Light versus Omen of Sinistral Annulment? Use only verified knowledge-base evidence; do not discuss drop sources or current prices.\",\"conversationId\":\"$CONVERSATION_ID\"}" \
  http://127.0.0.1:3000/api/coach/chat)
CHAT_ELAPSED_MS=$(($(date +%s%3N) - CHAT_STARTED_MS))
printf '%s' "$CHAT_RESPONSE" | node -e '
let body = "";
process.stdin.on("data", chunk => body += chunk);
process.stdin.on("end", () => {
  const response = JSON.parse(body);
  const answer = typeof response.answer === "string" ? response.answer : "";
  const lowered = answer.toLowerCase();
  const terms = ["omen of light", "desecrated modifier", "omen of sinistral annulment", "prefix modifier", "cannot", "time-lost"];
  const sources = Array.isArray(response.sources) ? response.sources : [];
  const exactTools = JSON.stringify(response.toolsUsed) === JSON.stringify(["retrieve_knowledge"]);
  const exactSources = sources.length > 0 && sources.every(source => source.type === "knowledge" && /desecration-abyss/i.test(source.title) && /deterministic scope/i.test(source.title));
  const cited = sources.some(source => answer.includes(`[${source.id}]`));
  const processors = Array.isArray(response.processorsUsed) && response.processorsUsed.length === 0;
  const forbidden = ["drop source", "drops from", "current price"].some(term => lowered.includes(term));
  const associations = [
    /omen of light(?:(?!omen of sinistral annulment)[\s\S]){0,200}desecrated modifier/i,
    /omen of sinistral annulment(?:(?!omen of light)[\s\S]){0,200}prefix modifier/i,
  ];
  if (!exactTools || !exactSources || !cited || !processors || forbidden || !terms.every(term => lowered.includes(term)) || !associations.every(pattern => pattern.test(answer)) || !answer.includes("Verify prices in-game before trading.")) {
    console.error("Coach demo contract failed");
    process.exit(1);
  }
});' "$CHAT_ELAPSED_MS"
echo "Coach demo latency: ${CHAT_ELAPSED_MS}ms"

echo "==> starting poller"
systemctl start poe2flip-poller
systemctl is-active --quiet poe2flip-web poe2flip-poller poe2flip-coach
curl --fail --silent --max-time 10 http://127.0.0.1:3000/login >/dev/null
test "$(curl --silent --max-time 10 --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3000/api/coach/health)" = "401"
printf '%s\n' "$TARGET_SHA" > "$APP_DIR/.deployed-revision"
chmod 0600 "$APP_DIR/.deployed-revision"
systemctl --no-pager --lines=0 status poe2flip-web poe2flip-poller poe2flip-coach

trap - ERR
echo "done: $RELEASE_ID"
