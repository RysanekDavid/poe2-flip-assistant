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
The middleware also rejects (403) any POST/PUT/PATCH/DELETE whose `Origin` header is present and
differs from `APP_ORIGIN` — so it must be the exact public origin browsers use (scheme + host, no
path, no `www.`). Requests without `Origin` (local agent, curl, deploy smoke) are unaffected.

`APP_ORIGIN` must match `^https://host(:port)?$` in production (`http://` is accepted only outside
production): no path, query, credentials or whitespace; a single trailing `/` is tolerated. Good:
`APP_ORIGIN=https://flip.example.com`. Bad: `https://flip.example.com/app`, `flip.example.com`,
`http://flip.example.com`. A missing or malformed value does **not** take the site down: the web
journal logs `[middleware] APP_ORIGIN=... is invalid` once, mutations are then accepted only when
their `Origin` host equals the request's `Host` header, and unauthenticated page loads are served
the login page in place instead of being redirected. Fix the value and restart `poe2flip-web`.

The Caddyfile sends HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and an enforcing
Content-Security-Policy. `script-src`/`style-src` include `'unsafe-inline'` because Next.js streams
its RSC payload through inline scripts and React/Recharts/driver.js use inline style attributes;
images are allowed only from the app and `*.poecdn.com`, and all fetches must go to the app itself.
If a new feature loads anything from another host, extend the CSP in both Caddyfiles first. To
debug a suspected CSP breakage, temporarily rename the header to
`Content-Security-Policy-Report-Only`, reload Caddy, and read the browser console.

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
consistent SQLite backups, migration and an atomic `current` switch. It checks all services and
automatically restores the previous symlink and databases on failure.

The Coach smoke is deterministic and free: it runs as a dedicated `deploy-smoke` member (created
idempotently with a random non-scrypt password hash, so it can never log in; the owner is never
used), sends a prompt the FastAPI input guard rejects, and asserts the full proxy -> FastAPI ->
history contract (`400 request_rejected` from the guard, lease released on replay, nothing
persisted). The smoke user's conversations are deleted afterwards. `COACH_SMOKE_MODE=live`
(process env or `.env.local`; default `contract`) adds one real LLM turn that only logs latency and
never rolls a release back.

The Coach health gate is fatal for missing model configuration, knowledge base, item data, a
failed agent build (`agent_ready`: model client plus strict tool schemas, no model call) and a
broken market database schema (`market_schema_ready`, e.g. a wrong `POE_DB_PATH`). Market
freshness only warns. The poller is stopped just before the health check, for a minute or two,
which is far inside the 30-minute freshness window, so a stale heartbeat means polling was already
failing before the deploy (usually a poe.ninja outage). The warning is deliberate so such an
outage does not block UI-only deploys; investigate the poller when it appears. During an automatic
rollback the gate accepts the previous release's older health contract. Coach embeds the knowledge
corpus in a background task at start-up (`COACH_WARM_KNOWLEDGE_ON_START`, default on), so the first
knowledge question does not pay for it; the outcome is logged as `coach_knowledge_warmup`.

After a successful deploy the newest 3 release directories, the newest 5 pre-deploy product DB
backups and the newest 5 systemd unit backups (`backups/units-*`) are kept; the live `current`
target and the previous release are never deleted, and quarantined `failed-*` files are left
alone. Every pruned path is logged, and a pruning failure warns without undoing the deploy.
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
  and copy them to encrypted off-box storage periodically (the nightly timer below can do this).
- **Login throttling:** 5 failed logins per client IP + username within 15 minutes → HTTP 429 with
  `Retry-After`. Counters live in the web process memory (single `next start` process); a restart
  resets them. Scaling the web tier to several processes requires moving them to SQLite.
- **Session revocation:** changing a password (Settings or `src/scripts/setPassword.ts`) and
  Settings → "log out everywhere" (`POST /api/auth/logout-all`) bump `users.session_version`,
  which invalidates every outstanding session cookie of that user. Plain logout only clears the
  current browser's cookie. The agent API key is separate; rotate it independently.

## Scheduled backups + VACUUM (systemd timers)

Two oneshot units run the ops entrypoint `src/db/maintenanceCli.ts` from the `current` release as
the `poe2flip` user, reading `DB_PATH` from `.env.local`:

| Unit | Schedule | What it does |
|------|----------|--------------|
| `poe2flip-backup.timer` | nightly 03:15 (+≤10 min jitter) | online SQLite backup API snapshot → `journal_mode=DELETE` + `quick_check` → gzip → `/opt/poe2flip/backups/nightly/<db>-<UTC stamp>.db.gz` (mode 600), keeps the newest `BACKUP_KEEP` (14); optional off-box copy |
| `poe2flip-maintenance.timer` | 1st of the month 04:30 | `wal_checkpoint(TRUNCATE)` → `VACUUM` → checkpoint again; logs size + freelist before/after |

Neither stops the web or poller. The VACUUM waits up to 60 s (`--wait=60`) for the write lock and
then **fails the unit** rather than skipping; `systemctl --failed` / `journalctl` shows it. It needs
free disk of about twice the live data size while it runs and checks that first: with less than 2×
(DB + WAL) free on the data filesystem it fails with `refusing to VACUUM ... free disk space first`
before touching the file. The backup timer is `Persistent=true` (a night missed during downtime
runs at the next boot); the VACUUM timer deliberately is not, so a reboot never triggers a catch-up
VACUUM at a busy hour — a skipped month just waits for the next 1st. The app's own connections wait 5 s on a
lock, so run the **first** VACUUM of a long-unvacuumed database manually with the poller stopped
(`systemctl stop poe2flip-poller`, `sudo -u poe2flip bash -c 'cd /opt/poe2flip/current && npm run db:maintain'`,
`systemctl start poe2flip-poller`); later monthly runs only reclaim a month of churn and are quick.

The optional off-box copy runs when `BACKUP_RCLONE_REMOTE` is set in `.env.local` (for example
`BACKUP_RCLONE_REMOTE=b2crypt:poe2flip/nightly`). Use an rclone **crypt** remote — the backups
contain private user data — and keep its config outside the git checkout so `deploy.sh`'s clean-tree
check keeps passing:

```bash
apt-get install -y rclone
install -d -m 0750 -o root -g poe2flip /etc/poe2flip
rclone config --config /etc/poe2flip/rclone.conf   # create the backend + crypt remotes
chown root:poe2flip /etc/poe2flip/rclone.conf && chmod 0640 /etc/poe2flip/rclone.conf
# then in /opt/poe2flip/.env.local:
#   BACKUP_RCLONE_REMOTE=b2crypt:poe2flip/nightly
#   RCLONE_CONFIG=/etc/poe2flip/rclone.conf
```

A failing rclone copy fails the unit (the local backup is still written first).

Install or refresh the units (deploy.sh does not install them yet):

```bash
install -m 0644 /opt/poe2flip/current/deploy/poe2flip-backup.{service,timer} \
  /opt/poe2flip/current/deploy/poe2flip-maintenance.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now poe2flip-backup.timer poe2flip-maintenance.timer
systemctl start poe2flip-backup.service            # first backup now; must exit 0
journalctl -u poe2flip-backup -n 20 --no-pager
ls -l /opt/poe2flip/backups/nightly/
systemctl list-timers 'poe2flip-*'
```

Restore a nightly backup (services stopped):
`gunzip -c /opt/poe2flip/backups/nightly/<file>.db.gz > /opt/poe2flip/data/poe2flip.db.restore`,
check it with `sqlite3 … 'PRAGMA quick_check;'`, then move it over the live file (remove the stale
`-wal`/`-shm` siblings first) and start the services.
