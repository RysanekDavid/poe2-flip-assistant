# Session Handoff — PoE2 Flip Assistant (2026-07-15)

Complete context transfer for continuing work on this repo in a fresh session (Claude Code or
any other agent). Read top-to-bottom before touching code.

**Full raw conversation history:** `docs/chat-export/` — every session's user/assistant messages
as markdown (tool calls as one-line markers, results omitted, secrets redacted), plus a copy of
the persistent cross-session memory in `docs/chat-export/memory/`. The 2026-07-15 session file
is the big one (entire build history of the craft system, hunt system, UI evolution).

---

## 1. Project

**PoE2 Flip Assistant** (`C:\Git\POE_tradechecker`) — real-time trading + crafting assistant for
Path of Exile 2 Currency Exchange, league **Runes of Aldur** (SC). Local-first Next.js app; the
user plays with the dashboard on a second monitor.

- Owner: senior full-stack engineer (TypeScript, React, Rust), communicates in **Czech**,
  expects terse replies (caveman mode active — see §8). Full atlas endgame, deep game knowledge —
  he catches wrong crafting facts in-game and reports them as bugs.
- App rename pending: he dislikes "PoE2 Flip Assistant". Candidates offered:
  Divinery / Orbit / Hoard / Kalandra / Trove / Exilium / Vaultis / Aurum. He picks one + makes
  a logo, then rename h1, layout metadata/title, login page, package.json, README in ONE commit.
  Logo asset folder already exists: `src/assets/logo/`.

## 2. Stack & commands

| Task | Command |
|------|---------|
| Dev (web + poller) | `npm run dev` (next dev on **:3000** + `tsx watch src/scheduler/poller.ts`) |
| Typecheck | `npx tsc --noEmit` |
| Craft test suite | `npx tsx src/scripts/testCraftMargin.ts` (25 asserts, needs live SQLite DB) |
| poe2db tier scrape | `npm run scrape:poe2db` (Playwright → `src/data/poe2dbTiers.json`) |
| Build meta scrape | `npm run scrape:builds` (monthly, offline → buildMeta.json) |

Stack: Next.js 15 + React 19 + TypeScript, better-sqlite3, Tailwind (dark theme only),
node-cron poller, axios + bottleneck (ninja rate limit 12 req / 5 min), zod.

Ports: user's dev server = 3000. A **zombie OLD build may still run on :3001** — kill it, it
serves stale UI and confuses visual checks. Test servers 3002–3004 were mine, all killed.

## 3. Hard rules (non-negotiable)

1. **NEVER run `git commit` / `git push` yourself.** Always hand the user a copy-paste command
   block, WITHOUT any Co-Authored-By line. He commits.
2. **POESESSID = secret.** Never in chat, never in repo, encrypted at rest (scrypt+HMAC auth,
   per-user encrypted storage). `.env.local` gitignored, per-machine. A leaked POESESSID was
   already invalidated once — users re-enter in Settings.
3. **No in-game automation.** Read-only advisory tool (GGG ToS). Hunt/snipe system finds
   listings, never buys. Same for Discord: NO self-bot / user-token fetching (TFT account ban
   risk) — only bot-on-his-own-server or manual paste.
