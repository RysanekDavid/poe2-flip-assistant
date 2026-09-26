# Flip + snipe subsystem audit — 2026-09-25 (master @ 941d1a4)

Adversarial read-only audit. Tests green (test:auto-snipe 27/27, test:valuation 15/15) but none
exercise the failing production paths.

## Verdicts

| Feature | Verdict | Why |
|---|---|---|
| Auto-snipe | **BROKEN** | 84/109 historical SNIPE alerts are "0 vs ~N Div" bait; ranking `score/div` makes 1-ex listings win; no ask floor; cheapest-first stale sampling; hourly re-alerts; last scan resolved zero mods on 13/13 archetypes |
| Hunts | feed WORKS-WITH-CAVEATS / snipe verdict **MISLEADING** | poll-diff feed sound; bolted-on price-book verdict uses base-collapsed signature, ceiling-biased distribution, no floor |
| Top Flips | **MISLEADING** | RECO margin = lookup on volume → Score ≈ volume rank; Div/day unit error; no fee/fill/spread band |
| Trend signals | WORKS-WITH-CAVEATS | correct per spec; level-triggered spam (44× one item in 4 days); BUY chases momentum |
| FarmAdvisor | WORKS-WITH-CAVEATS | honest "what pumped" board, lagging, fixed thresholds |

## Root cause of "SNIPE Apocalypse Grasp 100% under market — 0 vs ~2 Div (1111 samples)"

`huntEngine.ts:64-88`: hunt listing (under the hunt's own maxPrice ceiling) → `toDivine` of a
1-ex or amount-0 ask → written into the price book → verdict reads the book incl. itself →
`priceBook.ts:93-94` discount ≈ 100%, `isSnipe` true, no floor, freshness gate applied only after
the alert → `toFixed(0)` prints "0". "1111 samples" = empty mod signature `"<base>|"`: mods are not
reaching the signature (196/196 local price_book_obs rows empty-mod; broke between mid-July and
late August with no resolver code change) so every listing of that base lands in one bucket.

## Top findings

- BUG `huntEngine.ts:74-88` — no ask floor / freshness gate / zero-mod guard on snipe verdict.
- BUG `huntEngine.ts:75`, `tradeClient.ts:144-153` — mods empty in production; book silently
  records `"base|"`.
- BUG `huntEngine.ts:65` — book fed with hunt results pre-filtered by the hunt's price ceiling.
- BUG `autoSnipe.ts:152-159`, `env.ts:102` — rank = score/div; `minCandidateDiv` default 0
  (design note said 2).
- BUG `snipeProfiles.ts:170`, `autoSnipe.ts:185` — archetype searches price-asc, no
  indexedWindow → same stale bait every scan.
- BUG `tradeClient.ts:135` — accepts `amount: 0`.
- BUG `alertEngine.ts:43` — 60-min cooldown dedupe → same bait re-alerts hourly (Sol Trail ×12).
- BUG `flipModel.ts:162-163` — throughput = per-unit profit × Div-denominated volume (unit error).
- BUG `comparableValuation.ts:113` — corrupted/ilvl/mirrored hardcoded away.
- RISK hunts/autosnipe `await fetchScout()` first → scout outage kills all hunts; should use
  resolveRates.
- RISK trade2: fixed 6s limiter, no header-driven limits, no 429 backoff, second limiter in web
  process; autosnipe starves hunts; no in-flight guard.
- RISK comparable value = median of 10 cheapest asks incl. candidate + bait, no trimming.
- RISK RECO margin synthetic; CX digest per-pair band unused beyond the 3 base pairs.
- RISK `/api/hunts` POST no zod; malformed hunt fails forever silently.
- RISK TREND/SPIKE level-triggered; alerts route ignores viewer league.
- WEAKNESS two incompatible signature key spaces in one price-book table.
- STANDARD queries.ts 638, HuntPanel 609, FlipDetailCard 512 lines; scoreItem/scanHunt/poller
  start > 60-line functions; silent `.catch(() => {})` in poller.

## Five highest-leverage improvements (auditor's ranking)

1. Gate every SNIPE alert: ask > 0 and ≥ max(0.02 Div, 5% of value); ≥2 resolved mods; fresh;
   once per listingId ever; sub-Div asks rendered in ex.
2. Fix mod capture with a real trade2 fetch fixture; fail loud on zero-mod listings; disable book
   writes until green.
3. Re-aim autosnipe at fresh listings (indexed desc, 1day), rank by desirability with a floor,
   unify on rollSignature, carry corrupted/ilvl/mirrored.
4. Replace synthetic RECO margin with the CX digest band; fix throughput unit.
5. Single trade2 limiter owner (poller flag pattern), header-driven limits, 429 backoff, in-flight
   guard, resolveRates instead of scout.

See also: docs/research/poe2-flip-snipe-competitors.md.
