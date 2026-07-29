# Internal Coach service

Python/LangGraph sidecar used only through the authenticated Next.js `/api/coach/*` proxy.

- Reads the root `data/poe2flip.db` in SQLite read-only mode.
- Builds RAG directly from an explicit allowlist under `docs/kb/` and `docs/research/`.
- Stores thread checkpoints in `data/coach-checkpoints.db`.
- Does not expose or use `POESESSID` and cannot perform in-game actions.

Add `OPENAI_API_KEY` to the root `.env.local`; `TAVILY_API_KEY` is optional and only enables
recent web search. `npm run dev` starts this service together with Next.js and the poller.

Production runs exactly one Uvicorn worker bound to `127.0.0.1:8000`; the in-memory Qdrant index
must not be split across processes. See `deploy/poe2flip-coach.service` and `deploy/README.md`.
