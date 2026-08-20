# PoE2 knowledge platform plan

Status: Phase 1 foundation implemented; domain engines remain planned  
Research date: 2026-08-06  
Scope: item knowledge, crafting, farming advice, market demand, builds, and patch tracking

## Implementation status

Implemented in Phase 1:

- source registry, immutable content-addressed snapshots, sync state, and evidence links;
- allowlisted official GGG patch-note ingestion with bounded redirects, conditional requests,
  parser/validation-policy identity, and raw gzip artifacts;
- explicit patch review workflow that fails closed for recommendations without disabling Coach;
- patch freshness/readiness fields in the Coach health contract and a visible UI warning;
- idempotent migration from the earlier provenance schema without deleting snapshots or reviews;
- offline parser, amendment, migration, readiness, deployment, and regression tests.

Not implemented yet:

- canonical game-entity/cross-source identity tables;
- typed mechanic claims and patch-impact mapping;
- deterministic crafting state transitions and probability provenance;
- permitted build-demand ingestion and measured farming strategies;
- typed crafting/farming/build tools exposed to the LangGraph agent.

Phase 1 deliberately does not bulk-scrape PoE2DB or let patch prose mutate structured facts.

## Outcome

PoE2 Coach should not answer gameplay questions from one vector store or from the model's memory.
It should combine three different kinds of evidence:

1. **Game facts**: items, modifiers, crafting rules, mechanics, areas, tablets, waystones, and
   drop relationships.
2. **Observations**: exchange volume, listings, prices, build usage, and freshness.
3. **Derived recommendations**: legal craft paths, market demand, expected value, farming baskets,
   risk, and confidence.

The model may select tools and explain results. It must not invent facts, craft candidates, drop
sources, or profitability.

## Current repository gap

The application already contains useful deterministic product logic, but Coach cannot call it:

- the TypeScript app has curated craft targets, craft recipes, live margin reports, build weights,
  and the FarmAdvisor UI;
- the Python Coach tool registry currently exposes market history, live prices, knowledge RAG,
  item lookup, game-data lookup, and optional web search only;
- the RAG allowlist omits creator-video knowledge and raw transcripts;
- knowledge citations currently identify a local file/heading but return `url: null`.

This explains why the standalone product panels can be specific while Coach remains generic. The
first useful integration is to expose existing deterministic outputs as narrow internal tools and
repair source metadata. Adding more prose to embeddings does not close this gap.

Known defects to close during the migration:

- `ninjaClient.ts` imitates a browser User-Agent instead of sending the descriptive app/contact
  identity required by poe.ninja's published guidance, and it should use ETag/cache headers;
- FarmAdvisor economy categories are not evidence of actual drop relationships;
- curated craft recipe `hitRate` values lack source type and confidence, so unknown rates must be
  shown as break-even thresholds rather than precise EV;
- two URLs do not automatically constitute two independent confirmations;
- a single failed player craft is an observation, not highest-grade mechanic proof.

## Hard source constraint

There is no official GGG export containing all PoE2 items, modifiers, crafting rules, drops, and
endgame mechanics. GGG's developer documentation explicitly says that PoE2 API coverage is
limited. The available official sources include account characters, leagues, Currency Exchange,
the passive-tree export, and documented file formats, but not a complete static game database.

Therefore an official-only implementation cannot meet the product requirement. The correct model
is **official first, community-backed where necessary, and provenance on every fact**.

## Source hierarchy

| Tier | Source | Use | Authority rule |
| --- | --- | --- | --- |
| A | GGG patch-notes forum | Patch changes, hotfixes, official wording | Overrides every lower tier for stated behavior |
| A | GGG documented APIs and exports | Currency Exchange, leagues, account characters, passive tree | Authoritative within the documented response contract |
| B | RePoE PoE2 | Bases, mods, tiers, tags, uniques, gems, game-table relationships | High-confidence data-mined fact; never label official |
| B | Targeted PoE2DB tables | Missing mechanics and mappings not represented by RePoE | Store raw evidence and cross-check important facts |
| C | poe.ninja supported economy API | Convenient exchange and item aggregates | Observation only; never mechanic truth |
| C | poe2scout | Unique prices and price history | Observation only; cross-check or fallback |
| C | Existing Path of Exile `trade2` integration | On-demand current listing comparables | Official-site but unsupported website API; do not expand without approval |
| D | PoE2DB/wiki prose, selected guides, video transcripts | Explanations, strategies, recipes not available structurally | Cannot override Tier A/B mechanics without review |
| E | Reddit and unverified reports | Discovery of candidate facts or emerging strategies | Quarantine until verified |

