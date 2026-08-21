# Deploy — PoE2 Flip Assistant on Hetzner

Single small box (CX22 ~€4/mo is plenty). Runs: Next.js web + the poller (ninja market poll
+ per-user trade2 scans) + the internal Python Coach + Caddy (TLS reverse proxy). Per-user
POESESSIDs are entered in-app (Settings tab) and stored **encrypted** — no global cookie on the
box. Coach is private on `127.0.0.1:8000`; browsers can reach it only through authenticated
Next.js routes.

> **Before you start:** do the security cleanup first — log out of pathofexile.com (kills the
> leaked cookie from the probe test) and delete the old probe box. Generate all secrets ON THE
> BOX (commands below); never paste secrets into chat or commit them.

---

## 1. Provision the box
- Create a fresh Hetzner CX22, Ubuntu 24.04 LTS, add your SSH key.
- SSH in: `ssh root@<IP>`

## 2. System setup (as root)
```bash
# Node 20.18.1 or newer (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs build-essential sqlite3

# uv manages the locked Coach environment and installs Python 3.13 when missing.
curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh

# Caddy (official repo)
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# Dedicated unprivileged user. Git creates the home/app directory in the next step.
useradd --system --home-dir /opt/poe2flip --shell /usr/sbin/nologin poe2flip
```

## 3. Sync the code
Keep the product repository private. Add a read-only GitHub deploy key to a fresh server before
cloning; the existing Hetzner box already has one.
```bash
# on the box — clone straight into the app dir (so `git pull` works for updates):
git clone git@github.com:RysanekDavid/poe2-flip-assistant.git /opt/poe2flip
mkdir -p /opt/poe2flip/data
chown -R poe2flip:poe2flip /opt/poe2flip
git config --global --add safe.directory /opt/poe2flip
```

Before merging a game-data update, run `npm run sync:poe2-data` on the development machine and
commit both `src/data/poe2/repoe/manifest.json` and the referenced content-addressed `.json.gz`
artifact. Deployment deliberately does not download mutable game data: if that snapshot is absent
or corrupt, the Coach health check fails and the atomic deploy rolls back.

## 4. Environment + secrets
Web/poller settings live in **`.env.local`**; standalone TypeScript scripts load that file.
Coach receives a separate strict allowlist from **`.coach.env`**. Its systemd sandbox makes the
product env paths inaccessible; Coach tools never query user credential columns, and the shared
database contains POESESSID only as ciphertext without the product decryption key.
```bash
cd /opt/poe2flip
cp deploy/.env.production.example .env.local
cp deploy/coach.env.example .coach.env
# generate three DIFFERENT secrets:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # -> AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # -> SECRET_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # -> COACH_THREAD_SECRET
nano .env.local         # product auth/encryption/database settings only
nano .coach.env         # model key, optional Tavily key, Coach database/catalog paths
chmod 600 .env.local .coach.env
chown poe2flip:poe2flip .env.local .coach.env
```

Set `DATA_SOURCE_CONTACT` in `.env.local` to a monitored email address or operator contact URL.
The official patch watcher is enabled by default and the deployment preflight rejects a blank
contact while it is enabled.

On an existing server, preserve `.env.local` and create `.coach.env` from its dedicated example.
**Never overwrite it from the example:** preserving `AUTH_SECRET` keeps sessions valid and
preserving `SECRET_KEY` keeps the stored POESESSIDs decryptable. Rotate any API key that has
appeared in terminal transcripts before putting it into production.

The deploy preflight validates the non-secret latency policy in
`deploy/runtime-timeouts.env` before it stops any service. Both systemd units load that policy
through the atomic `current` symlink after their private environment files. The new release uses
the approved 45/140/160-second hierarchy, while rollback automatically restores the previous
release's compatible policy. Do not copy these timeout values into the private environment
templates; existing legacy timeout lines may remain because the later systemd overlay wins only
for releases that support it.

## 5. First build + start
```bash
cd /opt/poe2flip
bash deploy/deploy.sh HEAD
```
The deploy script installs and enables all systemd units itself. It builds under a new versioned
`releases/` directory and switches `current` only after the build and database backup succeed.

The owner (id=1) is seeded on first DB init using `OWNER_PASSWORD`. Create a dedicated demo user
without putting its password in shell history or process arguments:
```bash
read -rsp 'Demo password: ' DEMO_PASSWORD; printf '\n'
printf '%s\n' "$DEMO_PASSWORD" | sudo -u poe2flip bash -c \
  'cd /opt/poe2flip/current && npx tsx src/scripts/addUser.ts demo member'
unset DEMO_PASSWORD
```
The script refuses a password on the command line, refuses an echoed TTY, never prints the
generated application API key, and does not require POESESSID. Shared market and Craft data work;
user-specific Wealth, positions, alerts and hunts begin empty.
After the owner login works, clear `OWNER_PASSWORD` from `.env.local`; it is needed only to seed an
empty database.

## 6. DNS and Caddy (trusted TLS reverse proxy)

Create an `A` record from the public hostname to the server IPv4 address. Add `AAAA` only when
IPv6 routing and firewalling are configured. Wait until both an external resolver and the server
resolve the hostname to the intended address:

```bash
dig +short A flip.example.com @1.1.1.1
getent ahostsv4 flip.example.com
```

Production uses the domain-only `deploy/Caddyfile`. It has no `tls internal` directive, so Caddy
Automatic HTTPS obtains and renews a publicly trusted certificate. The separate
`deploy/Caddyfile.ip-test` is only for temporary IP/self-signed testing and must not be used for
Demo Day.

