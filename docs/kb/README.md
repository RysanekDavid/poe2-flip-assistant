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
  **[unverified]**, with source URLs inline. Two more tags for re-checks:
  - **[verified-primary]** — quoted verbatim from datamined or official text (poe2db, RePoE, GGG
    patch notes), with the URL and the access date. Outranks any number of guides.
  - **[cf]** — sources conflict. Record both values with their sources and name the winner
    (datamine/official beats guides). Never silently overwrite one with the other.
- Each domain file ends with `## Wallet warnings`, `## Profit angles`, `## Open questions` —
  the tool mines warnings from the first, recipes from the second, research tasks from the third.
- Corrections from adversarial verification are applied **in place in the body**; a correction
  that only lands in the log leaves the wrong claim retrievable. See the refuted log below.

## Refuted log

Each domain file ends with `## Adversarial verification (post-research)`: one entry per checked
claim, `- <verdict> — <claim>` followed by indented `→ <evidence> (<urls>)` lines. Verdicts are
`confirmed`, `unverifiable`, `**REFUTED**`, or `overturned (claim stands, <date>)` when a later
re-check proves a refutation wrong.

- The log is history, kept so the next research round doesn't re-add a refuted claim. It is
  **never ingested**: the Coach's chunker (`services/coach/src/retrieval/chunks.py`) drops that
  heading whole, and drops any list item that *starts* with `**REFUTED**` or `[REFUTED]` under any
  other heading. An in-place correction that mentions a refutation mid-sentence is kept.
- Re-checks append a dated `→ <date> re-check: …` line to the entry instead of rewriting it.
- When a log entry refutes something, fix the body in the same change.

## Manifest and freshness gate

`docs/kb/manifest.json` is the only list the Coach ingests. Each `corpus` entry records the
`patch` and `league` its facts were verified against, the `stamped_at` date, and an LF-normalized
`sha256` of the file at stamping time; the stamp travels with every retrieved chunk and citation.
`excluded` lists `docs/kb` pages that are deliberately not player knowledge (this README).
Research or audit notes under `docs/research/` are ingested only when listed.

`npm run kb:check` runs in CI and fails when a listed file is missing, when a file changed after
its stamp, or when a new `docs/kb/*.md` page is not classified. After re-verifying an edited file,
set its `stamped_at` (and `patch`/`league` if they moved) and paste the `sha256` the check prints.

### Stamp policy

- **A stamp is a verification claim.** `patch`/`league` say "every fact in this file was checked
  against this patch"; the Coach relays them with each citation and caveats older stamps.
- **Move `patch`/`league` only after a full re-read and re-check of the whole file** against the
  new patch. A partial correction (a few facts fixed against poe2db or patch notes) updates
  `stamped_at` and `sha256` only, keeps the old `patch`/`league`, and names the corrected sections
  in a dated "Corrections" line under the file's patch stamp.
- **Never bulk re-stamp.** Stamp each file on its own, in the commit that verified it; a stale
  stamp that makes the Coach caveat is correct, a fresh stamp on unchecked facts is not.

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
