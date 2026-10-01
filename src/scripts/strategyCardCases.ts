/*
 * Farm › Strategies card rules, run by testStrategies.ts: curated ratings carry a reason and a
 * source, the 7-day trend is a weighted price move (never 0% for "unknown"), the sort orders, the two
 * headline drops, the status chip and the Regex-tool link that opens with the waystone totals set.
 */
import assert from "node:assert/strict";
import { mechanicTrends } from "../core/strategies/board";
import { BUDGET_SCALE, RATING_SCALE, scaleText } from "../core/strategies/ratings";
import { BUDGET_TIERS, MECHANICS, RATING_MAX, RATING_MIN, ratingSchema, type FarmStrategy, type Mechanic } from "../core/strategies/schema";
import { basketTrend } from "../core/strategies/trend";
import type { StrategyView } from "../lib/strategiesContract";
import { decodeShare } from "../lib/tools/regexPoolContract";
import { fmtChange, sortStrategies, statusChip, topDrops, trendTone, waystoneRegexHref } from "../components/farm/strategies/strategyCards";

function testRatingsData(strategies: readonly FarmStrategy[]): void {
  for (const s of strategies) {
    assert.ok(s.budget.why.length > 0 && s.budget.claim.src.length > 0, `${s.id}: budget tier has a reason and a source`);
    for (const key of ["build", "complexity"] as const) {
      const r = s.ratings[key];
      if (r.value === null) continue;
      assert.ok(r.claim.src.length > 0, `${s.id}: ${key} ${r.value} cites a source`);
      assert.ok(scaleText(key, r.value).length > 0, `${s.id}: ${key} ${r.value} is a step of the scale`);
      assert.notEqual(r.claim.v, "vp", `${s.id}: a rating is our reading of the sources (syn), not a primary fact`);
    }
  }
  assert.deepEqual(Object.keys(BUDGET_SCALE), [...BUDGET_TIERS], "a budget scale line per tier");
  for (const scale of Object.values(RATING_SCALE)) assert.equal(Object.keys(scale).length, RATING_MAX - RATING_MIN + 1);
  const src = ["https://poe2db.tw/us/Ritual"];
  assert.equal(ratingSchema.safeParse({ value: 3, why: "x", claim: { v: "syn", src: [] } }).success, false, "a rated value needs a source");
  assert.equal(ratingSchema.safeParse({ value: null, why: "no source rates it", claim: { v: "uv", src: [], note: "unrated" } }).success, true, "unrated needs none");
  assert.equal(ratingSchema.safeParse({ value: 6, why: "x", claim: { v: "syn", src } }).success, false, "1–5 only");
  assert.equal(ratingSchema.safeParse({ value: 2.5, why: "x", claim: { v: "syn", src } }).success, false, "whole steps only");
  assert.throws(() => scaleText("build", 9), /no build scale step 9/);
  console.log("PASS  ratings: budget tier + build/complexity carry a reason and a source; 1–5 whole steps; unrated allowed without a source");
}

function testTrend(views: readonly StrategyView[], strategies: readonly FarmStrategy[]): void {
  assert.equal(basketTrend([]), null);
  assert.equal(basketTrend([{ div: 1, change7d: null, volume: 100 }]), null, "no 7-day change → no trend, never 0%");
  const mixed = basketTrend([
    { div: 10, change7d: 20, volume: 990 },
    { div: 1, change7d: -10, volume: 0 },
    { div: 0, change7d: 500, volume: 1000 },
  ]);
  assert.ok(mixed && mixed.counted === 2, "an unpriced item does not count");
  assert.ok(mixed && Math.abs(mixed.change7d - (20 * 30 - 10) / 31) < 1e-9, "weighted by value × log10(volume + 10)");
  const markets = new Map([["fracturing-orb", { div: 1.5, fetchedAt: "2026-09-29T11:30:00.000Z", change7d: -8, volume: 50 }]]);
  const rows = mechanicTrends(strategies, markets);
  assert.deepEqual(rows.map((r) => r.mechanic), [...new Set(strategies.flatMap((s) => s.mechanics))].sort((a, b) => order(a) - order(b)), "one row per covered mechanic, schema order");
  assert.equal(rows.find((r) => r.mechanic === "corruption")?.trend?.change7d, -8);
  assert.equal(rows.find((r) => r.mechanic === "breach")?.trend, null);
  assert.ok(views.length > 0);
  console.log("PASS  trend: weighted 7d move over priced drops, null when none is priced, one per mechanic");
}