Important distinctions:

- `poe.ninja` is a third-party service, not an official GGG API.
- Its supported public API surface is economy-only, unversioned, and has no SLA.
- poe.ninja says its PoE2 unique prices are estimated from the official Trade API.
- Its build/profile endpoints are explicitly internal and unavailable for third-party use. Do not
  build a scheduled importer against them.
- [PoEDB Developer API](https://poedb.tw/us/Developer_API) is a directory of Path of Exile API
  resources, not a download API for PoEDB's own database.

## Target architecture

```text
Official GGG       RePoE          PoE2DB          Market/build sources
patch/API/export   snapshots      page families  permitted aggregates
       |               |               |                  |
       +---------------+---------------+------------------+
                               |
                    immutable raw snapshots
                    hash + fetched_at + parser
                               |
                    validated normalizers
                               |
             +-----------------+------------------+
             |                                    |
       structured facts                    time observations
       items/mechanics/crafts              market/build usage
             |                                    |
             +-----------------+------------------+
                               |
                    deterministic engines
                 craft planner / farm scorer
                               |
                     narrow Coach tools
                               |
                    cited explanation layer
```

Use the existing SQLite database and content-addressed artifacts first. A database migration is
not justified until measured volume or concurrency requires it.

## Data contracts

### Provenance shared by every source

Add these records before adding more scrapers:

`source_registry`

- stable source key;
- source tier and owner;
- canonical base URL;
- allowed uses and retrieval policy;
- expected refresh cadence;
- parser name and schema version;
- whether commercial/legal review is required.

`source_snapshot`

- source key;
- fetch time and effective game version;
- request URL;
- HTTP status, ETag, Last-Modified, and payload SHA-256;
- raw artifact path;
- parser version;
- record counts and validation outcome;
- superseded snapshot ID.

`evidence_link`

- domain entity and field/relationship;
- snapshot or document ID;
- exact source locator, section, or row key;
- confidence: confirmed, corroborated, single-source, unverified;
- `valid_from_patch` and optional `valid_to_patch`;
- review status and reviewer timestamp.

No normalized fact may be inserted without an evidence link.

### Canonical identity

Create one `game_entity` registry rather than joining sources by display name:

- internal UUID;
- entity kind;
- GGG/RePoE metadata ID when available;
- canonical English name;
- patch validity range.

Store every source spelling in `entity_alias`, with source, locale, normalized text, and confidence.
Names are presentation data, not primary keys.

### Typed game facts

Keep domain tables explicit instead of using one generic EAV table:

- `item_base`, `unique_item`, `item_class`, `item_tag`;
- `modifier`, `modifier_tier`, `modifier_eligibility`, `modifier_conflict`;
- `craft_currency`, `craft_action`, `craft_rule`, `craft_outcome`;
- `mechanic`, `area`, `activity`, `encounter`, `drop_source`;
- `waystone_rule`, `tablet`, `tablet_effect`, `atlas_node`;
- `skill`, `support_gem`, `lineage_gem`, `build_archetype`.

Use normalized relationship tables for rules such as:

- modifier can roll on base under conditions;
- currency performs action on eligible item;
- activity can contain mechanic;
- tablet affects mechanic or map condition;
- encounter can drop item/reward family;
- patch changes entity field or relationship.

### Observations

Observations are time- and league-bound and must never overwrite game facts:

- `exchange_market_hour` for official Currency Exchange pairs;
- `listing_observation` and `item_price_aggregate` for trade comparables;
- `build_snapshot`, `build_item_usage`, `build_skill_usage`, `build_stat_demand`;
- `strategy_observation` for curated farming claims and measured baskets.

Every observation needs league, observed time, source, sample size, and confidence.

## Ingestion design

### 1. Official GGG

Implement first:

- Poll [PoE2 patch notes](https://www.pathofexile.com/forum/view-forum/2222) every 30 minutes with
  conditional requests or content hashes.
- Fetch new staff threads, store immutable HTML, and extract version, title, publication time,
  headings, and bullets.
- Fetch the documented PoE2 Currency Exchange hour after it closes.
- Refresh current leagues from the documented API.
- Keep the existing official passive-tree export workflow.

Patch parsing creates `pending_patch_effect` rows. It must not silently mutate structured facts.
A reviewed effect can close an old fact's validity range, insert the new fact, invalidate derived
recommendations, and trigger a RePoE refresh.

### 2. RePoE

Keep `npm run sync:poe2-data` as the primary static snapshot. Extend its normalizer into the typed
tables instead of writing a second static-data scraper.

Required checks:

- pinned game version and source commit;
- content hash and nonzero record counts;
- referential integrity for item, mod, tag, and stat IDs;
- diff report for added, removed, and changed entities;
- hard failure when record counts collapse or schemas drift.

### 3. PoE2DB

Do not build an unrestricted recursive site mirror. Build **complete coverage of approved page
families**, because that is the product need and is testable.

Initial allowlist:

- crafting currency and mechanic pages;
- base/unique/modifier pages missing from RePoE;
- endgame activity, area, encounter, tablet, and waystone pages;
- drop-source and reward relationship tables;
- selected farming-mechanic pages needed by Coach queries.

Each page family gets its own parser and fixture. The importer must:

- respect robots, caching headers, and a conservative global rate limit;
- use a descriptive User-Agent and bounded concurrency;
- save raw HTML before parsing;
- store canonical URL, fetch time, hash, and detected game version;
- validate required selectors, headings, and minimum row counts;
- fail loudly and quarantine changed pages on DOM drift;
- never render scraped prose as our own uncited documentation;
- receive a licensing/terms review before commercial reuse or bulk redistribution.

The goal is to know every relevant item and mechanic, not to duplicate navigation, ads,
translations, user pages, or unrelated wiki content.

### 4. Market sources

Make the official Currency Exchange history the raw authority for exchange-traded assets. Derive
hourly rates and volume locally.

Use the poe.ninja supported economy API only for fields/categories not yet reproduced locally and
obey its published ETag, User-Agent, polling, and volume guidance. Keep poe2scout as a labeled
cross-check for uniques.

For trade listings, keep the existing bounded, per-user `trade2` search only for on-demand current
comparables while its terms are reviewed. GGG does not list `trade2` in the supported developer API
reference, so do not build a new bulk collector around it or describe it as a documented official
API. A listing is not a completed sale.

Retention:

- raw compressed exchange payloads: 7 days;
- normalized hourly observations: 90 days;
- daily aggregates: indefinitely;
- source and parser metadata: indefinitely.

### 5. Build demand

Build demand is the weakest source today.

- Do not call poe.ninja's internal build/profile API.
- Stop refreshing the current scraper: it calls the internal `build-index-state` endpoint before
  scraping the rendered page, which conflicts with poe.ninja's published API boundary.
- Keep the already-captured `buildMeta.json` only as a dated historical snapshot for the demo; do
  not represent it as current after its freshness window.
- Prefer user-imported PoB/official `.build` files for personalized analysis.
- Seek a permitted aggregate/export or explicit permission before automating broad meta ingestion.
- Never use one creator's build as population-level demand.

Build popularity may influence demand scoring, but it cannot establish a crafting mechanic or an
exact hit probability.

## Deterministic decision engines

### Craft candidate engine

Input:

- league and patch;
- player budget and risk tolerance;
- optional build/archetype, slot, base, and desired stats.

Pipeline:

1. Resolve canonical bases, modifiers, and craft actions.
2. Enumerate only legal actions and reachable outcomes.
3. Join current base/material cost and result comparables.
4. Join build demand and market liquidity.
5. Calculate hit rate only when the probability model has verified weights and conditions.
6. Rank candidates by capital fit, demand, liquidity, margin/EV, evidence freshness, and risk.
7. Return the full calculation and evidence IDs to Coach.

If exact weights are unavailable, return a demand-ranked craft opportunity with no fabricated EV.

Suggested score components, stored separately rather than hidden in one number:

- `demand_score` from build/item/stat usage;
- `liquidity_score` from exchange volume or listing depth;
- `craftability_score` from affix pool, conflicts, and known weights;
- `margin_score` from conservative acquisition and sale assumptions;
- `freshness_score` from observation age;
- `confidence_penalty` from evidence tier and sample size.

### Farming advisor engine

For a query such as a Lineage Jade Isles farm, the engine must resolve:

- activity/area and current patch;
- supported mechanics and legal tablet/waystone interactions;
- relevant reward and drop families;
- current value and liquidity of the reward basket;
- player build constraints and budget;
- evidence conflicts or missing facts.

It then ranks setup variants and returns exact inputs, reasons, expected reward basket, risks, and
citations. The LLM explains this payload; it does not choose arbitrary tablets from memory.

## Coach tool boundary

Replace broad retrieval for factual questions with narrow tools:

- `lookup_game_entity`;
- `get_item_and_modifier_rules`;
- `plan_craft_candidates`;
- `compare_market_candidates`;
- `recommend_farm_setup`;
- `get_patch_changes`;
- `retrieve_curated_explanation`.

Structured tools return typed JSON with evidence IDs and patch/league timestamps. Dense/BM25 RAG
remains for patch prose, guides, and transcript explanations. It is not the database for item
legality, modifier eligibility, prices, or probabilities.

Every response should expose:

- source and capture date;
- game patch and league;
- observed versus modelled values;
- known limitations and confidence;
- stale-data warning when source versions do not match.

## Patch lifecycle

```text
new official thread
  -> immutable capture
  -> bullet extraction and entity linking
  -> pending impact review
  -> RePoE/PoE2DB refresh and diff
  -> fact validity update
  -> derived-score invalidation
  -> regression evals
  -> publish current-patch readiness
```

Coach readiness should include `game_data_patch`, `latest_official_patch`, and
`recommendations_ready`. A healthy process with stale rules must not report the recommendation
layer as ready.

## Evaluation plan

Create verifiable task sets rather than judging only answer style:

- entity lookup and alias resolution;
- modifier/base eligibility;
- legal multi-step craft chains;
- exact source selection;
- patch-before/after behavior;
- farm setup under budget/build constraints;
- abstention when weights, drops, or market samples are insufficient;
- citation and freshness requirements.

Run deterministic assertions for facts and tool traces. Use an LLM judge only for explanation
quality and limitation clarity. Add simulated user trajectories for ambiguous farming and crafting
questions after the deterministic suite is stable.

## Delivery plan

### Phase 0: preserve the demo

- Freeze current presentation behavior.
- Record known generic/incorrect answers as regression cases.
- Do not mix this migration into Demo Day work.

Exit: current production remains deployable and the new work is isolated behind offline jobs.

### Phase 1: provenance and patch control

- Add source registry, snapshots, evidence links, and patch validity.
- Add official patch-note watcher and pending-effect review command.
- Expose patch mismatch in health/readiness.

Exit: every new fact can identify its origin; a new patch automatically marks affected advice
stale instead of serving it as current.

### Phase 2: canonical static catalog

- Normalize current RePoE snapshots into canonical entities and typed item/mod/craft tables.
- Import existing Alloy/Essence mappings with evidence.
- Expose existing craft targets, craft margin reports, and FarmAdvisor results through typed
  read-only Coach endpoints before reimplementing their calculations in Python.
- Add fixture-based integrity and patch diff tests.

Exit: Coach can answer item/mod eligibility without vector retrieval.

### Phase 3: official market history

- Ingest GGG Currency Exchange hourly data.
- Build local normalized rates, volume, daily aggregates, and retention.
- Compare derived values with poe.ninja before switching the current currency market layer.

Exit: official exchange data drives exchange-traded prices and volume; discrepancies are measured.

### Phase 4: targeted PoE2DB coverage

- Implement the approved page-family registry and crawler policy.
- Add mechanics, activities, tablets, waystones, and missing drop/craft relationships.
- Add DOM fixtures, drift quarantine, coverage reports, and licensing review gate.

Exit: every supported farming/crafting question declares which required facts are covered or
missing; there is no silent partial catalog.

### Phase 5: craft and farm engines

- Implement legal craft enumeration and transparent scoring.
- Implement activity/reward-basket and setup scoring.
- Add narrow Coach tools and evidence rendering.

Exit: the model explains deterministic candidates and cannot invent the candidate set.

### Phase 6: build demand and agent evals

- Establish a permitted build aggregate or explicit permission.
- Join archetype demand to market and crafting candidates.
- Add golden tasks, simulations, regression gates, and patch-specific eval runs.

Exit: useful-to-craft and farming recommendations are evidence-backed, patch-aware, and measured.

## First implementation slice

The first PR should include only:

1. source/provenance schema;
2. official patch-note index watcher with immutable fixtures;
3. `game_data_patch` versus `latest_official_patch` readiness;
4. tests for new patch detection, unchanged content, parser drift, and stale readiness.

Do not start with a generic whole-site scraper. Without provenance and patch validity it would only
create a large, stale database that the agent cannot safely reason over.

## Primary references

- [GGG developer docs](https://www.pathofexile.com/developer/docs)
- [GGG API reference](https://www.pathofexile.com/developer/docs/reference)
- [GGG data exports](https://www.pathofexile.com/developer/docs/data)
- [Official PoE2 patch notes](https://www.pathofexile.com/forum/view-forum/2222)
- [poe.ninja API reference](https://poe.ninja/docs/api)
- [poe.ninja PoE2 unique pricing source note](https://poe.ninja/posts/poe2-unique-items)
- [PoEDB Developer API directory](https://poedb.tw/us/Developer_API)
- [Existing data-source research](../research/poe2-data-source-strategy.md)
