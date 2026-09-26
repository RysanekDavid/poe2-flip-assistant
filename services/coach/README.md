# Internal Coach service

Python/LangGraph sidecar used only through the authenticated Next.js `/api/coach/*` proxy.

- Reads the root `data/poe2flip.db` in SQLite read-only mode.
- Loads the integrity-checked, versioned RePoE catalog from `src/data/poe2/repoe/` for exact base,
  modifier, tier, affix-side, implicit, skill, and special-outcome inspection.
- Builds RAG only from the files listed in `docs/kb/manifest.json`, each stamped with the patch,
  league and date it was verified against. Every chunk and citation carries that stamp.
  `npm run kb:check` (CI) fails when a listed file is missing, edited after its stamp (content
  hash mismatch), or when a new `docs/kb/*.md` page is neither ingested nor explicitly excluded.
- Scopes every market tool to the asking user's league (sent by the Next.js proxy and injected
  server-side; the model cannot choose it). A league without collected data is reported as such,
  never answered from another league. Direct callers without a league fall back to the web app's
  default chain: runtime `app_settings.league`, then `LEAGUE_NAME`, then the app's built-in default.
- Exposes the app's own engines as read-only tools, each answering from what the Node app
  persisted rather than re-deriving it: `get_top_flips` (edges the rank gate published into
  `cx_edge_outcomes`, with the gate's stored persistence and slower-leg Div/h, ordered by
  edge % rather than the Top Flips tab's score), `get_craft_margins` (`craft_margin_reports`;
  failed, stale and unreadable reports are excluded and counted, the rest are gated like the
  Craft tab), `get_snipe_report` (`autosnipe_report`, only when the league stamped into the
  report is the asker's and it is under 3 × `AUTOSNIPE_INTERVAL_MIN` old) and `get_farm_advice`
  (FarmAdvisor's basket heat, recomputed from the same snapshot query because the app never
  stores it). Values the database cannot provide (recipe labels, gate constants, FarmAdvisor
  tables) are mirrored in Python and pinned to the TypeScript by `tests/test_engine_drift.py`.
  Each payload is capped at 4 KB by trimming its lowest-ranked rows. The craft staleness gate
  reads `CRAFT_MARGIN_INTERVAL_MIN` and the snipe gate `AUTOSNIPE_INTERVAL_MIN` (both default
  10, same as the web app); set them in the Coach environment too if the web app overrides them.
- Uses the authenticated application's SQLite history as the only conversational memory.
- Does not expose or use `POESESSID`, receives no product decryption key, and cannot perform
  in-game actions.

Reasoning tool calls use the OpenAI Responses API with `store=true` only to link an active
function call to its output. Each new user turn starts a fresh provider-side chain and replays at
most seven completed turns supplied by the authenticated application. OpenAI response objects are
stored for 30 days by default. Do not paste passwords,
session cookies, API keys, `POESESSID`, or private account data into Coach. See OpenAI's
[data controls](https://developers.openai.com/api/docs/guides/your-data) and
[conversation-state](https://developers.openai.com/api/docs/guides/conversation-state) guidance.

Each provider call has a 45-second timeout with automatic SDK retries disabled. A turn permits at
most two tool rounds and three model calls; after the second tool round the final model call cannot
request more tools. The Coach stops waiting after 140 seconds and returns
HTTP 504 before the authenticated web proxy reaches its 160-second deadline. The deployment probe
allows 180 seconds. Synchronous provider work uses the same 45-second network timeout.

Pasted items are inspected before the model runs. Unknown display lines remain `unmatched`,
multiple equally valid modifier matches remain `ambiguous`, and impossible affix counts mark the
inspection incomplete. In that state the service returns the deterministic inspection boundary
instead of asking the model to invent a crafting sequence. Character requirements are never used
as item level. Multi-line displays belonging to one RePoE modifier ID count as one affix.

RePoE supports identity, affix-side, tier and compatibility lookup. It does not provide complete
spawn weights and is never presented as an exact crafting-probability source.

Coach never reads the product `.env.local`. For local development, copy `.env.example` to a
private file and explicitly set `COACH_ENV_FILE` to that path in the launching shell;
`TAVILY_API_KEY` is optional. In production, systemd supplies only `/opt/poe2flip/.coach.env`
and `COACH_ENV_FILE` is rejected. `npm run dev` starts Coach with Next.js and the poller after
the local opt-in variable is set.

Each completed turn returns content-free usage telemetry (`input_tokens`, `output_tokens`,
`total_tokens`, `model_calls`, `duration_ms`). The web proxy stores it with its own end-to-end
`proxy_duration_ms` in the `coach_usage` table, in the same transaction as the turn. Rows are not
tied to conversations, so pruning or deleting history keeps the cost record. Nothing reads it in
the UI yet.

Input safety runs once, at the HTTP boundary: a rejected message answers `400 request_rejected`
before the agent is built or any model is called. The deploy contract smoke relies on that path,
so `/health` covers what it skips: `agent_ready` builds the graph (model client, strict tool
schemas, compile) without calling a model. Market readiness is split into `market_schema_ready`
(database and tables present; false is a configuration defect) and `market_fresh` (a poll cycle
succeeded in the last 30 minutes; false is operational). `market_ready` remains their conjunction.
The dense knowledge index is built by a background start-up task (`COACH_WARM_KNOWLEDGE_ON_START`,
default on; failures are logged and the first query rebuilds on demand).
Answers carry no appended disclaimer; the UI shows one verify-in-game notice under the composer.

Production runs exactly one Uvicorn worker bound to `127.0.0.1:8000`; the in-memory Qdrant index
must not be split across processes. See `deploy/poe2flip-coach.service` and `deploy/README.md`.
