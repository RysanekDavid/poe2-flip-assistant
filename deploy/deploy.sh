#!/usr/bin/env bash
# Build + migrate + restart on the box. Run AFTER syncing the code to /opt/poe2flip
# (see README.md → "Sync code"). Idempotent: safe to re-run on every update.
set -euo pipefail

APP_DIR=/opt/poe2flip
cd "$APP_DIR"

echo "==> installing deps (incl. dev — tsx + tailwind are needed at build/runtime)"
npm ci

echo "==> building Next.js"
npm run build

echo "==> applying DB migrations (idempotent)"
npm run db:migrate

echo "==> restarting services"
sudo systemctl restart poe2flip-web poe2flip-poller

echo "==> status"
systemctl --no-pager --lines=0 status poe2flip-web poe2flip-poller || true
echo "done."
