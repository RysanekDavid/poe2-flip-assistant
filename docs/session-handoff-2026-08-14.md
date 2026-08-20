# PoE2 Coach session handoff — 2026-08-14

This document is the operational handoff for the next coding assistant. It records the current
product intent, confirmed architectural decisions, local worktree state, production incident
history, work in progress, and the ordered next-task checklist.

Do not treat older chat exports or the root `CLAUDE.md` as current specifications. The root
`CLAUDE.md` is explicitly an obsolete bootstrap document. Read this file together with
`README.md`, `deploy/README.md`, current code/tests, and
`docs/architecture/poe2-knowledge-platform-plan.md`.

## Start here
Repository: `C:\Git\POE_tradechecker`
Current checked-out branch and base at handoff time:

```text
branch: master
HEAD:   dfe8081853dad8bed5bddb50879ef5563510905e
origin/master: dfe8081853dad8bed5bddb50879ef5563510905e
```

The worktree is intentionally dirty. It contains substantial uncommitted work. Do not reset,
checkout, clean, or bulk-stage it. The sandbox could not create a Git branch because `.git` was
read-only to the coding process. Before committing, the human should create a feature branch, then
stage only reviewed files. Never push directly to `master`.

The user wants direct, critical engineering rather than demo-only patches. The certification demo
has already been submitted; production quality now takes priority over preserving certification
shortcuts.

## Product definition
PoE2 Coach is a read-only decision-support application for Path of Exile 2, an online action RPG
with a player-driven economy and complex, patch-sensitive crafting/endgame systems.

Target users are not only endgame traders. They include:
- new players who do not know where the game explains crafting, farming, item, or atlas mechanics;
- intermediate players learning legal and useful craft paths;
- experienced economy players comparing flip, farm, craft, or hold decisions.

Core positioning:
```text
Market data finds an opportunity.
The knowledge layer explains it.
The player decides.
```

The product must never claim guaranteed profit, a guaranteed sale price, or guaranteed Divine per
hour. It must never trade, whisper, click, or control gameplay. Observed market data, modeled
expected value, source evidence, freshness, uncertainty, and the human-verification boundary must
remain visible.

## Current stack and production shape
- Next.js 15 / React 19 / TypeScript.
- SQLite through `better-sqlite3` for users, product data, market history, and the new public chat
  history.
- Node poller for poe.ninja, trade2, patch monitoring, and other scheduled observations.
- Python 3.13 FastAPI + LangGraph Coach sidecar.
- OpenAI Responses API through `langchain-openai`; configured release model is currently
  `gpt-5.4-mini`.
- Optional Tavily recent-web tool.
- Caddy is the public HTTPS boundary; Next and Coach bind to loopback.
- Production uses atomic release directories, `/opt/poe2flip/current`, systemd units
  `poe2flip-web`, `poe2flip-poller`, and `poe2flip-coach`.

Release latency policy in `deploy/runtime-timeouts.env`:
```text
CHAT_MODEL=gpt-5.4-mini
COACH_MODEL_TIMEOUT_SECONDS=45
COACH_TOTAL_TIMEOUT_SECONDS=140
COACH_MAX_TOOL_ROUNDS=2
COACH_TIMEOUT_MS=160000
```

Do not raise these limits again as a first response to failures. Earlier failures had specific
root causes, and increasing timeouts hid them.

## Production incident history and actual root causes
The Coach previously appeared healthy while `/chat` still failed. `/health` only proved local data
and configuration readiness; it did not execute the model/tool path.

Confirmed incidents included:
1. `gpt-5.4` with function tools and `reasoning_effort` on Chat Completions was rejected. The
   implementation moved to the Responses API.
2. Market readiness used an expensive aggregation and delayed/failed deployment health checks.
3. `lookup_poe2_game_data` accepted model-provided `limit` outside 1–10 and threw `ValueError`,
   aborting the whole LangGraph turn.
4. Required demo tool-trace validation incorrectly expected an exact empty set and rejected valid
   `lookup_poe2_game_data` + `retrieve_knowledge` calls.
5. `gpt-5.4` calls exceeded the proxy/backend latency budget. Raising limits did not solve all
   failures.
6. The generic `ToolNode(handle_tool_errors=False)` made normal no-result/invalid-input/source
   failures fatal.
