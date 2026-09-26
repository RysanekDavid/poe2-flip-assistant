# Coach + platform + UX audit — 2026-09-26 (master @ 941d1a4)

lint/typecheck/test:coach PASS; pytest 52 passed; npm audit: 7 vulns (1 critical, 3 high) — all
patch-level (next 15.5.19 → 15.5.26 etc.); 23 packages outdated (11 major).

## Verdicts

Coach, Poller&ops, DB, CI/deploy, Security, UX — all **SHIP WITH FIXES**.

## Key findings

- BUG `services/coach/src/tools/market.py:176` — Coach market tools ignore per-request league
  (`_latest_league` = newest row across ALL leagues); league only reaches the system prompt.
- BUG `deploy/deploy.sh:409,432-462` — deploy smoke chats run as owner (user 1) and persist two
  conversations per deploy; prune-to-20 evicts the owner's real history.
- BUG `services/coach/src/demo_policy.py` — Demo Day scripting live in prod (canned answer,
  required-tool contract → 5xx on extra tool, single-chunk retrieval for omen+time-lost queries);
  "DEMO" suggestion card.
- BUG `CoachPanel.tsx:170` — "ITEM" suggestion card sends its placeholder sentence as a paid turn.
- RISK KB corpus hard-coded allowlist (chunks.py:13) last touched 2026-08-02; bow-crafting 0.5,
  creator-videos, community-reddit, rare-item-valuation NOT ingested; all KB stamped Runes of Aldur.
- RISK presentation smoke LLM-nondeterministic, 2 paid turns per deploy.
- RISK next 15.5.19 critical advisories; no Dependabot.
- RISK login: no rate limit, `scryptSync` on event loop; 30-day stateless sessions, no revocation
  on logout/password change.
- RISK Caddy: no CSP/frame-ancestors/Referrer-Policy/Permissions-Policy; stray `;` in HSTS.
- RISK DB never VACUUMed (local 208.9 MB, 99% freelist); backups only at deploy, on-box, unpruned;
  releases never pruned → disk-full risk.
- RISK deploy gate requires Coach market_ready while poller is stopped → any stale-market moment
  blocks UI-only deploys.
- RISK observability journalctl-only; no subsystem heartbeat / owner health panel.
- RISK Coach `store=True` 30-day OpenAI retention; no token/cost accounting; in-memory Qdrant
  re-embeds whole corpus on first request after restart.
- WEAKNESS Coach health checked once per mount; triple disclaimer + evidence open by default;
  onboarding stale (3 areas, no Coach step); HuntPanel polls 3s/5s vs 30s scans; alerts fetched
  twice; alert fatigue (672 alerts / 11 days / 2 users, no per-type mute).
- STANDARD 3 files >500 lines (queries.ts 638, HuntPanel 609, FlipDetailCard 512); 40 TS
  functions >60 lines (FlipDetailCard 380, CraftSessionInline 353, DiscoverTable 337…); 20 silent
  `.catch(() => {})` invisible to lintPolicy.
- SIMPLIFY dead coach paths (double inspect_input, `_add_prior_cited_sources` unreachable, stale
  league_name default); node-notifier no-op on server + vulnerable uuid.

## Top 5 fixes

1. League-scope Coach market tools (S).
2. Delete demo scripting; deterministic deploy smoke as a dedicated smoke user (M).
3. KB freshness: directory corpus + patch-stamped manifest + CI staleness gate (M).
4. Security batch: npm audit fix, Dependabot, login rate limit + async scrypt, session_version,
   Caddy headers (S–M).
5. Ops batch: nightly off-box backup, monthly VACUUM, release/backup pruning, subsystem heartbeat
   table (M).

## Roadmap check

Handoff #2 (Coach tools over real engines + KB repair) before #1 (entity hover cards); both after
the league bug.

## New feature ideas

Coach tools over real engines (get_top_flips / get_craft_margins / get_farm_advice /
get_snipe_report) (M) · owner System Health panel (M) · Discord/ntfy webhook channel (S–M) · daily
digest (M) · KB pipeline + staleness gate (S–M) · Coach cost/latency telemetry (S) · alert center
redesign with per-type mute (M) · persistent embedding cache + warmup (S).
