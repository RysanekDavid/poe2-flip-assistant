# Valuing Rare Items by Rolled Stats — Research for a PoE2 Snipe Finder

Goal: given a rare item with rolled mods, estimate market value from comparable live listings; if a listing sits far below that value, it's a snipe. Below is how the existing tools actually do it, at the code/endpoint level, with what's PoE2-ready vs PoE1-only, ending in a concrete pipeline for our tool.

Primary source studied at source level: **Exiled Exchange 2** (`github.com/Kvan7/Exiled-Exchange-2`, branch `dev`), the maintained PoE2 fork of Awakened PoE Trade. File paths below are real and current.

---

## 1. Exiled Exchange 2 / Awakened PoE Trade — how they value a rare

**Core idea: they do NOT predict a price. They build a *relaxed comparable-listing search* against the official trade API and read the price off the cheapest matching online listings.** No ML, no training, no DB. Group stats into pseudos, widen each numeric min down a few %, query trade2, sort by price asc.

### 1a. Mod text → trade stat IDs (`explicit.stat_XXXX` resolution)

The stat-id catalog is **pre-baked** into the app as NDJSON, one stat per line, per language. It is generated offline by a Python pipeline (`dataParser/`) that pulls the official trade2 stat catalog and merges it with game data (RePoE-style).

- Runtime data file: `renderer/public/data/en/stats.ndjson` (and `de/`, `ru/`, `ko/`, … per language).
- Generator: `dataParser/src/providers/trade_api.py` fetches `TRADE_QUERY_URLS` (the trade2 `data/stats` + `data/items` JSON) per language and writes `dataParser/output/<lang>/stats.ndjson`.

Each line maps one human-readable stat **ref** to its trade IDs, keyed by modifier type:

```json
{"ref": "# Charm Slot",
 "better": 1,
 "matchers": [{"string": "# Charm Slots"}, {"string": "# Charm Slot", "value": 1}],
 "trade": {"ids": {
    "explicit": ["explicit.stat_2582079000", "explicit.stat_554899692"],
    "rune": ["rune.stat_554899692"]}},
 "id": "num_charm_slots"}
```

Key fields: `ref` (canonical text with `#` placeholders), `matchers[].string` (the localized text variants to match against the clipboard), `trade.ids.<modType>` (the actual trade-API stat IDs — **one logical stat can map to several `stat_XXXX` IDs**, and to different IDs per mod type: `explicit`/`implicit`/`rune`/`pseudo`/`fractured`/`crafted`/`enchant`/`desecrated`…).

