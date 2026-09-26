# PoE2 flip / snipe competitive landscape — research 2026-09-25

Tags: [verified-primary] / [verified-secondary] / [single-source] / [unresolved].

## Key conclusions

1. CX-digest-based competitors (poeregex.cz Flipper, poe2-arb, poe2flip.com, POE2 Overlay/VibeTools,
   Divine Tendies) converge on: **VWAP** = volume_traded[A]/volume_traded[B]; **pessimistic/
   optimistic band** from lowest_ratio/highest_ratio; **gold fee per item requested**;
   **liquidity cap = slower leg's hourly volume**; **persistence** = how many of the last N hours
   the edge held. ninja-fed tools only have mids + 7d change.
2. **No competitor tracks recommendation outcomes** (did the snipe resell, did the flip fill,
   time-to-sell). Clearest opening for our backend-evaluation direction.
3. GGG does not define lowest/highest_ratio semantics — treat as the hour's traded extremes, not a
   live bid/ask. Digest has no current-hour data. [verified-primary: GGG reference]

## Competitors (accessed 2026-09-25)

| Tool | PoE2 | Source | Key signal | Notes |
|---|---|---|---|---|
| poeregex.cz Flipper | yes | CX digest, last closed hour | Chaos→X→Div vs direct %, "směr 6/6 h" persistence | hides <5%; liquidity tiers ≥20k / 5–20k Chaos/h; **ignores gold fee** |
| poe2-arb (OSS) | yes | CX digest + per-item fee table | triangle loops, VWAP + conservative/optimistic, recurrence + median | fees Ex 120 / Chaos 160 / Div 800 gold [single-source] |
| poe2flip.com | yes | "official GGG API" | fee-aware flips + triangle arb, daily bands | JS-only, backend on demand |
| POE2 Overlay (VibeTools) | yes | CX + live trade order book + trade2 + poe2scout | arb % badge only if every leg tradable and ≥+2% | item floor = cheapest *genuine* comparable; OCR net worth |
| Exiled Tools | yes | poe.ninja + own history | spread, liquidity score, est. profit/100 (formula unpublished); Hold / Sell at market / Sell now | Busy/Steady/Quiet badge |
| Divine Tendies | PoE1+2 | CX hourly | cross-currency flips + vendor recipes | step-by-step playbook with P&L |
| poe.ninja PoE2 | yes | CX + trade2 | mids, 7d spark; PoE1 confidence tiers by listing count | — |
| poe2scout | yes | CX + trade2 | uniques = single cheapest instant-buyout listing | MIT, public API |
| Exiled Exchange 2 / Sidekick | yes | trade2 + ninja (+scout) | price-check overlays | Sidekick dropped CX-item trade in 2026.9.1 |
| poeprices.info | dead | — | — | domain for sale [single-source] |
| PoE2-Live-Search-Sniper | yes | trade2 + POESESSID | auto-clicks whisper | **ToS violation**, README admits ban risk |

## Methodology + traps

- CX is an order book with auto-matching; watch stock behind a ratio. Gold fee scales with number
  of items requested. [verified-secondary: Maxroll 2026-05-23, forum 3855933]
- Best edges: cross-market (buy in Ex, sell in Div). Rules of thumb: 5–15% spread, 50+ listings
  both sides, 24–48h stable; avoid league-mechanic farmed items mid-league. [single-source]
- Forbidden Rites = 0.5.5 event, 2026-09-04 → 2026-12-11 (1.0 launch). [verified-secondary]
- Snipe traps: price fixers/bait (ignore first 1–3 dramatically cheaper; bait lives mostly in
  whisper-only listings — gate on instant buyout `securable`), stale/AFK, joke bulk offers,
  wrong league, wrong currency, thin-market single-hour VWAP spikes, digest lag, tool moving its
  own market.
- ToS: macros one action per invocation, manual trigger only. Alert → copied whisper → user acts is
  compliant; auto-whisper is not. [verified-primary]

## Ranked feature ideas

| # | Feature | Source | Effort | Feasible |
|---|---|---|---|---|
| 1 | VWAP + traded band per CX pair (replace ninja mids) | poe2-arb | S | ✅ |
| 2 | Gold-fee-aware net margin in Div | poe2-arb, Maxroll | S | ✅ (confirm fees in-game) |
| 3 | Persistence score (last 6h/24h profitable, median) | poeregex, poe2-arb | S | ✅ |
| 4 | Cross-market + triangle route finder, capped by slowest leg | 4 competitors | M | ✅ |
| 5 | Snipe outcome tracking / realised ROI → alert quality score | nobody (gap) | M | ⚠️ delisted ≠ sold |
| 6 | Bait/staleness filter: instant-buyout only, trimmed low-5–10 floor | Exiled Tools, timesaver, VibeTools | S | ✅ |
| 7 | Time-to-sell / fill ETA from hourly volume, position cap | combined | S | ✅ (calibrate via #5) |
| 8 | Sell/Hold/Sell-now + limit-price suggestion for positions | Exiled Tools | S | ✅ |
| 9 | League-phase awareness (first 48–72h, crash-prone mechanic items) | Switchblade, Exiled Tools | S–M | ✅ |
| 10 | Current-hour check vs trade2 live bulk asks | VibeTools | M | ⚠️ rate budget |

Not recommended: auto-whisper/auto-travel (ToS), live-search websockets (POESESSID, 20 cap, low
value per owner), ML rare pricing (no trustworthy data).

## Sources

https://poeregex.cz/flipper · https://github.com/Sakuya398-Yamada/poe2-arb · https://poe2flip.com/ ·
https://github.com/POE2-VibeTools/poe2-currency-overlay · https://www.exiledtools.com/ ·
https://www.divinetendies.com/ · https://poe2scout.com/ · https://github.com/Kvan7/Exiled-Exchange-2 ·
https://github.com/Sidekick-Poe/Sidekick/releases · https://github.com/merlin293/PoE2-Live-Search-Sniper ·
https://maxroll.gg/poe2/resources/flipping-with-the-currency-exchange ·
https://maxroll.gg/poe2/resources/trade-in-path-of-exile-2 ·
https://www.switchbladegaming.com/path-of-exile-2/currency-exchange/ ·
https://timesaver.gg/blog/poe2-trade-guide · https://mobalytics.gg/poe-2/guides/forbidden-rites ·
https://www.pathofexile.com/developer/docs/reference
