# PoE2 Knowledge Base

Per-domain, source-cited, patch-stamped mechanics knowledge for Path of Exile 2. This is the
corpus the craft recipes/guides cite — and the retrieval base for the planned LLM craft agent.

## Structure

```
docs/kb/
├── README.md                    # this file — the update loop
├── desecration-abyss.md         # bones, Well of Souls, boss mod pools, omens
├── breach.md                    # catalysts, breach rings, Chayula
├── delirium.md                  # liquid emotions, instilling, fog farming
├── expedition-ritual.md         # logbooks/vendors, tribute/omens — the money machines
├── currency-core.md             # currency matrix, floors, essences, fluxes, vaal, runes
├── atlas-juicing.md             # waystones, tablets, towers, juice economics
├── economy-meta.md              # inflation, mirror services, creator crafts
├── league-mechanics-misc.md     # everything else a daily player knows
├── community-reddit.md          # reddit-mined tricks + open-question answers (Brave MCP round)
├── creator-videos.md            # 20 mined creator transcripts: recipes, strategies, warnings
└── sources/transcripts/         # raw video transcripts (user-supplied), one file per video
docs/research/
└── poe2-crafting-knowledge.md   # the cross-domain verified core (currency floors etc.)
```

## Conventions

- Every file carries a **patch stamp** (`0.5.x`) and a **built/updated date** at the top.
- Every fact is tagged **[CONFIRMED]** (2+ independent sources), **[single-source]**, or
  **[unverified]**, with source URLs inline.
- Each domain file ends with `## Wallet warnings`, `## Profit angles`, `## Open questions` —
  the tool mines warnings from the first, recipes from the second, research tasks from the third.
- Corrections from adversarial verification are applied in place; refuted claims are kept in a
  `## Refuted` block (so they don't get re-added by the next research round).

## Update loop (the "autonomous" part)

1. **Per league / patch**: re-run the KB build workflow (research + adversarial verify per
   domain) — the workflow script lives in the session workflow registry; the invocation is
   documented in the repo history (`poe2-kb-build`). Every entry gets a fresh patch stamp.
2. **Weekly during a league**: refresh `economy-meta.md` (prices/strategies drift fastest) and
   fold in new creator videos — paste transcripts into `docs/kb/sources/transcripts/` and ask
   the assistant to mine them into the domain files.
3. **On demand**: any in-game "burn" (failed currency application, unexpected mechanic) gets
   written into the matching domain file's Wallet warnings the same day — live play is the
   highest-grade source we have.
4. **Deterministic data** (mod tiers per base, ilvl gates): refresh the committed RePoE snapshot
   with `npm run sync:poe2-data`; never rebuild the database from a page allowlist.

## Feeding the LLM agent (Phase 5)

The files are deliberately structured for RAG: one domain per file, atomic tagged facts,
stable headings. The planned craft agent (Vercel AI SDK, course method: RAG → agentic →
memory → eval) chunks these by heading, embeds, and cites the `[CONFIRMED]` tags + sources in
its answers. Wallet warnings become tool-side guardrails (hard prompts before currency-spend
suggestions).