The matching algorithm — `renderer/src/parser/stat-translations.ts`:
1. `linesToStatStrings()` walks the pasted mod lines, skipping reminder text in parentheses, and joins 1–N consecutive lines to try multi-line stats.
2. For each candidate string, `_statPlaceholderGenerator()` substitutes the rolled numbers out for `#` placeholders in every combination (handles 1–4 numbers per line via a fixed `PLACEHOLDER_MAP`), so `"+35 to Strength"` becomes the lookup key `"# to Strength"`.
3. `STAT_BY_MATCH_STR(matchStr)` looks the placeholdered string up in the pre-built index from the NDJSON → returns the `Stat` (with its `trade.ids`).
4. `parseRoll()` extracts the numeric `value` (and `min`/`max` bounds parsed from the game's `(min-max)` advanced-mod hint when present). For 2-number lines (e.g. `Adds # to # Fire Damage`) it averages the two via `getRollOrMinmaxAvg()`.
5. Fallback `trySecondaryParseTranslation()` uses `TRADE_STAT_BY_MATCH_STR` — a naive direct lookup against the trade catalog when the curated stat list misses.

So resolution is: **localized mod line → placeholdered match string → curated NDJSON lookup → trade `stat_XXXX` IDs + parsed roll.** The `stat_XXXX` numbers come from the official trade2 `data/stats` endpoint, frozen into the shipped NDJSON.

### 1b. Pseudo-mod grouping

This is real and lives in `renderer/src/web/price-check/filters/pseudo/index.ts`. A `PSEUDO_RULES` table sums multiple source stats into one synthetic "total" filter, each with an optional per-source `multiplier`. Examples taken verbatim from the code:

- **`#% total Elemental Resistance`** — sums all of fire/cold/lightning res sources, where multi-element sources are weighted by how many elements they cover. The `RESISTANCES_INFO` table tags each base stat with which elements it contributes:
  - `+X% to all Elemental Resistances` → counts as `multiplier: 3` (fire+cold+lightning).
  - `+X% to Fire and Cold Resistances` → `multiplier: 2`.
  - `+X% to Fire Resistance` → `multiplier: 1`.
- **`#% total to Fire Resistance`** (group `to_x_ele_res`) — sums every source that includes fire: pure fire res, "all elemental", "all resistances", "fire and cold", "fire and lightning", "fire and chaos". This is exactly the "+X Fire Res" + "+Y all Ele Res" → "total fire res" combination you asked about.
- **`+# total maximum Life`** — `# to maximum Life` (required) **+ Strength × 0.5** (Str gives life; encoded as the Str source with `multiplier: 2` against a life pseudo whose own divisor handles the ratio).
- **`+# total maximum Mana`** — mana + Intelligence-derived mana.
- **`+# total to all Attributes`**, **`+# total to Strength/Dexterity/Intelligence`** — attribute totals from "+all attributes" and the paired-attribute mods.
- Chaos res, total energy shield, total increased ES%, movement speed each have rules too.

Mechanics: `statSourcesTotal()` (in `parser/modifiers.ts`) adds up the matched source rolls with their multipliers; a rule can be `disabled` by default (shown but unchecked) or auto-enabled via a `mutate(filter)` hook (e.g. chaos res auto-enables unless it's a single crafted source). Some rules are `required` (the pseudo only forms if a specific base stat is present, e.g. life pseudo requires the raw life mod).

These pseudo IDs resolve to real trade IDs like `pseudo.pseudo_total_elemental_resistance`, `pseudo.pseudo_total_life`, etc., which the official trade2 site supports natively.

### 1c. Building the comparable search — relaxing the roll

In `renderer/src/web/price-check/filters/create-stat-filters.ts` + `util.ts`. Each kept stat becomes a `StatFilter` whose trade `value.min` is the **rolled value reduced by a percentage**, `value.max` left open. The relaxation function (`util.ts`):

```ts
export function percentRoll(value, p, method /* floor|ceil */, dp = false) {
  const res = value + (Math.abs(value) * p) / 100;   // p negative widens min downward
  const rounding = Math.pow(10, decimalPlaces(value, dp));
  return method((res + Number.EPSILON) * rounding) / rounding;
}
```

In `calculatedStatToFilter()` the filter min/max are set as:

```ts
min: percentRoll(roll.value, -percent, Math.floor, dp),   // e.g. percent = 10 → min = 90% of roll
max: percentRoll(roll.value, +percent, Math.ceil,  dp),
```

`percent` is the user's **search range** (`searchStatRange`), **default clamped to ≤ 2%** for the auto "exact" filters (`searchInRange = Math.min(2, opts.searchStatRange)`), but the UI numeric stepper lets the user widen it (commonly ~10%). So the default behavior is "min = roll, slightly relaxed"; a wider net is a deliberate user action, not automatic 80–90%. (Note: AwPT/EE2 lean toward *tight* default ranges and rely on the user loosening; this differs from the "always relax to ~85%" assumption.)

**Which mods are included vs ignored** (`createExactStatFilters`, the `keepByType` logic):
- Always kept: Pseudo, Fractured, Desecrated, Crafted, Enchant, Necropolis, Sanctum, Skill.
- Implicit kept only if the item has no influences and isn't fractured.
- **Explicit mods are kept only on magic items or rares with < 5 explicit mods** — on a full 6-mod rare the raw explicits are NOT auto-searched (too specific → zero results); the pseudo totals carry the search instead.
- Even when kept, an explicit filter is `disabled` (unchecked) unless one of its sources is **tier ≤ 2** — i.e. only the top-tier rolls are searched on by default; chaff mods are shown but off.
- No per-mod numeric "weight" exists; the only weighting is the pseudo `multiplier` and the binary include/exclude + tier gate. (The "Total Weight = Life×3 + Res×2 …" formula floating around blogs is *not* in the codebase — it's a community heuristic, not how EE2 works.)

### 1d. Picking the value from comparables

`renderer/src/web/price-check/trade/pathofexile-trade.ts`:
- Search request always sorts **`sort: { price: "asc" }`** — cheapest first.
- `trade_filters.filters.indexed.option` (listing age) and an **online/AFK status** filter are applied; the UI default is online-only-ish (`securable`/`onlineleague` listing types).
- The result is the **list of cheapest matching online listings**; the displayed price is effectively the floor of comparable inventory (the user eyeballs the first few). There's no median computation server-side — the "value" is "what the cheapest few online sellers ask for an item matching these relaxed stats." Outlier handling is manual (user sees the stack of prices).

For our snipe finder this is the important nuance: **cheapest-comparable is the *asking floor*, not fair value.** To detect a snipe you want a robust central estimate (median of top-N online comparables) and flag listings materially below it — see §6.

### The actual trade2 request body it builds

Stat filters become entries in a single `type: "and"` group; multi-ID stats become a `type: "count"` group with `value.min: 1`:

```ts
// qAnd = query.stats[0], type "and"
qAnd.filters.push(tradeIdToQuery(stat.tradeId[0], stat));
// tradeIdToQuery →
{ id: "explicit.stat_3372524247",
  value: { min: 90, max: undefined },   // from getMinMax(roll)
  disabled: false }
```

Full shape (`createTradeRequest`):
```json
{
  "query": {
    "status": { "option": "securable" },
    "stats": [
      { "type": "and", "filters": [
        { "id": "pseudo.pseudo_total_life",               "value": { "min": 80 } },
        { "id": "pseudo.pseudo_total_elemental_resistance","value": { "min": 110 } },
        { "id": "explicit.stat_XXXX",                     "value": { "min": 90 } }
      ] }
    ],
    "filters": {
      "type_filters":  { "filters": { "category": { "option": "armour.gloves" }, "rarity": { "option": "rare" }, "ilvl": { "min": 82 } } },
      "misc_filters":  { "filters": { "mirrored": { "option": "false" }, "corrupted": { "option": "false" } } },
      "trade_filters": { "filters": { "indexed": { "option": "1day" }, "price": { "option": "chaos" } } }
    }
  },
  "sort": { "price": "asc" }
}
```

Item category → trade `type_filters.category` comes from the `CATEGORY_TO_TRADE_ID` map (e.g. `armour.gloves`, `weapon.crossbow`, `accessory.ring`).

---

## 2. poeprices.info — the ML rare pricer

**Endpoint (confirmed live):**
```
GET https://www.poeprices.info/api?l={league}&i={base64_item_text}&w=1
```
- `l` = league (case-sensitive), `i` = **base64 of the raw in-game Ctrl+C item text** (including the `--------` separators), `w` = flag always `1` (undocumented; best guess "include explanation", unverified).

**Response (verbatim from a live call):**
```json
{
  "min": 0.08,
  "max": 0.12,
  "currency": "chaos",
  "warning_msg": "",
  "error": 0,
  "error_msg": "",
  "pred_confidence_score": 96.39,
  "pred_explanation": [
    ["(pseudo) (total) +# to maximum Life", 0.0],
    ["+# to Evasion Rating", 0.0],
    ["(pseudo) +#% total Elemental Resistance", 0.0],
    ["AR", -1.0]
  ]
}
```
- `error`/`error_msg`, `warning_msg`, `min`/`max` + `currency` (chaos/divine/exalted), `pred_confidence_score` (0–100), and `pred_explanation` = array of `[mod_text, weight]` **per-mod price-contribution** pairs (weights can be negative). The mod_text is normalized into pseudo-mods, mirroring §1b.

**Model:** trained on item-mod-text → price, emitting a **price range + per-mod weights + confidence** — consistent with a feature-attribution regression (not generative). Exact architecture is **not public** (code closed; their Patreon API doc returns 403). Community consensus: decent for common/mid rares, **undervalues high-end / rare-mod items**; the site historically shows a separate "Recommended Price" (comparable-based) that users trust more than the ML number.

**PoE2 support: none found — treat as PoE1-only** as of mid-2026. All working league strings are PoE1 (Standard, Hardcore, …). No PoE2 league confirmed to return a valid response.

**Limits/accuracy:** no published rate limits; the service is slow/flaky under load (timeouts widely reported). **As a fallback for us it's only viable if/when they add PoE2 leagues** — until then it cannot price PoE2 items at all. Even then, cache hard and treat `pred_confidence_score` as the only quality gate.

---

## 3. PoE2 trade2 API specifics

**Endpoints:**
- Search: `POST https://www.pathofexile.com/api/trade2/search/{league}` → `{ id: queryId, result: [hashIds...], total }`.
- Fetch:  `GET  https://www.pathofexile.com/api/trade2/fetch/{id1,id2,...}?query={queryId}` → full listing objects (price, account, online status, `indexed` timestamp, item mods + `extended.hashes`).
- Stat catalog: `GET https://www.pathofexile.com/api/trade2/data/stats` → the `explicit.stat_XXXX` / `pseudo.*` ID catalog (this is what EE2's `dataParser` consumes).
- Item/category catalog: `.../api/trade2/data/items`.

**Search stat filter format** (exactly as §1d): `query.stats` is an array of groups, each `{ type: "and" | "count" | "if" | "not", value?: {min,max}, filters: [{ id, value: {min,max}, disabled }] }`. The dominant pattern is one `type:"and"` group of `{id, value:{min,max}}` entries.

**Rate limits — dynamic, header-driven (must parse, do not hardcode).** Every response carries:
- `X-Rate-Limit-Rules` (which buckets apply: `ip`/`account`/`client`),
- `X-Rate-Limit-<rule>` = `max:window_seconds:timeout` (possibly several comma-separated tiers),
- `X-Rate-Limit-<rule>-State` = current usage,
- `Retry-After` on 429.

EE2 starts conservative (`new RateLimiter(1, 5)` = 1 req / 5 s for SEARCH, EXCHANGE, FETCH) and then **rewrites its limiters from the server headers** (`adjustRateLimits()` in `trade/common.ts`). Community-reported real trade numbers (PoE1/general; **verify live for trade2**): search ≈ 5/12 s, 15/62 s, 30/302 s; fetch ≈ 12/6 s, 16/14 s. Exceeding → temporary IP lockout (~15–30 min). Search is the bottleneck.

**PoE2 gotchas vs PoE1:**
- Base path is `/api/trade2/` not `/api/trade/`.
- Requires a realistic User-Agent and generally a **POESESSID cookie**; datacenter IPs get challenged → use a residential IP (matches the project's local-only deploy note).
- **No public stash-tab stream for PoE2** (official docs: "Public Stashes (PoE1 only)"). The PoE1 firehose `/api/public-stash-tabs` has **no PoE2 equivalent**. Consequence below.
- Stat filters in PoE2 are somewhat sparser than PoE1, but the key pseudos (total ele res, total life, attributes) exist.
- Fetch batch size: PoE1 convention is **10 ids/call**; not authoritatively confirmed for trade2 (one community example used larger slices). Use 10 to be safe.

---

## 4. Autonomous scanning to build a price dataset

**Hard constraint: with no PoE2 public-stash API, the *only* data source is the rate-limited trade2 search/fetch API.** You cannot stream the economy; you must poll targeted searches. Every PoE2 tool lives with this.

How the existing tools cope:
- **poe2scout** (`api.poe2scout.com`, ~2 req/s, Cloudflare-fronted): worker services poll the official trade API and log prices — but **only for currency and uniques**; rare-gear-by-mod searches return empty. Not a model for rare valuation, but a fine free source for currency/unique reference prices.
- **StashSage** (`rheinze08.github.io/StashSage`): the closest prior art to our goal. Scrapes the **official trade API using the user's own session**, with **≥ 300 s between searches** (their own guidance). Trains **XGBoost and KNN** models over (base + mod-feature) vectors, **retrained every few days** and posted for download; prediction via a Discord bot, all local. They are explicit that the data is **noisy** ("expensive listings linger, good deals disappear → raw trade results are biased upward") and that they **drop corrupted/fractured/desecrated/special mods**.

**Rotation strategy to build a DB without tripping limits:**
- Maintain a queue of `(category, mod-signature)` search templates — one template per item archetype you care about (e.g. "rare gloves with life + 2 res", "rare wand with +spell levels"). Mod-signature = sorted set of the curated stat `ref`s present (or their pseudo group), **not** exact rolls.
- Round-robin the queue, one **search** per slot at the slowest server-advertised window (parse `X-Rate-Limit-*`; budget ~one search / 12–60 s, well under the cap). Batch **fetch** result ids 10 at a time.
- For each fetched listing, store: base type, parsed pseudo + explicit rolls, price (normalized to chaos/exalt/divine via a currency table), seller online status, and the **`indexed` timestamp**.
- **Dedup + dwell-time signals:** key snapshots by listing id; a listing that *disappears* between polls = likely sold → its price is a real transaction signal (a "good deal that vanished"). Listings that **persist across many polls** at a high price = overpriced lingering inventory; discount their weight. This recovers the "what actually sells" signal that raw asking-prices lack. Online-only + price-asc + `indexed` age are the freshness filters.

There is no public PoE2 "river of stash tabs" dataset to download; community price DBs (poe.ninja, poe2scout) are themselves built by polling trade and are limited to currency/uniques.

---

## 5. ML angle — what actually works vs overkill

Ranked by real-world trust:

1. **Nearest-neighbor / comparable trade search (a)** — the workhorse. Awakened PoE Trade, Exiled Exchange 2, and StashSage's KNN model are all this idea: vectorize the item's mods (pseudo-grouped), find listings/training-rows with the same mod signature and similar rolls, read the price distribution. **No model drift, always current, interpretable.** Best ratio of accuracy to maintenance. This is what experienced players trust for rares.
2. **Gradient-boosting regression on mod features (b)** — poeprices.info and StashSage's XGBoost model. Outputs a price range + interpretable per-mod weights. Good for common/mid rares; **systematically undervalues high-end and rare-mod items**; sensitive to noisy unsold-listing training data; needs retraining every few days as the economy shifts.
3. **Embeddings / neural nets (c)** — hobby projects exist (`github.com/johanmodin/poe-neural-pricer`, gradientof.me PoE pricer) but **none became a trusted production tool.** League/patch volatility makes heavy models go stale fast. **Overkill.**

Honest take for us: **comparable-listing search is the right default** — it sidesteps the no-stash-API problem (you only query the few archetypes you watch, not the whole economy) and needs zero training. Optionally layer a **KNN/XGBoost model over your own scraped (base + mod-signature) DB**, retrained on a cron every few days, as a *second opinion* for items with thin live comparables. Do **not** build a generative-LLM or embedding pricer — no successful PoE tool does, and the maintenance cost isn't worth it.

Known-fragile facts to design around: training on **unsold listings biases prices high** (good deals already sold); models routinely **ignore corrupted/fractured/desecrated/special mods**; T1 high-end items have **too few comparables** for any model → fall back to manual/cheapest-online and flag low confidence.

---

## 6. Recommended valuation pipeline for OUR tool

Input: clipboard item text (or stash-read item) → Output: estimated value + snipe verdict.

1. **Parse mod text → stats** — port EE2's approach: ship the trade2 `data/stats` catalog as a local NDJSON index (regenerate periodically from `https://www.pathofexile.com/api/trade2/data/stats`). For each mod line, strip reminder text, placeholder-substitute the numbers, look up the curated stat → get `trade.ids` (per mod type) + parsed roll (value + min/max bounds from the advanced-mod hint).

2. **Pseudo-group** — apply a `PSEUDO_RULES` table (copy EE2's): sum fire/cold/lightning into `pseudo.pseudo_total_elemental_resistance`, life + ½·Str into `pseudo.pseudo_total_life`, attributes, total ES, etc., each source weighted by its `multiplier`. These pseudo IDs are trade2-native.

3. **Pick searchable mods** — keep pseudos always; keep explicits only on rares with < 5 mods or only tier ≤ 2 rolls; drop chaff. Build the **mod-signature** = sorted set of kept stat refs (this is the DB key, rolls excluded).

4. **Build relaxed comparable search** — `POST /api/trade2/search/{league}` with `sort: price asc`, `status: online`, `trade_filters.indexed` recent, and `query.stats[0] = {type:"and", filters: [{id, value:{min}}]}` where each `min = percentRoll(roll.value, -RANGE)` (start RANGE ≈ 10–15% to get enough comparables; tighten if too many, widen if zero). Add `type_filters.category` from the category map, `rarity: rare`, `ilvl.min`, and `misc_filters` to exclude mirrored/corrupted unless relevant.

5. **Fetch + value** — `GET /api/trade2/fetch/{ids}?query={queryId}` in batches of 10. Normalize each price to a base currency (chaos or exalt) via a currency-rate table (reuse the project's poe.ninja rates). Compute a **robust central value = median of the top-N (e.g. 10) cheapest *online* comparables**, discard obvious outliers, and record sample size + spread as a **confidence** signal.

6. **Snipe verdict** — the live listing you're evaluating is a snipe if `listing_price ≤ value × snipe_threshold` (e.g. ≤ 60%) AND `comparable_count ≥ min_samples` AND the listing is **freshly `indexed`** (age < a few minutes). Low sample count → downgrade confidence, don't fire.

7. **Rate-limit discipline** — one shared limiter set rebuilt from `X-Rate-Limit-*` response headers (port EE2's `adjustRateLimits`); start at 1 search / ~12 s; back off on 429 via `Retry-After`. Cache search+fetch results (EE2 caches per request body).

8. **Optional second opinion** — passively log every fetched comparable into a local SQLite `price_observations(base, mod_signature, roll_vector, price_chaos, online, indexed_at, seen_at, last_seen_at)`. Use disappearance-between-polls as a "sold" signal. Once enough rows accumulate per signature, train a **KNN or XGBoost** model (retrain on a cron every few days) to value archetypes with thin live comparables. Skip this until the comparable-search path works.

9. **poeprices fallback** — only wire it in **if** poeprices.info adds PoE2 leagues (`GET /api/?l={poe2_league}&i={base64}&w=1`). Until then it's PoE1-only and useless for PoE2 items.

---

## Source URLs

- Exiled Exchange 2 source (branch `dev`): https://github.com/Kvan7/Exiled-Exchange-2 — files: `renderer/src/parser/stat-translations.ts`, `renderer/src/web/price-check/filters/create-stat-filters.ts`, `.../filters/pseudo/index.ts`, `.../filters/util.ts`, `.../trade/pathofexile-trade.ts`, `.../trade/common.ts`, `dataParser/src/providers/trade_api.py`, `renderer/public/data/en/stats.ndjson`
- Awakened PoE Trade (upstream): https://github.com/SnosMe/awakened-poe-trade
- poeprices.info: https://www.poeprices.info/ , https://www.poeprices.info/dashboard , live API `https://www.poeprices.info/api?l=Standard&i={base64}&w=1`
- poeprices accuracy/limitations: https://github.com/PoE-TradeMacro/POE-TradeMacro/issues/761 , https://www.pathofexile.com/forum/view-thread/1991004
- Official PoE developer docs (rate-limit headers, "Public Stashes PoE1 only"): https://www.pathofexile.com/developer/docs , https://www.pathofexile.com/developer/docs/reference
- Trade rate-limit numbers (community): https://www.pathofexile.com/forum/view-thread/3056323
- PoE2 trade system (endpoints): https://deepwiki.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/5.1-trade-system
- poe2scout: https://github.com/poe2scout/poe2scout , https://deepwiki.com/poe2scout/poe2scout , https://api.poe2scout.com/swagger
- StashSage (PoE2 ML pricer, XGBoost + KNN, scrapes trade): https://rheinze08.github.io/StashSage/
- ML pricer experiments: https://github.com/johanmodin/poe-neural-pricer , https://gradientof.me/projects/poeproj/