7. All proxied users shared one FastAPI rate bucket because `request.client.host` was always the
   local Next.js proxy.
8. Concurrent requests for one conversation could race on the same checkpoint; one failure could
   delete state while another request used it.

The generic browser message `Chat service is temporarily unavailable; check server logs.` erased
the distinction between these cases. That behavior has been replaced locally by typed correlated
errors.

## Stream A — Coach reliability slice
Status: implemented locally, fully tested, and given final adversarial verdict **SHIP**. It has not
been committed or deployed from this worktree.

Implemented behavior:
- one opaque request ID from Next.js through FastAPI, model/tool/request logs, response contract,
  and browser error UI;
- HMAC-signed opaque per-user actor token for FastAPI rate limiting;
- production fails closed on missing/invalid proxy identity or request ID;
- typed public error taxonomy in Python and Zod;
- expected tool failures become safe `ToolMessage(status="error")` results;
- unexpected programming/contract errors remain loud 5xx and are non-retryable;
- explicit `ToolInvalidInput`, `ToolNoResult`, and `ToolSourceUnavailable` types;
- tool-call schema validation is separated from tool-body failures, so a body `ValueError` is not
  silently masked;
- malformed Tavily/provider results are source failures, not invalid model input;
- SQLite transient source failures use primary `sqlite_errorcode & 0xFF`; SQL defects such as
  `no such column` remain loud;
- per-tool privacy-safe timing logs: request ID, tool name, duration, outcome, exception class;
  never prompt, thread ID, actor, tool args, credentials, or exception message;
- fail-fast per-conversation lease: a second request receives correlated `409 thread_busy` rather
  than waiting behind a 140-second inference;
- different conversations can still run concurrently;
- retry preserves the failed prompt and never duplicates the user bubble;
- the earlier checkpoint implementation used cancellation-resistant cleanup and quarantine on
  cleanup failure. The history cutover below is intentionally removing persistent checkpoints.

Reliability files include:
- `services/coach/src/errors.py`
- `services/coach/src/request_auth.py`
- `services/coach/src/thread_locks.py`
- `services/coach/src/tool_execution.py`
- `services/coach/src/failure_handling.py`
- `services/coach/tests/test_reliability_api.py`
- `services/coach/tests/test_request_auth.py`
- `services/coach/tests/test_tool_execution.py`
- `services/coach/tests/test_tool_sources.py`
- `src/lib/coachContract.ts`
- `src/lib/coachServer.ts`
- `src/app/api/coach/chat/route.ts`
- `src/components/coach/api.ts`
- `src/components/coach/useCoachSession.ts`
- `src/components/coach/coachSessionState.ts`

Last validation before the history cutover began:
- Python: 116 passed;
- reviewer-focused Python: 49 passed;
- `ruff check .`: passed;
- TypeScript typecheck, lint, Coach contract tests, deploy-config tests, and Next production build:
  passed;
- `git diff --check`: passed.

Non-blocking reliability note: the in-process quarantine set was unbounded and process-local. The
new stateless history architecture removes checkpoint quarantine as a long-term mechanism.

## Stream B — persisted public Coach history
Status: actively implemented locally at handoff time. Do not call it complete until the final test
matrix and adversarial review finish.

Product limits and privacy rules:
- keep the 20 most recent conversations per authenticated user;
- keep at most 50 completed turns per conversation (100 public messages);
- store a completed turn atomically: user prompt + final assistant answer + sources + tools +
  processors;
- never persist chain-of-thought/reasoning, AI tool calls, raw tool arguments, raw tool results, or
  failed partial turns;
- deterministic title from the first successful prompt: collapse whitespace, maximum 64 Unicode
  code points, then 63 code points plus `…` if truncated;
- every query must be scoped by authenticated `user_id`; foreign and missing resources return 404;
- strict Zod validation on JSON writes and reads; corrupted metadata fails loudly.

Canonical tables added to the main app SQLite schema:

- `coach_conversations`
- `coach_turns`
- `coach_conversation_leases`

Important lease decision: the lease table references `users`, not a conversation row, because a
new chat must not create an empty conversation before its first successful turn.

Idempotency contract:
- browser creates a stable `turnId` UUID for the prompt and reuses it for retry;
- same `(user, conversation, turnId)` and same prompt replays the stored result without another
  OpenAI call;
