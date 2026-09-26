# PoE2 primary data sources vs poe.ninja — research 2026-09-25

Question: poe.ninja gets its data from somewhere — can we go to the primary source instead of
consuming it second-hand? All claims web-verified 2026-09-25. Tags: [verified-primary],
[verified-secondary], [single-source], [unresolved].

## Bottom line

For PoE2 there is almost nothing more primary left to reach:

- poe.ninja's PoE2 economy = GGG public Currency Exchange digest (we already ingest it) + the
  trade2 search API (we already query it). [verified-primary: ninja posts 2025-09-01, 2026-05-14]
- GGG publishes **no Public Stash API stream for PoE2** — docs list it "(PoE1 only)".
  [verified-primary]
- GGG OAuth applications are **closed**: "We are currently unable to process new applications."
  [verified-primary: developer docs]
- Builds: no compliant path to ninja-quality PoE2 build meta. Ladder API = top 1000, no gear,
  confidential client required (closed). ninja's builds API is "internal … not available for
  third-party use". [verified-primary]

## Source table

| Source | Endpoint | Auth | PoE2 | Cadence | Notes |
|---|---|---|---|---|---|
| GGG CX digest | `web.poecdn.com/api/currency-exchange/poe2/{unixHour}` | none | yes | hourly, past hours only | real traded volume + ratio band per pair; **ingested** |
| GGG Public Stash API | `/public-stash-tabs[/<realm>]` | `service:psapi`, confidential | **no** | stream | PoE1 only |
| GGG Leagues | `/league?realm=poe2` | `service:leagues`, confidential | yes | on demand | unauth `/leagues?realm=poe2` returns PoE1 |
| GGG Ladder | `/league/<l>/ladder?realm=poe2` | `service:leagues:ladder`, confidential | partial (top 1000) | on demand | no gear/skills/passives |
| GGG Account Characters | `/character/poe2` | `account:characters`, auth-code | yes | on demand | consenting user's own characters only |
| trade2 | `/api/trade2/search\|fetch/poe2/...` | none | yes | live | not in developer docs; widely tolerated (ninja, scout, overlays) [unresolved formally] |
| ninja economy | `/poe2/api/economy/exchange/current/overview`, `/poe2/api/economy/stash/current/item/overview` (Unique* types) | none | yes | ~hourly | supported surface; wants descriptive User-Agent with contact |
| ninja builds/profiles | e.g. `/poe2/api/data/build-index-state` | — | — | — | **internal, not for third-party use** |
| poe2scout | `api.poe2scout.com` | none | yes | 1–5 min | MIT source; uniques = single cheapest instant-buyout listing |

## Upstream map

- **ninja PoE2 currency/exchange** ← GGG CX digest.
- **ninja PoE2 uniques** ← trade2 ("There is no River API for Path of Exile 2 yet, so prices are
  estimated from the official trade API"). Estimation method unpublished.
- **ninja PoE2 builds** ← GGG ladder (top 1000) + opt-in OAuth `account:characters`. How gear is
  obtained for non-connected ladder characters is undocumented [unresolved].
- **poe2scout currency** ← same CX digest (no auth). **poe2scout uniques** ← trade2, status
  `securable`, not corrupted, sort price asc, stores `prices[0]` (cheapest single listing), no
  median, no outlier filter.

## What going primary gains us

| Need | Primary option | Gain | Blocker |
|---|---|---|---|
| Currency | CX digest (done) | real volume + low/high band vs ninja's single mid | none |
| Uniques | own trade2 searches | median of N instant-buyout listings, outlier trimming — strictly better than scout's cheapest listing | per-IP rate limits; asks ≠ sales |
| Rares / snipes | trade2 comparable pipeline (done) | nothing to replace — no aggregator prices rares | — |
| Market-wide stream | Public Stash API | — | does not exist for PoE2 |
| Builds meta | ladder + opted-in characters | top-1000 class distribution only | applications closed; needs a domain |

## Compliance issues found in our code

- `src/scripts/scrapeBuilds.ts` calls ninja's internal `build-index-state` and Playwright-scrapes
  `poe.ninja/poe2/builds` pages — outside ninja's supported surface.
- `src/api/ninjaClient.ts` sends a spoofed Chrome User-Agent; ninja asks for a descriptive
  User-Agent with contact. Whether an honest UA passes Cloudflare is untested [unresolved].

## OAuth (if GGG reopens applications)

Confidential client redirect URI must be HTTPS on a registered domain (no IPs/localhost);
User-Agent `OAuth {clientId}/{version} (contact: …)`; GGG non-affiliation disclaimer required;
dynamic rate limits, overuse revokes access. No data on approval time/odds.

## Key sources

- https://www.pathofexile.com/developer/docs (+ /reference, /authorization)
- https://poe.ninja/docs/api
- https://poe.ninja/posts/poe2-economy-and-rise-of-the-abyssal
- https://poe.ninja/posts/poe2-unique-items
- https://poe.ninja/posts/dawn-of-the-hunt
- https://github.com/poe2scout/poe2scout (PoeTradeClient.cs, PoeCurrencyExchangeClient.cs)
- https://www.pathofexile.com/forum/view-thread/3589365 (applications closed)
- https://www.pathofexile.com/forum/view-thread/3657474 ("2026 here, still no Stash API")
