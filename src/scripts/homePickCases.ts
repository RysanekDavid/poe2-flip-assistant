/*
 * Home's live lines, run by testNavIa.ts: each picker quotes only fields its API returns, picks the
 * same row the page would put first, and says plainly why when there is nothing to show.
 */
import assert from "node:assert/strict";
import { craftPicksSchema, hottestStrategy, pickCraft, pickFlip, pickNetWorth, pickOpportunity, pickPatch, pickStrategy, type HomePick } from "../components/home/homePicks";
import { buildStrategyViews } from "../core/strategies/board";
import { loadStrategies } from "../core/strategies/load";
import type { Candidate } from "../lib/discoverContract";
import type { OpportunitiesResponse, RisingUnique } from "../lib/opportunitiesContract";
import type { PatchListItem } from "../lib/patchesContract";

const ok = (p: HomePick): Extract<HomePick, { kind: "ok" }> => {
  if (p.kind !== "ok") throw new Error(`expected a pick, got: ${p.text}`);
  return p;
};

function candidate(over: Partial<Candidate>): Candidate {
  const leg = { amount: 1, unit: "DIVINE" as const };
  return {
    source: "cx", edgePct: 3, ranked: true, edgeKind: "cross", edgeLatestPct: 3, edgeMedian24Pct: 3, band: null, persistence6: 5,
    persistence24: 18, liquidityTier: "safe", slowerLegDivPerHour: 10, timeToSellHint: null, feeGold: null, feeDiv: null, feeComplete: true,
    legsHour: null, cxIssue: null, cxRawNetPct: null, flowObserved: true, itemId: "x", item: "X", category: "Currency", icon: null,
    buyExalt: 1, sellChaos: 1, buyDisp: leg, sellDisp: leg, marketBuyDisp: leg, marketSellDisp: leg, mode: "RECO", marginPct: 3,
    midDivine: 1, volume: 100, change7d: null, change24h: null, spark: null, profitChaos: 0, profitDiv: 0, throughputDivDay: 1,
    oscScore: 0, worthScore: 50, liveVsNinjaPct: null, risk: null, stable: true, ...over,
  };
}

function testStrategyPick(): void {
  const views = buildStrategyViews(loadStrategies(), "Forbidden Rites", new Map(), Date.now());
  assert.equal(pickStrategy({ strategies: views }, () => null).kind, "empty", "no prices → no hot strategy, never a made-up one");
  const [a, b, c] = views;
  if (!a || !b || !c) throw new Error("need three curated strategies");
  const trended = [
    { ...a, trend: { change7d: 4, counted: 2, total: 3 } },
    { ...b, trend: { change7d: 18, counted: 1, total: 2 } },
    { ...c, trend: { change7d: -30, counted: 1, total: 1 } },
  ];
  assert.equal(hottestStrategy({ strategies: trended })?.id, b.id, "the biggest 7-day rise wins");
  const pick = ok(pickStrategy({ strategies: trended }, (s) => `art:${s.id}`));
  assert.equal(pick.text, b.title);
  assert.equal(pick.detail, "drops +18% in price this week");
  assert.equal(pick.href, `?tab=farm&tool=strategies&strategy=${b.id}`, "opens that strategy's drawer");
  assert.equal(pick.art, `art:${b.id}`);
  const flat = trended.map((s) => ({ ...s, trend: { change7d: 0.4, counted: 1, total: 1 } }));
  assert.equal(pickStrategy({ strategies: flat }, () => null).kind, "empty", "a flat week is not hot");
}

