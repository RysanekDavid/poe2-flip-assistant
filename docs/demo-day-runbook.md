# Demo Day release and recording runbook

This runbook contains no credentials. Replace angle-bracket placeholders locally and never paste
secret output into chat, issue trackers, slides, or recordings.

## 1. Domain and TLS

1. Choose the final public hostname and create an `A` record to `<SERVER_IP>`; add `AAAA` only if
   IPv6 is intentionally routed and firewalled.
2. Confirm DNS from two resolvers: `dig +short <DOMAIN> A` and `dig @1.1.1.1 +short <DOMAIN> A`.
3. Ensure inbound 80/443 and SSH are allowed. Do not expose 3000 or 8000.
4. Install `deploy/Caddyfile` and set `SITE_ADDRESS=<DOMAIN>` in a Caddy systemd drop-in.
5. Validate with the same value: `SITE_ADDRESS=<DOMAIN> caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`.
6. Run `systemctl reload caddy`, then inspect `journalctl -u caddy --since '5 minutes ago'`.
7. Verify `curl --fail --silent --show-error https://<DOMAIN>/login >/dev/null` without `-k`.

Production `deploy/Caddyfile` deliberately has no `tls internal`. `deploy/Caddyfile.ip-test` is
only for disposable early IP tests and never qualifies as Demo Day TLS.

## 2. Safe demo account

Create a dedicated member off-camera. Do not give it POESESSID; shared market/craft data still
works, while Wealth, positions, attempts, and stash history remain empty until manually populated.

```bash
read -r -s -p 'Demo password: ' DEMO_PASSWORD; printf '\n'
printf '%s\n' "$DEMO_PASSWORD" | sudo -u poe2flip bash -c \
  'cd /opt/poe2flip/current && npx tsx src/scripts/addUser.ts demo_member member'
unset DEMO_PASSWORD
```

The script refuses passwords in argv/interactive echoed input and does not print its generated
API key. Never open Settings, DevTools, cookies, a password manager, server logs, or terminals in
the recording. Crop username, alerts, net worth, stash names, seller names, and whispers.

## 3. Atomic deployment and provenance

From `/opt/poe2flip`, fetch the intended ref, verify its full SHA, and invoke the deployment script
from that exact ref as described in `deploy/README.md`. `deploy.sh` archives the exact commit,
writes a release-local `.release.env`, switches `current`, and checks that authenticated
`/api/health` returns the target 12-character `build` value. It does not expose environment data.
The product `.env.local` and isolated `.coach.env` must both be mode `600`; never open either
during recording. The deploy verifies the committed RePoE snapshot offline before building.

Do not proceed if the server worktree is dirty, Coach readiness is degraded, snapshot integrity
fails, or the build ID differs. Automatic rollback returns `current` to the previous release; its
own release-local build ID follows the symlink. To intentionally redeploy a known previous commit,
run `bash deploy/deploy.sh <PREVIOUS_FULL_SHA>` after verifying the SHA.

## 4. Browser and health smoke

- [ ] `https://<DOMAIN>/` returns a relative 307 `Location: /login`, never localhost.
- [ ] `/login` loads without a certificate warning in a clean anonymous browser.
- [ ] Anonymous `/api/health` and `/api/coach/health` return 401.
- [ ] Authenticated `/api/health` shows the expected build and fresh ninja timestamp.
- [ ] Coach shows `sources ready`; market, knowledge and item data are ready, and the exact live
      demo prompt has separately proved model connectivity.
- [ ] Currency Top Flips is populated and labelled `heuristic · not executable`.
- [ ] FarmAdvisor is populated and labelled `not Div/hour`.
- [ ] Craft shows a fresh report for `Boots · putrefaction ES (caster)`.
- [ ] Coach returns tools, evidence sources, and the human-verification notice.

## 5. Exact three-minute click path

1. Start already authenticated on **Currency Exchange**; enter `20 Divine` in the converter.
2. Open one **Top Flip** row and its price chart. Call it an observed heuristic, not an order.
3. Show the leading **FarmAdvisor** basket and drivers. Call it basket heat, not Div/hour.
4. Open **Craft → Armour craft → Boots · putrefaction ES (caster) → Craft**. Show the market
   check, observed base/result comparables, curated hit rate, modelled EV, and the first two
   guide phases. Do not claim the hit rate is measured, and do not start/log a real attempt.
5. Open **Coach**, click the `DEMO` suggestion, and show the tool chip plus knowledge sources.

Exact Coach prompt:

> On a desecrated Time-Lost jewel, when should I use Omen of Light versus Omen of Sinistral Annulment? Use only verified knowledge-base evidence; do not discuss drop sources or current prices.

Expected answer boundary: Light targets Desecrated modifiers; Sinistral restricts removal to
prefixes; the available tooltip evidence does **not** prove that the exact Time-Lost over-cap
interaction remains valid. The answer must cite KB evidence and admit that limitation.

## 6. Recording backup

Pre-record the Coach turn and keep the public certification demo and existing Loom open in a
separate tab. If Coach times out or returns an error, show the saved clip, state that the live
service failed safely, and continue with Currency/Craft. Never improvise a new high-stakes prompt.

## 7. Claims not allowed

- Top Flip is an executable bid/ask or guaranteed profit.
- FarmAdvisor measures Div/hour.
- Observed trade listings are guaranteed sales.
- Craft EV is a complete probability simulation.
- RePoE proves exact crafting probabilities or an optimal currency sequence.
- The exact Time-Lost over-cap annul interaction is verified by the two omen tooltips.
- Coach can buy, sell, click, whisper, or automate the game.
- Certification eval results evaluate this integrated deployment.
- A release is deployed unless its build ID has been checked.
