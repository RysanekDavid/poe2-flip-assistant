# AGENTS.md — PoE2 Coach

This is the working contract for coding agents and contributors. `README.md` covers the product,
`deploy/README.md` covers the server, and `docs/kb/README.md` covers the knowledge base. The root
`CLAUDE.md` is an obsolete bootstrap transcript: don't take units, endpoints or architecture from it.

## Stack

- **Web + API:** Next.js 15 (App Router), React 19, TypeScript, Tailwind. Node ≥ 20.18.1.
- **Data:** SQLite via better-sqlite3 (shared market data plus per-user data). zod validates at
  every boundary.
- **Poller:** a long-running Node process (`src/scheduler/poller.ts`) that reads poe.ninja,
  poe2scout, GGG's Currency Exchange digest and trade2 (read-only).
- **Coach:** a Python 3.13 FastAPI + LangGraph sidecar in `services/coach`, managed with `uv`,
  linted with `ruff`, tested with `pytest`. It uses OpenAI, with Tavily as an optional extra.
- **Prod:** one Hetzner box, systemd units, Caddy TLS in front, atomic `releases/` + `current`
  symlink.

## Commands

| Task | Command |
|---|---|
| Install | `npm ci` · `uv --cache-dir services/coach/.uv-cache --directory services/coach sync --locked` |
| DB schema | `npm run db:migrate` |
| Dev (web + poller + Coach) | `npm run dev` (or `dev:web` / `dev:poll` / `dev:coach`) |
| Build | `npm run build`. Run it before `typecheck`, because it generates `next-env.d.ts` |
| Typecheck | `npm run typecheck` |
| Lint (policy ratchet) | `LINT_BASE_REF=origin/master npm run lint` |
| KB freshness gate | `npm run kb:check` |
| Coach tests / lint | `COACH_DISABLE_DOTENV=1 uv --directory services/coach run pytest` · `uv --directory services/coach run ruff check .` |
| Game-data sync | `npm run sync:poe2-data` → `npm run verify:poe2-data` → `npm run build:craft-catalog` → `npm run build:regex-data` → `npm run sync:entities` |
| Recipe audit | `npm run craft:audit-recipes`, then commit `src/data/poe2/craft/recipe-audit.json` |
| Patch notes | `npm run patch:sync` · `patch:review` · `patch:summarize` |

CI (`.github/workflows/deploy.yml`) runs the following. Run every one of them before you call a
change done:

```bash
npm run build && npm run typecheck && LINT_BASE_REF=origin/master npm run lint
npm run test:coach && npm run test:deploy-config && npm run test:league
npm run test:user-league && npm run test:market-league && npm run test:rates && npm run test:cx
npm run test:flips && npm run test:middleware && npm run test:auth && npm run test:maintenance
npm run test:valuation && npm run test:auto-snipe && npm run test:snipe && npm run test:system
npm run test:notify && npm run test:features-schema && npm run test:patch && npm run kb:check
npm run test:craft && npm run test:craft-provenance && npm run test:tools
npm run test:strategies && npm run test:learn && npm run test:demo-user
uv --directory services/coach run pytest && uv --directory services/coach run ruff check .
```

The lint is a ratchet (`src/scripts/lintPolicy.ts`). It diffs each `src/` file against
`LINT_BASE_REF`, or against the merge-base with `origin/master` when that is unset, and fails on
new size debt, explicit `any`, silent catches, low-contrast text or text below 12px.

## Architecture map

- `src/app/` — pages and `app/api/*` route handlers. `src/middleware.ts` enforces authentication
  and the Origin check on mutations.
- `src/components/` — tab panels (`exchange`, `market`, `craft`, `farm`, `learn`, `tools`,
  `wealth`, `coach`, …), the shell (`shell/tabRegistry.ts`, nav modes) and the UI kit in `ui/`
  (`Panel`, `DataTable`, `ItemArt`, `ClaimBadge`, `PriceChip`, …).
- `src/core/` — pure engines: rates, flips/CX, snipe and valuation, craft recipes/EV/provenance,
  farm strategies, learn lookup, alert engine, tools.
- `src/api/` — external clients: `ninjaClient`, `scoutClient`, `cxClient`, `tradeClient` +
  `tradeRateLimit`/`tradeMeter` (trade2 budget), and `tradeMeta`.
- `src/db/` — schema, migrations and typed queries. Market tables are league-scoped and user
  tables are scoped by `user_id`.
- `src/scheduler/` — poller loops: the market cycle, trade scans, the league watcher, the scout
  values loop, the unique trade-values loop (trade2 prices for boss uniques scout leaves unpriced)
  and the balance loop.
- `src/auth/` — scrypt + HMAC sessions and per-user POESESSID encryption (`secretbox`).
- `src/config/env.ts` — the only place env vars are read.
- `src/data/poe2/` — committed, integrity-checked artifacts: the RePoE snapshot (`repoe/`), the
  entity catalog (`entities.json.gz`), the craft catalog and recipe audit (`craft/`), regex pools,
  strategies, learn data and boss loot. Regenerate them with the sync scripts and never hand-edit
  them (see `src/data/poe2/README.md`).