4. **Max 500 lines/file** (that's why craftRecipeData2/craftGuideData2 exist), max 60-line
   functions, named exports, no `any`, zod for runtime validation.
5. **Crafting facts must be verified before shipping.** Creator videos/transcripts are LEADS,
   not truth. Verify every mechanic against poe2wiki / poe2db / game8 / multiple guides, and
   check descriptions make sense. Two recipes have already been refuted by the user in-game;
   one was deleted outright (see §6). Check `docs/research/poe2-crafting-knowledge.md` +
   `docs/kb/` BEFORE writing any craft fact.
6. Conventional commits (`type(scope): …`). Never push to master directly is the global rule,
   but this repo is solo — user commits to master himself.
7. Lint + typecheck before declaring done. For craft-data changes also run testCraftMargin.

## 4. Architecture map

```
src/
├── api/            ninjaClient (poe.ninja PoE2 exchange, Referer header required), types, rateLimiter
├── core/
│   ├── priceEngine, spreadCalc, alertEngine, trendDetector   # original flip engine
│   ├── craftMargin.ts        # EV = hitRate × result − base − materials; robustValue
│   │                         # (bait-drop <20% cluster median, low-percentile median),
│   │                         # MIN_SAMPLES=3 both legs, listingDiv currency fallback,
│   │                         # unresolvedStats surfacing, legToQuery (name/es/ev/corrupted)
│   ├── craftRecipes.ts       # barrel: concat RecipeData + RecipeData2, GUIDES + GUIDES_2
│   ├── craftRecipeData.ts / craftRecipeData2.ts   # 14 recipes (500-line cap split)
│   ├── craftGuideData.ts / craftGuideData2.ts     # phase/step playbooks (pick/check/warning/onFail)
│   ├── craftMaterials.ts     # MATS registry (id = ninja exchange id, group, label)
│   ├── farmAdvisor.ts        # "what to farm" — SOURCE_OVERRIDES itemId→activity (Lichborn
│   │                         # omens → Abyss, essence-of-the-abyss → Abyss, astrids → Expedition)
│   └── craftTargets.ts + buildMeta.json           # Craft Helper hybrid (curated × scraped)
├── db/             SQLite (better-sqlite3), schema, typed queries; user_id multitenant phase 1 done
├── scheduler/      poller.ts — 5min cron, ninja fetch, craft_refresh_request flag consumer (~20s)
├── app/            Next app dir; api routes: prices, alerts, trades, watchlist, health,
│                   balance/summary (light net-worth), hunts, craft (margin report + PATCH attempt)
├── components/
│   ├── CraftMarginPanel.tsx  # per-domain windows (jewel/weapon/jewellery/armour), 48px hero art,
│   │                         # EV/ATTEMPT caption, Craft button expands card into session
│   ├── craft/CraftSessionWizard.tsx  # CraftSessionInline: stepper (✓ phases + reset), shopping
│   │                         # checklist (bought in LS, only-active-session writes guard),
│   │                         # steps w/ 64px mat art, pick/check/onFail, outcome → PATCH
│   ├── craft/MarginBreakdown.tsx     # materials numbered by first-use guide step, EV formula,
│   │                         # LegBlocks 48px art + ⓘ; exports priceLabel/MatIcon/RecipeView
│   ├── MarketStatus.tsx      # header rate chips (poecdn currency art) + Converter (amber accent,
│   │                         # ArrowRightLeft icon, content-width input, segmented outputs)
│   ├── TopBar.tsx            # bell (small h-5), UserMenu fieldset "profile" border: WealthChip
│   │                         # (NET WORTH label, amber), gold-gradient nick, stacked Guide/Sign out(red)
│   └── page.tsx tabs         # PNG icons h-9 from src/assets, active underline white
├── scripts/        testCraftMargin.ts (asserts 14 recipes), scrapePoe2db.ts, scrapeBuilds
└── data/           poe2dbTiers.json (2851 mod families — tier/ilvl authority)
docs/
├── research/poe2-crafting-knowledge.md   # THE verified crafting KB (patch 0.5.x)
├── research/rare-item-valuation.md       # stat-valuation pipeline design
└── kb/             # autonomous knowledge base: README (update loop), 8 domain files,
                    # community-reddit.md, creator-videos.md (343 facts), drop-sources.md
                    # (72 mappings), sources/transcripts/ (21 files + index.json)
```

## 5. Craft system — current state (14 recipes)

Recipe model: `CraftRecipe{key, domain, heroIcon?, base/result RecipeLegSpec, materials
(MATS + qtyPerAttempt + note), hitRate, guide}`. Legs are priced live via trade2 comparables
(official API, sale_type **"priced"** not "priceFixed"; presence-only stats for Time-Lost jewel
"Notable Passive Skills in Radius also grant…" mods — numeric mins return 0).

Recipes (craftRecipeData): jewel_suffix_push, bow_amanamu, ring_catalysing_exalt,
amulet_fracture_plus3, boots_putrefaction (+ _ev variant), ring_fractured_t1res.
(craftRecipeData2): armour_putrefaction, gloves_projectile_plus2, wand_alloy_crystallisation,
amulet_giga_spirit, quarterstaff_desecrate_crit, amulet_desecrated_beginner.
Deferred: gem_corrupt_discount (needs gem-level trade filters). Excluded: Genesis Tree
(non-tradeable input).

Verified 0.5.x mechanics (full detail in `docs/research/poe2-crafting-knowledge.md`):
- Per-item currency floors: Greater Aug/Transmute=44, Perfect Aug/Transmute=70,
  Greater Exalt/Regal/Chaos=35, Perfect=50. Floors are SOFT (family top-tier valve) — warn
  "can't roll tiers below N", never "mod can't appear".
- ilvl gates: T1 ele res=82, chaos=81, T2=71; boots MS 82/65 (per poe2dbTiers.json).
- Whittling removes lowest modifier LEVEL, chaos-orb-only, hover preview.
- One crafted + one desecrated mod max per item; unrevealed desecrated blocks re-desecration.
- Bones: Jawbone=weapons, Rib=armour, Collarbone=amulet/ring/belt, **Cranium=jewels**;
  Gnawed ilvl≤64 (fails on high-ilvl bases — user hit "Item Level is too high"), Preserved=any,
  Ancient=min-mod-40. Desecration works on regular rare jewels too.
- Omens: **Omen of Light = next Annulment removes ONLY the desecrated mod** (fail-path standard).
  Sinistral=prefix side, Dextral=suffix side (Annulment/Necromancy/Exaltation variants).
  Abyssal Echoes = ONE reroll of the 3 reveal options, must be armed BEFORE reveal.
  Catalysing Exaltation biases FIRST mod of Greater Exaltation's two (player-confirmed).
- Liquids: **Ancient tier ONLY on rare Time-Lost jewels** — Ancient Contempt = "+1 Prefix OR
  Suffix Modifier allowed" (50/50), Ancient Ferocity = 40–60% Effect of Prefixes/Suffixes.
  **Non-Ancient Potent Contempt on basic rare jewels = FIXED damage prefix by colour**
  (Sapphire→chaos, Ruby→phys, Emerald→ele) — NOT "+1". Regular rare jewels cap at 4 mods.
- Lichborn omen family (Light, Echoes, Necromancy×2, Putrefaction, Liege, Sovereign,
  Blackblooded) drops ONLY from rare Abyss monsters (Amanamu's Void etc.) — Light = kill
  OUTSIDE void cloud, Liege = INSIDE. farmAdvisor SOURCE_OVERRIDES handles ninja's wrong
  category.

## 6. This session's work (what changed, why)

1. **Converter accent** (`MarketStatus.tsx`): amber border (amber-500/25) + ArrowRightLeft icon
   + tooltip — user wanted the converter visually distinct from rate chips, nothing extravagant.
2. **jewel_suffix_push fail path fixed** (user in-game correction): reveal onFail now = **Omen of
   Light + Orb of Annulment** (strips just the revealed desecrated mod), NOT Sinistral/Dextral
   Annulment. Guide text + recipe mats updated.
3. **jewel_suffix_push missing core step added** (user correction #2): after Ferocity, before
   filling prefixes — **Omen of Sinistral Annulment + Orb of Annulment pulls the "+1 Suffix
   Modifier allowed" mod** (it sits on the PREFIX side; Sinistral restricts annul to prefixes so
   suffixes are safe; the 4 suffixes stay over-cap; prefix slots open for exalts). New guide step
   with check, recipe mats: omenSinistralAnnulment 1×, annul 1.5× (1 core + 0.5 fail path).
4. **jewel_desecrated_liquid DELETED** (user: "úplně mimo" — researcher agent confirmed against
   sanctuaryrelic verbatim in-game text, game8, poe2dictionary, dadsofexile): the recipe's two
   load-bearing claims were false (see §5 liquids). Recipe + guide removed, tombstone comment in
   craftRecipeData2.ts explains the refutation, potentLiquidFerocity MATS entry removed
   (potentLiquidContempt kept — used by testCraftMargin manual-price test), KB §6 updated,
   test count 15→14. Source of the error: misread transcript + aoeah gold-seller blog
   ("+1 slot on basic jewel" — refuted).
5. Memory `crafting-knowledge-base.md` updated with the refutation + the verify-first rule.

**All uncommitted.** Working tree also carries earlier uncommitted work (header icons, profile
cluster, balance/summary route, KB files, scraper, deleted TreasuryPanel…). Suggested commit
for the session's craft fixes was handed to the user (fix(craft): correct Time-Lost jewel
guide, delete refuted budget-jewel recipe). User commits himself — see §3 rule 1.

## 7. Pending tasks / next steps

1. **App rename** — waiting for user's name pick (§1). One commit, all surfaces.
2. **TFT/Discord ingest** — waiting for user's decision on bot-on-own-server (~1 day: bot +
   ingest endpoint + parser). Watch TFT GitHub for PoE2 repos (currently PoE1-only).