function testFlipPick(): void {
  const rows = [
    candidate({ item: "Unranked", ranked: false, worthScore: 99 }),
    candidate({ item: "Falling", risk: "DECLINE", worthScore: 98 }),
    candidate({ item: "Estimate", source: "estimated", worthScore: 97 }),
    candidate({ item: "Second", worthScore: 60 }),
    candidate({ item: "Best", worthScore: 70, edgePct: 4.123, persistence6: 6, icon: "https://web.poecdn.com/x.png" }),
  ];
  const pick = ok(pickFlip({ candidates: rows }));
  assert.equal(pick.text, "Best", "only ranked, observed, not-falling rows; then the top score");
  assert.equal(pick.detail, "net edge +4.1% · held 6/6 h");
  assert.equal(pick.href, "?tab=flips");
  assert.deepEqual(pickFlip({ candidates: rows.slice(0, 3) }), { kind: "empty", text: "No exchange flip clears the safety bar right now." });
  assert.deepEqual(
    pickFlip({ candidates: [], note: "no exalt/chaos price yet — poll first" }),
    { kind: "empty", text: "Exchange rates are not loaded yet, so there is no flip to rank — check back soon." },
    "the API's operator note becomes player wording",
  );
}

function rising(name: string): RisingUnique {
  return { id: "1", name, base: "Ring", icon: null, valueDiv: 3, valueSource: "scout", priceChangePct: 12.5, listedThen: 40, listedNow: 25, spark: [1, 2], points: 6, newestAt: "2026-10-01T10:00:00.000Z" };
}

function testOpportunityPick(): void {
  const snipes: OpportunitiesResponse["snipes"] = { cards: [], nearMisses: [], overBudget: 0, scannerEnabled: true, reportError: null };
  const risingOk = (items: RisingUnique[]): OpportunitiesResponse["rising"] => ({ status: "ok", items, overBudget: 0, newestPointAt: null, emptyReason: items.length ? null : "none" });
  const pick = ok(pickOpportunity({ snipes, rising: risingOk([rising("Ventor's Gamble"), rising("Other")]) }));
  assert.equal(pick.text, "Rising: Ventor's Gamble");
  assert.equal(pick.detail, "price +12.5% · listings 40 → 25", "listings, never called sales");
  assert.equal(pick.href, "?tab=trade&tool=opportunities");
  assert.equal(pickOpportunity({ snipes, rising: risingOk([]) }).kind, "empty");
  assert.equal(pickOpportunity({ snipes, rising: { status: "error", error: "scout down" } }).kind, "empty");
}

function patch(title: string): PatchListItem {
  return { threadId: 1, title, versionText: "0.5.5b", publishedAt: null, publishedText: "Sep 30", sourceUrl: "https://www.pathofexile.com/forum/view-thread/1", bodyValid: true, review: null, summary: null };
}

function testSmallPicks(): void {
  const p = ok(pickPatch({ patches: [patch("0.5.5b Hotfix 2"), patch("older")] }));
  assert.deepEqual([p.text, p.detail, p.href], ["0.5.5b Hotfix 2", "latest patch · Sep 30", "?tab=learn&tool=patches"]);
  assert.equal(pickPatch({ patches: [] }).kind, "empty");
  assert.equal(pickNetWorth({ netWorthDiv: null, change24hPct: null }).kind, "empty", "no read yet → say so, never 0");
  const nw = ok(pickNetWorth({ netWorthDiv: 1234.4, change24hPct: -2.25 }));
  assert.deepEqual([nw.text, nw.detail, nw.href], ["Net worth 1,234 Div", "from your last stash read · −2.3% in 24 h", "?tab=stash&tool=worth"]);
  const craft = craftPicksSchema.parse({
    exaltPerDivine: 400,
    recipes: [{ key: "a", label: "Unpriced", report: null }, { key: "b", label: "Jewel slam", report: { evDiv: 0.5 } }],
    rank: { picks: ["a", "b"] },
  });
  const cp = ok(pickCraft(craft));
  assert.deepEqual([cp.text, cp.detail], ["Jewel slam", "modelled +200 ex per attempt"], "the first ranked pick that has a priced report");
  assert.equal(pickCraft({ ...craft, rank: { picks: [] } }).kind, "empty");
  assert.throws(() => pickCraft({ ...craft, error: "scan failed" }), /scan failed/, "a failed scan is an error, not 'nothing pays'");
}

export function runHomePickCases(): void {
  testStrategyPick();
  testFlipPick();
  testOpportunityPick();
  testSmallPicks();
  console.log("PASS  Home picks: hottest strategy (rising only), top ranked flip, snipe/rising unique, newest patch, net worth, top craft — honest empties");
}