- `services/coach/` — the read-only Coach. It gets the league from the Next proxy, reads SQLite
  read-only, loads the RePoE and entity catalogs, runs RAG over `docs/kb/manifest.json` only, and
  holds no product decryption key.
- `docs/kb/` — the curated, patch-stamped mechanics KB. `docs/research/` holds audits and
  research notes, which are ingested only when the manifest lists them.
- `deploy/` — `deploy.sh`, systemd units, the Caddyfile and env examples.

## Conventions

- **Size:** at most 500 lines per file and 60 lines per function. Split before you cross either.
- **TypeScript:** no `any` (use `unknown` and narrow), named exports, and zod for every external
  or untrusted input (HTTP bodies, third-party APIs, data files). Use `const` arrays or
  discriminated unions instead of enums.
- **Fail loudly:** no empty or silent catches. Missing config throws with a reason, and a bad
  data artifact stops the service rather than degrading silently.
- **Comments** explain why, not what. Delete stale ones.
- **UI tokens** (`tailwind.config.ts`): dark theme only. Text is never below 12px. Use a single
  amber `accent` (`#fbbf24`) so that highlighted always means the same thing; sky/`info` is for
  links only. Don't use `text-neutral-600/700` on the page background (it fails AA contrast).
  The `brand` tokens (`brand-teal`, `brand-teal-hi`, `brand-bone`) and the Rubik font belong to
  the logo and wordmark (`shell/Brand.tsx`). The one other use is the nav label colour in
  `shell/TabNav.tsx` and `shell/SubTabBar.tsx` (bone at 60% idle, 100% active), so the header
  speaks the owl's palette. They are a separate brand set, not UI accents, so never use them for
  actions, highlights or data.
  Prefer game art (`ItemArt`, icons from the entity catalog) and tooltips over prose or status
  noise.
- **Units:** poe.ninja `primaryValue` is the **Divine price of one item**. Never invert it. The
  legacy `chaos_equiv` columns also hold Divine.
- **trade2 is read-only and budgeted:** search and fetch only, never buy, whisper, click or
  automate the game. All calls go through `tradeRateLimit` (it paces to GGG's published rules)
  and `tradeMeter` (per-consumer budgets). Don't add a caller that bypasses them.
- **Request headers:** identify the tool honestly. The User-Agent is the tool name plus
  `DATA_SOURCE_CONTACT`, which must be an operator or role contact. Don't spoof a browser UA, and
  never put a personal email, account name or any other personal data into request headers or
  logs. POESESSID travels only as the user's own cookie to trade2.
- **Security:** authentication is mandatory for every page and API. POESESSID is per-user and
  encrypted at rest. The Coach never sees credentials. Only Caddy listens publicly.
- **Git:** use conventional commits (`type(scope): summary`). Branch and open a PR; never push
  to `master`. Don't add `Co-Authored-By` or other trailers. Never commit `.env*`, credentials,
  databases or uploaded screenshots with account data.

## Deploy

- A merge to `master` runs `.github/workflows/deploy.yml`. The `checks` job must pass, then the
  `deploy` job SSHes to the box. That key is limited to a forced command that runs `deploy.sh`,
  which builds a new release, backs up the DB, switches `current` and health-checks, rolling back
  on failure.
- **Required env** (`.env.local` on the box):
  - `AUTH_SECRET` and `SECRET_KEY`. Never rotate these casually: rotating `SECRET_KEY` makes the
    stored POESESSIDs undecryptable.
  - `APP_ORIGIN`.
  - `DATA_SOURCE_CONTACT`: trade2 data requests and the patch watcher refuse to run without it,
    and the deploy preflight rejects a blank value.
  - `OWNER_PASSWORD`, only to seed an empty database.

  The Coach reads its own allowlisted `.coach.env`. Timeouts live in
  `deploy/runtime-timeouts.env`, not in the private env files.
- Game data is committed, never downloaded at deploy time: a missing or corrupt snapshot fails the
  Coach health check and the deploy rolls back.

## Knowledge base and claim policy

- The Coach ingests only `docs/kb/manifest.json`. Each entry carries `patch`, `league`,
  `stamped_at` and an LF-normalised `sha256`. `npm run kb:check` fails on any edit made without
  re-stamping.
- **A stamp is a verification claim.** Move `patch`/`league` only after re-checking the whole
  file. A partial fix updates only `sha256` + `stamped_at` and adds a dated "Corrections" line
  under the patch stamp. Never bulk re-stamp.
- Tag every KB fact `[verified-primary]` (poe2db, RePoE or GGG text, quoted, with URL and access
  date), `[CONFIRMED]` (two or more sources), `[single-source]`, `[unverified]` or `[cf]` (both
  sides quoted, winner named; datamine and official text beat guides).
- Fix a refuted claim **in the body** in the same change, and log it under
  `## Adversarial verification (post-research)`. The log is never ingested.
- UI data (strategies, the Learn primer, the craft provenance) uses the same grades through
  `src/lib/claim.ts` (`vp`/`vs`/`ss`/`uv`/`cf`/`syn`) and shows them with `ClaimBadge`.
- Check game mechanics against the entity catalog and RePoE snapshot plus poe2db and the patch
  notes before writing them down. Don't ask the owner something the data can answer.
