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
# Node 20 (NodeSource)
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

## 4. Environment + secrets
The env file is named **`.env.local`** (single source for both systemd and the standalone
scripts — `db:migrate`/`addUser` load it via dotenv).
```bash
cd /opt/poe2flip
cp deploy/.env.production.example .env.local
# generate three DIFFERENT secrets:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # -> AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # -> SECRET_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # -> COACH_THREAD_SECRET
nano .env.local         # also set OWNER_PASSWORD and OPENAI_API_KEY; Tavily is optional
chmod 600 .env.local
chown poe2flip:poe2flip .env.local
```

On an existing server, edit the current `.env.local` and add only the new Coach variables.
**Never overwrite it from the example:** preserving `AUTH_SECRET` keeps sessions valid and
preserving `SECRET_KEY` keeps the stored POESESSIDs decryptable. Rotate any API key that has
appeared in terminal transcripts before putting it into production.

## 5. First build + start
```bash
cd /opt/poe2flip
bash deploy/deploy.sh HEAD
```
The deploy script installs and enables all systemd units itself. It builds under a new versioned
`releases/` directory and switches `current` only after the build and database backup succeed.

The owner (id=1) is seeded on first DB init using `OWNER_PASSWORD`. Provision your 2 friends
(addUser loads `.env.local` itself via dotenv):
```bash
sudo -u poe2flip bash -c 'cd /opt/poe2flip/current && npx tsx src/scripts/addUser.ts <name> <password> member'
```
(Run it twice, once per friend. They can change the password after first login.)
After the owner login works, clear `OWNER_PASSWORD` from `.env.local`; it is needed only to seed an
empty database.

## 6. Caddy (TLS reverse proxy)
```bash
cp /opt/poe2flip/current/deploy/Caddyfile /etc/caddy/Caddyfile
# set the site address for Caddy (pick A or B):
systemctl edit caddy
#   [Service]
#   Environment=SITE_ADDRESS=flip.example.com           # A) domain — real HTTPS (recommended)
#   Environment=SITE_ADDRESS=https://<server-ip>        # B) IP only — self-signed (early testing)
# For mode B, also uncomment `tls internal` in /etc/caddy/Caddyfile.
# Validate with the SAME value used above, because the shell cannot see Caddy's systemd env.
SITE_ADDRESS=flip.example.com caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl restart caddy
```

## 7. Firewall
```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
# NOTE: never open 3000 or 8000 — both services stay on loopback behind Next.js/Caddy.
```

Open `https://<your-domain-or-ip>`, log in as owner, go to **Settings**, paste your fresh
POESESSID. Friends do the same with their own. Done.

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

## Logs / health
```bash
journalctl -u poe2flip-web -f
journalctl -u poe2flip-poller -f      # watch "[poll]" / "[hunt]" / "[balance]" lines
journalctl -u poe2flip-coach -f
systemctl status poe2flip-web poe2flip-poller poe2flip-coach caddy
curl -sS http://127.0.0.1:8000/health
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
- **Backups:** `deploy.sh` uses SQLite's consistent `.backup` operation for the product DB and
  Coach checkpoints. Backups contain private user and trading data: keep them mode `600`, off Git,
  and copy them to encrypted off-box storage periodically.
