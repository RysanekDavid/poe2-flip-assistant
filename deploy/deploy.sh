#!/usr/bin/env bash
# Build + migrate + restart on the box. Run AS ROOT after syncing the code to /opt/poe2flip
# (see README.md → "Updating later"). Idempotent: safe to re-run on every update.
# Build/migrate run as the unprivileged app user; the service restart needs root.
set -euo pipefail

APP_DIR=/opt/poe2flip
APP_USER=poe2flip
cd "$APP_DIR"

if [[ $(id -u) -ne 0 ]]; then
  echo "run this as root: it drops to '$APP_USER' for the build and needs root for systemctl" >&2
  exit 1
fi

run_as_app() { runuser -u "$APP_USER" -- "$@"; }

echo "==> installing deps (incl. dev — tsx + tailwind are needed at build/runtime)"
run_as_app npm ci

echo "==> building Next.js"
run_as_app npm run build

echo "==> applying DB migrations (idempotent)"
run_as_app npm run db:migrate

echo "==> restarting services"
systemctl restart poe2flip-web poe2flip-poller

echo "==> status"
systemctl --no-pager --lines=0 status poe2flip-web poe2flip-poller || true
echo "done."