const order = (m: Mechanic): number => MECHANICS.indexOf(m);

function testSortAndChips(views: readonly StrategyView[]): void {
  const withTrend = views.map((v, i) => ({ ...v, trend: i < 3 ? { change7d: i * 10 - 5, counted: 1, total: 1 } : null }));
  const hot = sortStrategies(withTrend, "hot").map((v) => v.trend?.change7d ?? null);
  assert.deepEqual(hot.slice(0, 3), [15, 5, -5], "hot: rising first");
  assert.ok(hot.slice(3).every((c) => c === null), "no trend sorts last");
  const cheap = sortStrategies(withTrend, "cheap").map((v) => BUDGET_TIERS.indexOf(v.budget.tier));
  assert.deepEqual(cheap, [...cheap].sort((a, b) => a - b), "cheapest tier first");
  const easy = sortStrategies(withTrend, "easy").map((v) => (v.ratings.build.value ?? 99) + (v.ratings.complexity.value ?? 99));
  assert.deepEqual(easy, [...easy].sort((a, b) => a - b), "lowest effort first");
  assert.notEqual(sortStrategies(withTrend, "hot"), withTrend, "never sorts in place");
  const ritual = views.find((v) => v.id === "ritual-omens");
  if (!ritual) throw new Error("ritual-omens missing");
  const drops = topDrops(ritual.yields);
  assert.equal(drops.shown[0]?.role, "primary", "main drop first");
  assert.equal(drops.shown.length + drops.more, ritual.yields.length);
  assert.deepEqual([fmtChange(12.4), fmtChange(-6.2), fmtChange(0.3)], ["+12%", "−6%", "0%"]);
  assert.deepEqual([trendTone(null), trendTone({ change7d: 0.5, counted: 1, total: 1 }), trendTone({ change7d: -3, counted: 1, total: 1 })], ["flat", "flat", "down"]);
  assert.equal(statusChip(ritual).text, "draft");
  assert.equal(statusChip({ ...ritual, status: "reviewed" }).text, "0.5.5 ✓");
  console.log("PASS  cards: hot / cheapest / easiest order, main drop first, change text, status chip");
}

function testRegexLink(): void {
  assert.equal(waystoneRegexHref([]), null, "no preferred total → no link");
  const href = waystoneRegexHref(["item_rarity", "pack_size"]);
  if (!href) throw new Error("expected a regex link");
  const params = new URLSearchParams(href.slice(1));
  assert.equal(params.get("tab"), "regex");
  assert.equal(params.get("tool"), "waystone");
  const selection = decodeShare(params.get("s") ?? "");
  assert.equal(selection.tab, "waystone");
  if (selection.tab !== "waystone") throw new Error("unreachable");
  assert.deepEqual(selection.props, { itemRarity: { min: 1, max: null }, packSize: { min: 1, max: null } }, "totals as 'has any', the player sets minimums");
  assert.deepEqual(selection.mods, {}, "no mod picked for the player");
  console.log("PASS  regex link: Regex › Waystone share code with the strategy's totals selected");
}

/** Every card rule against the committed strategies and their priced views. */
export function runStrategyCardCases(strategies: readonly FarmStrategy[], views: readonly StrategyView[]): void {
  testRatingsData(strategies);
  testTrend(views, strategies);
  testSortAndChips(views);
  testRegexLink();
}
