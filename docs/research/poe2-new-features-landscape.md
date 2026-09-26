# PoE2 new-feature landscape — research 2026-09-26

Tags: [verified-primary] / [verified-secondary] / [single-source] / [unresolved].
Companion to poe2-flip-snipe-competitors.md and flip-snipe-audit-2026-09-25.md.

## Gaps nobody fills (our opening)

- **Measured farming return.** Exiled Tools /farming uses hand-written anchors ("exact drop rates
  are not public"); PoE2 stash trackers are dead (DillaPoE2Stat: "GGG has disabled inventory API
  access"; PoeStash "waiting for GGG"; Exilence CE doesn't mention PoE2). [verified-primary]
- **Patch → price effects.** Patch-note tools only colour-code text; nobody links changes to prices.
- **Craft odds.** PoE2 mod weights are NOT in game files (poe2db, Craft of Exile) [verified-primary];
  RePoE spawn_weights = eligibility, not probabilities [unresolved]. Nobody validates odds against
  real results. Recombinator removed in 0.5.0.

## Key facts

- Client.txt reading allowed "as long as the user is aware" [verified-primary]. Gives areas, time,
  deaths — not loot.
- PoE2 APIs: characters only; account/guild/public-stash PoE1-only; OAuth applications closed.
- 1.0 launches 2026-12-11 (GGG thread 3999366). Forbidden Rites economy separate.
- CX digest can be paged back from hour 0 → league-lifecycle backfill possible; depth [unresolved].
- 0.5.5: Breach tablet 1–2 extra rares; Trial of Chaos 30 rooms resumable; Expedition tablets stack 4.
  Farm rankings conflict across guides (single-source each).
- Div/hr claims are ceilings; costs (maps, tablets, deaths) ignored; no sample sizes.
- Discord webhook tools common (POE2-Price-Oracle edits one message hourly to avoid spam).
- FilterBlade dominates filters — don't clone.

## Ranked feature ideas

| # | Feature | Data | Feasible | Effort |
|---|---|---|---|---|
| 1 | Farm Strategy Scorer v2 — drop basket × CX prices × liquidity − live input costs, sell-through time (replaces FarmAdvisor heat) | CX, ninja, trade2 | ✅ | M |
| 2 | Measured session ledger — browser-local Client.txt parse + start/end holdings → measured div/hr, calibrates #1 | Client.txt, CX, listings | ⚠️ loot delta manual | L |
| 3 | Recommendation scorecard — outcome of every flip/snipe/farm/sell call, per-signal hit rate | positions, trade log, CX | ✅ | M |
| 4 | Patch-impact event study — patch → mapped items → 24h/72h/7d moves, "likely affected" alerts | patchNotes ingest + CX/ninja | ✅ (mapping ⚠️) | M |
| 5 | League-lifecycle curves + 1.0 playbook — CX backfill of past league starts, day-N paths | CX backfill | ✅ (depth ⚠️) | M |
| 6 | Sell-now advisor for holdings — N-day high / rolling over / thin → sell now + limit price + ETA | CX, ninja, listings | ✅ | M |
| 7 | Discord digest webhook — one board edited in place + per-user routed event alerts, mutes | alert engine | ✅ | S |
| 8 | Tablet/waystone valuation + roll-or-sell EV | trade2, CX | ⚠️ rate budget | M |
| 9 | Price-driven stash regex — "worth > X now" regex from live prices | #8, ninja, scout | ✅ | S–M |
| 10 | Empirical craft calibration — group's logged attempts → observed vs model hit rate + CI | craft logs | ⚠️ small n | M |
| 11 | Craft vs buy verdict | craft calc, trade2 | ⚠️ | M |
| 12 | Bulk-sell message builder (TFT-style) | CX, ninja | ✅ | S |
| 13 | Group leaderboard + shared watchlists/projects | per-user tables | ✅ | S–M |
| 14 | Whisper relay to Discord via browser File System Access | Client.txt | ⚠️ tab must stay open | M |

Not recommended: loot-filter generator, regex/CoE clones, OAuth stash tracking, PoB-style build
tools, anything acting in game.

## ToS note

trade2 and POESESSID account search are undocumented endpoints (GGG ToS 7i); shared ecosystem
risk, but don't make new features load-bearing on them without need.

## Sources (accessed 2026-09-26)

pathofexile.com/developer/docs (+/reference) · forum 4000864, 3999366 · craftofexile.com/weightings?game=poe2 ·
poe2db.tw · repoe-fork.github.io/poe2 · github.com/Dboire9/POE2_HTC · timesaver.gg (crafting, 50 div/hr,
1.0 guide) · exiledtools.com/farming · github.com/DoofDilla/dillapoe2stat · github.com/exilence-ce/exilence-ce ·
github.com/ugimser/mapwatch · igodspy.github.io/PoE2MT · poeregex.cz/poe2 · poe2.re ·
github.com/NeverSinkDev/NeverSink-Filter-for-PoE2 · github.com/eason1305/POE2-Price-Oracle ·
github.com/ImpliedThreat/GigaTrade-PoE2 · maxroll.gg (waystones, 1.0 date)