3. `gem_corrupt_discount` recipe — deferred until gem-level trade filters exist in legToQuery.
4. **Multitenant deploy (Hetzner, 3 users)** — Phase 1 (user_id migration) DONE, B1 watchlist/
   alerts + B4 hunts scoped; **B2 wealth/flips + B3 balance still pending**. trade2 works from
   Hetzner datacenter (tested 200 OK) — server calls trade2 with per-user encrypted POESESSID.
   Vercel = wrong platform (serverless FS/cron). User said deploy "potom" (later).
5. **Phase 5: craft AI agent** — KB in docs/kb/ is the future RAG corpus; build method follows
   user's AI Eng Certification course (RAG→agentic→memory→eval, TS via Vercel AI SDK).
6. Kill zombie :3001 build (user's machine).
7. Snipe finder auto-valuation (Price Book, valuable-stat profiles) — designed, not built
   (memory: snipe-finder-design, stat-valuation-pipeline).

## 8. Working with this user (etiquette)

- **Caveman mode full** active via UserPromptSubmit hook: terse fragments, no filler. Normal
  prose for code, commits, security notes, multi-step instructions.
- UI taste: game art everywhere (poecdn icons, custom tab PNGs in `src/assets`), tooltips over
  prose, interactive over static, no status-chip noise ("prices stale" chip appears only when
  stale), dark theme only. He reviews visually and pastes screenshots.
- He supplies creator-video transcripts manually (YouTube transcript APIs all blocked);
  intake flow: paste/drop → split into docs/kb/sources/transcripts/ → mining workflow →
  KB facts → recipe shortlist → implement → live-validate legs.
- Reddit unreachable via WebSearch/WebFetch/jina — use **Brave MCP** snippets. poe2db/poe2wiki
  often 403/503 from fetch tools — Playwright scraper or secondary sources (game8,
  poe2dictionary, sanctuaryrelic quotes in-game text verbatim).
- In-game bug reports from him are ground truth — when he says a mechanic is wrong, it is;
  research to find the correct version, don't argue.
- Trade links: official trade2 `?q=` deep-link format; ninja API needs Referer header;
  poe2scout for unique prices ninja lacks.

## 9. Key file inventory for quick orientation

| Concern | Files |
|---------|-------|
| Craft recipes/guides | `src/core/craftRecipeData.ts`, `craftRecipeData2.ts`, `craftGuideData.ts`, `craftGuideData2.ts`, `craftMaterials.ts`, `craftRecipes.ts` (barrel) |
| Craft engine | `src/core/craftMargin.ts`, test: `src/scripts/testCraftMargin.ts` |
| Craft UI | `src/components/CraftMarginPanel.tsx`, `src/components/craft/CraftSessionWizard.tsx`, `src/components/craft/MarginBreakdown.tsx` |
| Header/UI shell | `src/components/MarketStatus.tsx`, `src/components/TopBar.tsx`, `src/app/page.tsx`, `src/app/login/page.tsx` |
| Farm advisor | `src/core/farmAdvisor.ts` (SOURCE_OVERRIDES) |
| Knowledge base | `docs/research/poe2-crafting-knowledge.md` (verified rules), `docs/kb/*` (domains, creator videos, drop sources, transcripts) |
| Tier/ilvl truth | `src/data/poe2dbTiers.json` + `src/scripts/scrapePoe2db.ts` |
| Poller | `src/scheduler/poller.ts` (5min cron + craft_refresh_request consumer) |

## 10. Claude Code session memory (persists outside repo)

Auto-memory lives at `C:\Users\dawel\.claude\projects\C--Git-POE-tradechecker\memory\` —
20 memory files indexed in MEMORY.md (ninja API shape, spread model, fee denomination,
poe2scout, trade2 quirks, hunt system, balance tracking, deployment, multitenant status,
valuation engine, snipe design, AI-agent course, builds scrape, stat valuation, craft helper,
craft guides, UI preferences, crafting KB, never-commit rule). A fresh Claude Code session in
this folder loads it automatically; other tools should read this handoff instead.
