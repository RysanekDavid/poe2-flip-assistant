# Internal Coach service

Python/LangGraph sidecar used only through the authenticated Next.js `/api/coach/*` proxy.

- Reads the root `data/poe2flip.db` in SQLite read-only mode.
- Loads the integrity-checked, versioned RePoE catalog from `src/data/poe2/repoe/` for exact base,
  modifier, tier, affix-side, implicit, skill, and special-outcome inspection.
- Builds RAG directly from an explicit allowlist under `docs/kb/` and `docs/research/`.
- Stores thread checkpoints in `data/coach-checkpoints.db`.
- Does not expose or use `POESESSID`, receives no product decryption key, and cannot perform
  in-game actions.

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

Production runs exactly one Uvicorn worker bound to `127.0.0.1:8000`; the in-memory Qdrant index
must not be split across processes. See `deploy/poe2flip-coach.service` and `deploy/README.md`.
