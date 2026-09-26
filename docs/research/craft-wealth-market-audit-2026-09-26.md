# Craft / Wealth / Web Market audit — 2026-09-26 (master @ 941d1a4)

test:craft 24/24, test:valuation 15/15, test:db 10/10 PASS — none exercise the failing paths.
Local DB evidence: 13/14 recipe reports price base legs at 0.0004–0.007 Div and results at
0.002–0.03 Div; the only positive recipe (gloves +2, EV +83 Div, 502%) = 3 samples of 5 listings
at a 500 Div median — the only CRAFT_MARGIN alerts ever fired.

## Verdicts

| Feature | Verdict |
|---|---|
| Craft margin engine + Top Picks | **MISLEADING** (broken as a ranking) — both legs priced from 10 cheapest asks |
| Craft session wizard / guides | WORKS-WITH-CAVEATS — ≥4 content errors costing real currency |
| Craft P&L | MISLEADING — prefill writes junk base cost; hit+unsold shown as loss |
| Materials panel | WORKS (league mismatch vs margin panel) |
| hunt-preset | **BROKEN** — caps from junk floors, duplicate hunts |
| Craft Planner remnants + buildMeta scrape | **DEAD** — delete |
| Wealth | WORKS-WITH-CAVEATS; MISLEADING after league switch / >100 listings / rares at own asks |
| DemandBoard | WORKS-WITH-CAVEATS, labels MISLEADING ("Market" = cheapest ask, "Flow" = listing count) |
| /api/shop + ShoppingList | DEAD |

## Findings (abridged)

- BUG craftMargin.ts:114-133 — legs valued from 10 cheapest asks; robustValue can't drop bait
  when all 10 are bait → EV structurally negative; alert gate (≥3 samples, no listing floor)
  broadcasts whale-ask outliers (craftMargin.ts:229-234).
- BUG attempts prefill + hunt-preset use junk-floor prices; hunt-preset duplicates on click.
- BUG guide content: fracture needs ≥4 mods (gloves "~3 mods", amulet "3 prefixes 1-in-3");
  bow Amanamu suffix reveal told to pick prefixes; wand "Perfect-exalt" priced as regular exalt;
  Omen of Light described two incompatible ways (RePoE text: "Your next Annulment removes only a
  Desecrated modifier" → ring recipes budgeting 10× Light for reveal rerolls are wrong); Tul's
  2× vs 5×; Ancient-vs-Preserved rib reasoning; Astrid's "bench craft" PoE1 vocabulary; giga-Spirit
  multi-desecration loop contradicts 1-desecrated cap.
- BUG balance reads (getBalances/balanceStats/latestTabs/tabSeries) not league-scoped; silent
  `catch { otherDiv = 0 }` records fake dips; balanceBefore mixes manual/trade sources.
- BUG DemandBoard: `Quantity` = listing count labelled as trade flow, weighted 60% in Heat;
  scout CurrentPrice (cheapest ask) labelled "fair market value", shop snipe target 85% of floor.
- BUG computedLeague returned by routes but rendered by no component; Craft tab mixes default-
  league margins with viewer-league materials.
- RISK account scan truncated at 100 listings (price-asc drops expensive gear); rares valued at own
  asks; fetchScout hard dependency for craft + balance; craft attempts routes lack zod;
  5 identical /api/craft/margins polls per minute.
- DEAD: /api/craft/{targets,meta,mods,rolls,price,parse}, craft/{RollGuide,PasteRare,SearchCombo,
  LinkCard}, craftMeta.ts, craftTargets.ts, buildMeta.json, scrapeBuilds.ts + scrape:builds +
  playwright devDep, lib/fuzzy.ts, ShoppingList + /api/shop. Removing the ninja scrape (ToS)
  breaks nothing live.

## Top 5 fixes

1. Craft leg valuation: sample ≥40, absolute ask floor, result at p25–p40, base with roll mins;
   alerts/top picks require ≥8 listings and ≥5 samples; no prefill from failed legs.
2. Correct guide content against KB (list above).
3. Delete dead Craft Planner remnants, scrape, shop.
4. League-scope balance reads, remove silent catches, surface truncation, label gear "at your asks".
5. Relabel DemandBoard, fix Heat, render computedLeague everywhere; one league for the Craft tab.

## New feature ideas

CX-band material costs with thin-volume flags · result value via comparableValuation + paste
finished item → P&L · break-even hit rate instead of curated hitRate · material spike guard ·
RePoE tier/ilvl gate check in shopping step · "liquidate to Divine" ladder from own stash ·
mark-to-market of open craft attempts · undercut feed for uniques you hold.
