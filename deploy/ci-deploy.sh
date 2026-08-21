#!/usr/bin/env bash
# Forced-command entrypoint for the GitHub Actions deploy key.
#
# Install ONCE on the server as /root/ci-deploy.sh (mode 700), then restrict the CI key
# in /root/.ssh/authorized_keys to it:
#
#   command="/root/ci-deploy.sh",restrict ssh-ed25519 <CI_PUBLIC_KEY> github-actions-deploy
#
# The restriction means the CI key cannot open a shell or run anything else — it can only
# trigger this exact sequence, which is the documented "Updating later" flow from
# deploy/README.md. deploy.sh itself does the atomic release, health checks and rollback.
set -euo pipefail

cd /opt/poe2flip
git fetch origin master

# deploy.sh sources deploy-helpers.sh from its own directory, so extract both
# files from the TARGET ref into one temp dir (never run the old checkout's copy).
deploy_dir=$(mktemp -d /root/poe2flip-deploy.XXXXXX)
trap 'rm -rf "$deploy_dir"' EXIT
git show origin/master:deploy/deploy.sh > "$deploy_dir/deploy.sh"
git show origin/master:deploy/deploy-helpers.sh > "$deploy_dir/deploy-helpers.sh"
test -s "$deploy_dir/deploy.sh"
test -s "$deploy_dir/deploy-helpers.sh"

bash "$deploy_dir/deploy.sh" origin/master

# Move the server checkout only after the release passed all health checks.
git merge --ff-only origin/master