- same turn ID with different prompt is an idempotency conflict;
- a different active turn in one conversation is `conversation_busy`;
- stale `expectedTurnCount` is rejected;
- an expired DB lease can be recovered;
- the 50th turn succeeds; the 51st returns `conversation_full`;
- after completion, pruning leaves exactly 20 most recent conversations and does not delete a chat
  with an active lease.

History API target:
```text
GET    /api/coach/conversations
GET    /api/coach/conversations/:conversationId
PATCH  /api/coach/conversations/:conversationId
DELETE /api/coach/conversations/:conversationId
POST   /api/coach/chat
```

The chat request contains `conversationId`, stable `turnId`, `expectedTurnCount`, and `message`.
The response includes `turnId`, new `turnCount`, `replayed`, request ID, answer, tools, processors,
and sources.

Memory model:

- main app SQLite is the only canonical public conversation store;
- Next.js loads the last seven committed turns server-side;
- browser history is never trusted or forwarded as model context;
- FastAPI accepts at most 14 history messages with exact user/assistant alternation;
- the current prompt is appended as the final `HumanMessage`;
- sources/tool metadata are not sent back into model context;
- LangGraph is compiled statelessly; the long-lived `coach-checkpoints.db` dependency is removed.

UI target implemented/in progress:

- desktop sidebar and mobile drawer;
- load list on mount and restore newest conversation;
- local empty New Chat without a DB row;
- open, inline rename, delete with confirmation;
- restore answer sources/tools/processors after reload;
- stable turn retry and `${turnId}:role` deduplication;
- disable unsafe conversation actions while a turn is active;
- `conversation_full` offers continuation in a new chat instead of silent truncation.

New history files include:

- `src/db/coachHistoryQueries.ts`
- `src/lib/coachHistoryContract.ts`
- `src/app/api/coach/conversations/route.ts`
- `src/app/api/coach/conversations/[conversationId]/route.ts`
- `src/components/coach/CoachHistorySidebar.tsx`
- `src/scripts/testCoachHistory.ts`

Latest independently confirmed history-cutover state:

- schema/query/contract acceptance tests passed;
- `testCoachHistory.ts` passed atomic first success, no partial row on failure, replay/conflicts,
  stale/busy/expiry, last-seven history, 50/51 limit, pruning, cascade, ownership, corrupt JSON, and
  title/emoji behavior;
- full stateless Python Coach suite: 117 passed, with only the existing Starlette/httpx
  deprecation warning;
- UI/sidebar wiring compiled with `npm run typecheck`;
- `npm run test:coach` passed both the Coach contracts and persisted-history suites;
- persistent checkpointer runtime/dependency/config/deploy backup references were removed locally;
- lint, deploy-config, production build, final diff audit, and adversarial history review remain to
  be rerun after the latest cutover changes.

## Stream C — patch and data-source foundation

Status: pre-existing dirty work, separate from the reliability/history slice. Preserve it and do not
casually mix its claims into a reliability commit.

`docs/architecture/poe2-knowledge-platform-plan.md` says Phase 1 foundation is implemented:

- source registry and immutable content-addressed snapshots;
- allowlisted official GGG patch-note ingestion;
- parser/policy identity, conditional requests, raw gzip artifacts;
- explicit patch review workflow that fails closed for recommendations;
- patch readiness in Coach health and visible UI warning.

Not yet implemented:

- canonical cross-source entity IDs and aliases;
- typed mechanic claims and patch-impact mapping;
- deterministic crafting state transitions and probability provenance;
- permitted build-demand ingestion and measured farming strategies;
- typed craft/farm/build tools for the Coach.

Relevant untracked/dirty files include `src/sources/`, patch scripts, source migrations/queries,
`services/coach/src/patch_readiness.py`, `src/data/poe2/patch-coverage.json`, architecture/research
docs, and deployment changes. Audit and commit this stream separately unless a single atomic
release genuinely requires overlap.

## Data-source decisions that must be preserved

Use **official first, community-backed where necessary, provenance on every fact**.

Authority order:

1. official GGG patch notes and documented APIs/exports;
2. versioned RePoE snapshots for deterministic data-mined game facts;
3. targeted, reviewed PoE2DB tables only for concrete gaps;
4. poe.ninja, poe2scout, and bounded trade2 data as observations, never mechanic truth;
5. curated guides/transcripts for explanations and candidate strategies, with source/date/timestamp;
6. unverified community claims only for discovery until reviewed.