```bash
cp /opt/poe2flip/current/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl edit caddy
#   [Service]
#   Environment=SITE_ADDRESS=flip.example.com
systemctl daemon-reload
# An interactive shell does not inherit the systemd override; pass the same address to validate.
SITE_ADDRESS=flip.example.com caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
curl --fail --silent --show-error --location https://flip.example.com/login >/dev/null
openssl s_client -connect flip.example.com:443 -servername flip.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

The Caddy upstream is `127.0.0.1:3000`; Coach is `127.0.0.1:8000` behind authenticated Next
routes. Never bind either service publicly. Set `APP_ORIGIN=https://<DOMAIN>` in `.env.local`;
auth redirects use that validated origin instead of the internal upstream or untrusted Host headers.

## 7. Firewall
```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
# NOTE: never open 3000 or 8000 — both services stay on loopback behind Next.js/Caddy.
```

Open the domain in a clean browser and log in. Connecting a personal PoE account is optional and
must never be done or shown during a recorded demo.

---

## Updating later
```bash
# As root. Fetch without touching the running checkout, then run the deploy script from that ref.
cd /opt/poe2flip
git config --global --add safe.directory /opt/poe2flip
git fetch origin master
deploy_script=$(mktemp /root/poe2flip-deploy.XXXXXX)
trap 'unlink "$deploy_script"' EXIT
git show origin/master:deploy/deploy.sh > "$deploy_script"
test -s "$deploy_script"
expected_sha=$(git rev-parse origin/master)
bash "$deploy_script" origin/master
# Only move the server checkout after the release passed all health checks.
git merge --ff-only origin/master
```

`deploy.sh` installs and builds beside the running release, then stops the app briefly for
consistent SQLite backups, migration and an atomic `current` switch. It performs a real Coach
chat turn, checks all services, and automatically restores the previous symlink and databases on
failure. Keep the pre-deploy backups until the release has passed a browser smoke test. Old
releases/backups are intentionally not auto-deleted; prune them manually only after verification.
The site-specific `/etc/caddy/Caddyfile` is intentionally not overwritten during app updates;
copy, validate and restart it separately only when the repository Caddy config actually changes.

Each release contains a non-secret `.release.env` generated from the exact target commit. The web
unit exposes only its twelve-character build identifier in authenticated `/api/health`, and the
deploy smoke test requires it to equal `${expected_sha:0:12}` before succeeding. Because the file
lives inside the versioned release, an automatic or manual symlink rollback restores the matching
identifier as well.

## Automated deploy (GitHub Actions)

`.github/workflows/deploy.yml` runs the full test matrix on every push to `master` and, when
green, triggers the server's standard update flow over SSH. The SSH key is dedicated to CI and
restricted on the server to the forced command `/root/ci-deploy.sh` (see `deploy/ci-deploy.sh`),
so it cannot open a shell. One-time setup:

```bash
# 1. Anywhere: generate a dedicated keypair (no passphrase; it lives only in GitHub secrets)
ssh-keygen -t ed25519 -f ci_deploy_key -N "" -C "github-actions-deploy"

# 2. On the server: install the forced-command script and authorize the key
#    (copy deploy/ci-deploy.sh from the repo)
install -m 700 /opt/poe2flip/deploy/ci-deploy.sh /root/ci-deploy.sh
printf 'command="/root/ci-deploy.sh",restrict %s\n' "$(cat ci_deploy_key.pub)" \
  >> /root/.ssh/authorized_keys

# 3. In the repo: store the secrets
gh secret set DEPLOY_HOST --body "<SERVER_IP>"
gh secret set DEPLOY_SSH_KEY < ci_deploy_key
ssh-keyscan -t ed25519 <SERVER_IP> | gh secret set DEPLOY_KNOWN_HOSTS
rm ci_deploy_key ci_deploy_key.pub
```

Secrets on the box (`.env.local`, `.coach.env`, `COACH_PROXY_SECRET`) stay manual by design —
the pipeline never sees them. Manual runs: Actions → Deploy → Run workflow. The existing
`deploy.sh` health checks and automatic rollback apply unchanged.

## Logs / health
```bash
journalctl -u poe2flip-web -f
journalctl -u poe2flip-poller -f      # watch "[poll]" / "[hunt]" / "[balance]" lines
journalctl -u poe2flip-coach -f
journalctl -u poe2flip-coach --since "15 minutes ago" --no-pager | grep coach_timing
systemctl status poe2flip-web poe2flip-poller poe2flip-coach caddy
curl -sS http://127.0.0.1:8000/health
# Authenticated browser check: /api/health must show the expected short build identifier.
```

## Notes
- **Rate limits are partly per-IP** — all users share this box's trade2 budget. The limiter
  (1 request at a time, 5s floor) keeps it safe; keep HUNT/AUTOSNIPE intervals conservative.
- **Desktop notifications** (node-notifier) are a no-op on a headless server; users get alerts
  in the web UI (AlertFeed + browser notifications). That's expected.
- **liveHunt WebSocket** (HUNT_ENABLED) serves the **owner's** hunts only; members are covered by
  the per-user REST scan. Per-user live sockets are a future enhancement.
- **Coach rate limit:** requests arrive from the authenticated Next.js proxy, so the Python limit
  is a global spend cap for the box, not a separate limit per browser user.
- **Backups:** `deploy.sh` uses SQLite's consistent `.backup` operation for the product DB, which
  includes canonical Coach history. Backups contain private user and trading data: keep them mode `600`, off Git,
  and copy them to encrypted off-box storage periodically.
