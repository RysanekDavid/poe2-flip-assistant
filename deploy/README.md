# Deploy — PoE2 Flip Assistant on Hetzner

Single small box (CX22 ~€4/mo is plenty). Runs: Next.js web + the poller (ninja market poll
+ per-user trade2 scans) + Caddy (TLS reverse proxy). Per-user POESESSIDs are entered in-app
(Settings tab) and stored **encrypted** — no global cookie on the box.

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
apt-get install -y nodejs build-essential   # build-essential: better-sqlite3 compiles native

# Caddy (official repo)
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# Dedicated unprivileged user + app dir
useradd --system --create-home --home-dir /opt/poe2flip --shell /usr/sbin/nologin poe2flip
mkdir -p /opt/poe2flip/data
```

## 3. Sync the code
This project isn't a git repo yet. Easiest reproducible path — make a **private** repo and clone:
```bash
# on your Windows machine, in C:\Git\POE_tradechecker:
git init && git add -A && git commit -m "init"
gh repo create poe2-flip-assistant --private --source=. --push
```
```bash
# on the box — clone straight into the app dir (so `git pull` works for updates):
rm -rf /opt/poe2flip && git clone https://github.com/<you>/poe2-flip-assistant.git /opt/poe2flip
mkdir -p /opt/poe2flip/data
chown -R poe2flip:poe2flip /opt/poe2flip
```
(Alternative without git: `rsync -avz --exclude node_modules --exclude .next --exclude data ./ root@<IP>:/opt/poe2flip/` from Git Bash — but then `git pull` updates won't apply; re-rsync instead.)

## 4. Environment + secrets
The env file is named **`.env.local`** (single source for both systemd and the standalone
scripts — `db:migrate`/`addUser` load it via dotenv).
```bash
cd /opt/poe2flip
cp deploy/.env.production.example .env.local
# generate two DIFFERENT secrets:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # -> AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # -> SECRET_KEY
nano .env.local         # paste AUTH_SECRET, SECRET_KEY, set OWNER_PASSWORD
chmod 600 .env.local
chown poe2flip:poe2flip .env.local
```

## 5. Install systemd services
```bash
cp deploy/poe2flip-web.service /etc/systemd/system/
cp deploy/poe2flip-poller.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable poe2flip-web poe2flip-poller
```

## 6. First build + start
```bash
cd /opt/poe2flip
sudo -u poe2flip bash deploy/deploy.sh
```
The owner (id=1) is seeded on first DB init using `OWNER_PASSWORD`. Provision your 2 friends
(addUser loads `.env.local` itself via dotenv):
```bash
sudo -u poe2flip bash -c 'cd /opt/poe2flip && npx tsx src/scripts/addUser.ts <name> <password> member'
```
(Run it twice, once per friend. They can change the password after first login.)

## 7. Caddy (TLS reverse proxy)
```bash
cp /opt/poe2flip/deploy/Caddyfile /etc/caddy/Caddyfile
# set the site address for Caddy (pick A or B):
systemctl edit caddy
#   [Service]
#   Environment=SITE_ADDRESS=flip.example.com           # A) domain — real HTTPS (recommended)
#   Environment=SITE_ADDRESS=https://<server-ip>        # B) IP only — self-signed (early testing)
# For mode B, also uncomment `tls internal` in /etc/caddy/Caddyfile.
systemctl restart caddy
```

## 8. Firewall
```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
# NOTE: never open 3000 — Next.js stays bound to localhost behind Caddy.
```

Open `https://<your-domain-or-ip>`, log in as owner, go to **Settings**, paste your fresh
POESESSID. Friends do the same with their own. Done.

---

## Updating later
```bash
cd /opt/poe2flip && git pull --ff-only && sudo -u poe2flip bash deploy/deploy.sh
```

## Logs / health
```bash
journalctl -u poe2flip-web -f
journalctl -u poe2flip-poller -f      # watch "[poll]" / "[hunt]" / "[balance]" lines
systemctl status poe2flip-web poe2flip-poller caddy
```

## Notes
- **Rate limits are partly per-IP** — all users share this box's trade2 budget. The limiter
  (1 request at a time, 5s floor) keeps it safe; keep HUNT/AUTOSNIPE intervals conservative.
- **Desktop notifications** (node-notifier) are a no-op on a headless server; users get alerts
  in the web UI (AlertFeed + browser notifications). That's expected.
- **liveHunt WebSocket** (HUNT_ENABLED) serves the **owner's** hunts only; members are covered by
  the per-user REST scan. Per-user live sockets are a future enhancement.
- **Backups:** the whole state is `data/poe2flip.db` (+ `-wal`). `cp` it somewhere off-box
  periodically; that's your entire backup.