Critical facts:

- poe.ninja is not official;
- its build/profile endpoints are internal and must not become a scheduled dependency;
- the PoEDB Developer API page is a directory of Path of Exile resources, not a bulk PoEDB data
  download API;
- do not recursively mirror PoE2DB; use allowlisted page-family importers with cache, parser
  fixtures, provenance, rate limits, and licensing review;
- official GGG Currency Exchange history can replace part of poe.ninja history/liquidity after a
  measured shadow run, but not current listings, uniques, rares, or complete static data;
- observations must never overwrite game facts;
- names are presentation data, not canonical identity keys.

Read:

- `docs/architecture/poe2-knowledge-platform-plan.md`
- `docs/research/poe2-data-source-strategy.md`
- `docs/research/poe2-crafting-knowledge.md`
- `docs/research/rare-item-valuation.md`

## Immediate checklist for the next assistant

Continue the history cutover before starting another feature.

1. Get the precise final status from the active implementation or inspect current files/tests.
2. Run the focused history tests and Python history validation tests.
3. Run the full matrix:

   ```powershell
   npm.cmd run typecheck
   npm.cmd run lint
   npm.cmd run test:coach
   npm.cmd run test:deploy-config
   npm.cmd run build
   uv --cache-dir services/coach/.uv-cache --directory services/coach run pytest
   uv --cache-dir services/coach/.uv-cache --directory services/coach run ruff check .
   git -c safe.directory=C:/Git/POE_tradechecker diff --check
   ```

4. Confirm there is no live OpenAI call in tests.
5. Confirm all touched source files are at most 500 lines and functions at most 60 lines.
6. Manually audit these invariants:

   - no partial user-only stored turn after upstream failure;
   - DB lease always released on every failure/cancellation path;
   - lost-response retry returns the committed turn and does not call Coach again;
   - browser cannot inject model history;
   - all CRUD and chat persistence queries include `user_id`;
   - foreign conversation IDs do not disclose existence;
   - first successful turn creates the conversation; New Chat alone does not;
   - retry keeps the same public conversation and turn ID;
   - no checkpoint database is created or required;
   - secrets, prompts, answers, raw tool data, and account identifiers are absent from logs;
   - pruning cannot remove an active leased conversation.

7. Spawn an adversarial read-only reviewer for the complete history diff. Require `SHIP`; feed all
   blocking findings back into implementation and rerun the matrix.
8. Only after review, have the human create a feature branch. Suggested name:

   ```powershell
   git switch -c fix/coach-reliability-and-history
   ```

9. Inspect staging carefully because the worktree contains unrelated pre-existing changes. Do not
   use `git add .`.
10. Create a conventional commit/PR only after deciding whether patch-source work belongs in the
    same atomic deployment. Prefer separate commits/PRs if it does not.

## Deployment checklist after merge

Do not assume local work is deployed. Re-check production state first:

```bash
cat /opt/poe2flip/.deployed-revision
readlink -f /opt/poe2flip/current
systemctl is-active poe2flip-web
systemctl is-active poe2flip-poller
systemctl is-active poe2flip-coach
curl --fail --silent --show-error http://127.0.0.1:8000/health
```

Required private configuration for the reviewed reliability boundary:

- one strong `COACH_PROXY_SECRET` in both `/opt/poe2flip/.env.local` and
  `/opt/poe2flip/.coach.env`;
- values must match; deploy intentionally fails before stopping services if missing/different;
- never print the secret.

The history cutover removes the active checkpoint DB requirement. Verify deployment scripts and
docs no longer demand or back up `COACH_CHECKPOINT_DB_PATH`.

After deployment:

1. verify the deployed SHA and `current` symlink;
2. verify health and public login;
3. create a new chat and complete one turn;
4. refresh and confirm messages, sources, and title restore;
5. rename and delete a chat;
6. retry a controlled transient failure and confirm no duplicate bubble/turn;
7. open two tabs and confirm one same-chat request gets fast `409`, not a long timeout;
8. inspect correlated logs by request ID without printing prompt content;
9. verify poller and patch monitoring continue normally;
10. verify database backup/rollback includes the main app DB containing public chat history and no
    active checkpoint DB dependency.

If production chat fails, collect an explicit time window rather than “15 minutes ago” when the
failure occurred the previous day:

```bash
journalctl -u poe2flip-coach -u poe2flip-web \
  --since "YYYY-MM-DD HH:MM:SS" --until "YYYY-MM-DD HH:MM:SS" \
  --no-pager -n 1000
```

Use the browser's short request reference to find matching `coach_timing`, `coach_tool`, and proxy
records. Do not diagnose from `/health` alone.

## Product roadmap after history ships

### 1. Canonical entity identity before item hover UI

The user wants item names/currency such as Liquid Potent in Coach answers to be hoverable with an
item card. Do not regex arbitrary model prose by display name.

First implement:

- canonical `game_entity` IDs and `entity_alias` records;
- server-produced typed entity annotations in the Coach response;
- a lazy deterministic item-summary endpoint by canonical ID;
- markdown rendering for typed entity nodes;
- accessible hover/focus cards with icon, type, description, patch/data version, source, and market
  observation clearly separated.

### 2. Make Coach answers materially specific

The Coach is currently more general than the standalone product panels because it cannot call all
deterministic engines and the curated knowledge is incomplete.

Next integrations:

- expose existing curated craft recipes and craft-margin outputs as narrow typed tools;
- expose FarmAdvisor basket scoring with honest “market interest,” not invented Div/hour;
- repair knowledge source URLs/date/video timestamp metadata;
- add typed crafting state transitions and legal-action validation;
- represent unknown hit rates as break-even thresholds, not fabricated probabilities;
- add query-specific evals for item crafts, tablets, waystones, lineage/atlas strategies, and
  patch-sensitive mechanics.

### 3. Official character/profile integration

The user wants poe.ninja-like character view, equipment, stats, and passive tree.

Do an official GGG API/scopes spike first. Do not reuse stored `POESESSID` as if it were OAuth.

Separate phases:

1. OAuth/token/scopes/revocation security migration;
2. official account/character list and equipment snapshots;
3. versioned static passive-tree graph from official export;
4. per-character allocated-node state;
5. raw official equipment/character facts in UI;
6. partial derived stats with formula version and provenance.

Do not promise parity with the in-game character sheet until conditional buffs, skills/supports,
passives, formulas, and tests are complete. Keep personal character data out of Coach context by
default; require explicit consent/tool invocation and pass only the minimal payload.

### 4. Market/data pipeline improvement

- implement official GGG hourly Currency Exchange ingestion in shadow mode;
- map internal item IDs through pinned RePoE;
- retain raw hash/artifact and normalized records atomically;
- compare coverage/ratio/volume against poe.ninja for at least seven days;
- only then cut historical trend/liquidity scoring over source by source;
- retain labelled fallbacks where the official endpoint has no equivalent.

## Known limitations and non-goals

- Current runtime uses one Uvicorn worker. In-memory FastAPI rate limiting and per-process
  conversation leases assume that. The new SQLite DB lease is the cross-Next-process authority.
- `/health` remains readiness-only and does not make a paid live model call.
- Do not add a live OpenAI call to normal unit/deploy tests.
- The public certification/evaluation repository is a separate frozen artifact. Its eval numbers
  must not be claimed as production-app evaluation.
- Demo Day submission is finished. Do not optimize product behavior merely to reproduce the old
  demo script.
- Do not implement gameplay automation, guaranteed profit, or unsourced crafting probabilities.

## Security action

An OpenAI API key was visible in an earlier terminal transcript. Do not copy it into this document,
logs, commits, issues, or prompts. If it has not already been revoked, rotate it immediately and
update only the private local/server environment files. Also inspect Git history and public
artifacts for accidental secret inclusion.

## Working conventions for the next assistant

- Be direct; do not paper over failures with generic retries or larger timeouts.
- Fail loudly on corrupt contracts/data and contain only explicitly expected domain/source errors.
- Preserve unrelated dirty work.
- Use targeted patches, not whole-file rewrites.
- TypeScript: no `any`; Zod at runtime boundaries; functional React; named exports.
- Maximum 500 lines per file and 60 lines per function.
- Run lint and tests before declaring completion.
- Use `gh` for PR operations and conventional commit names.
- Do not push to `master` and do not deploy without explicit authorization.
