/*
 * Roll-and-sell and trade-method rules, run by testStrategies.ts: the live EV of a conversion
 * (priced only when every leg is), the Reforging Bench ladders as poe2db lists them, the views'
 * search links and prices, the card helpers, and the fact-check corrections the data must keep.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attemptCost, conversionLabel, evText, fmtSignedDivOrEx, ladderSummary, profitHeadline, rankConversions, RARITY_LABEL, SELL_UNIT_LABEL } from "../components/farm/strategies/kindHelpers";
import { buildStrategyViews, type YieldMarket } from "../core/strategies/board";
import { conversionEv, evMargin } from "../core/strategies/ev";
import { entityById } from "../core/entities/load";
import { STRATEGIES_DIR, strategiesOfKind } from "../core/strategies/load";
import { ITEM_RARITIES, SELL_UNITS, strategyRefs, type Strategy } from "../core/strategies/schema";
import { fmtDivOrEx } from "../lib/format";
import { viewsOfKind } from "../lib/strategiesContract";

function testEv(): void {
  const priced = conversionEv([{ name: "Lesser Iron Rune", qty: 3, div: 0.01 }], [{ name: "Iron Rune", qty: 1, div: 0.05 }]);
  assert.equal(priced.status, "priced");
  if (priced.status !== "priced") throw new Error("unreachable");
  assert.ok(Math.abs(priced.cost_div - 0.03) < 1e-12 && Math.abs(priced.ev_div - 0.02) < 1e-12, "EV = output − 3 × input");
  assert.ok(Math.abs((evMargin(priced) ?? 0) - 2 / 3) < 1e-12, "margin is EV over cost");
  const loss = conversionEv([{ name: "A", qty: 3, div: 1 }], [{ name: "B", qty: 1, div: 2 }]);
  assert.ok(loss.status === "priced" && loss.ev_div === -1, "a losing step is negative, not hidden");
  const unpriced = conversionEv([{ name: "A", qty: 3, div: null }], [{ name: "B", qty: 1, div: null }]);
  assert.deepEqual(unpriced, { status: "unpriced", missing: ["A", "B"] }, "every unpriced leg is named, inputs first");
  assert.deepEqual(conversionEv([{ name: "A", qty: 3, div: 0 }], [{ name: "B", qty: 1, div: 1 }]), { status: "unpriced", missing: ["A"] }, "0 is not a price");
  assert.equal(evMargin(unpriced), null);
  assert.throws(() => conversionEv([{ name: "A", qty: 0, div: 1 }], [{ name: "B", qty: 1, div: 1 }]), /quantity 0/);
  assert.throws(() => conversionEv([], [{ name: "B", qty: 1, div: 1 }]), /needs inputs and outputs/);
  console.log("PASS  EV: output − inputs at exchange prices; unpriced legs named, never counted as 0; bad quantities throw");
}

const EMOTIONS = ["Ire", "Guilt", "Greed", "Paranoia", "Envy", "Disgust", "Despair", "Fear", "Suffering", "Isolation"];
const RUNE_TYPES = ["Desert", "Glacial", "Storm", "Iron", "Body", "Mind", "Rebirth", "Inspiration", "Stone", "Vision", "Robust", "Adept", "Resolve", "Ward", "Charging"];

function testLadders(strategies: readonly Strategy[]): void {
  const bench = strategiesOfKind(strategies, "trade").find((s) => s.id === "reforging-bench-ladders");
  if (!bench) throw new Error("reforging-bench-ladders missing");
  const pairs = bench.price_refs.map((c) => {
    assert.equal(c.inputs.length, 1);
    assert.equal(c.outputs.length, 1);
    assert.deepEqual([c.inputs[0]?.qty, c.outputs[0]?.qty], [3, 1], "three into one");
    return [c.inputs[0]?.ref.name ?? "", c.outputs[0]?.ref.name ?? ""] as const;
  });
  const emotionPairs = pairs.filter(([from]) => from.includes("Liquid"));
  assert.deepEqual(emotionPairs.map(([from, to]) => [from.split(" ").at(-1), to.split(" ").at(-1)]), EMOTIONS.slice(0, -1).map((e, i) => [e, EMOTIONS[i + 1]]), "emotions step to the next one in poe2db's order");
  const runePairs = pairs.filter(([from]) => from.endsWith("Rune"));
  const expected = RUNE_TYPES.flatMap((t) => [[`Lesser ${t} Rune`, `${t} Rune`], [`${t} Rune`, `Greater ${t} Rune`]]);
  assert.deepEqual([...runePairs].map((p) => [...p]).sort(), expected.sort(), "every rune type: Lesser → normal → Greater, no Perfect step");
  assert.equal(pairs.length, emotionPairs.length + runePairs.length, "only deterministic ladders carry an EV");
  const random = bench.outputs.filter((leg) => /Essences|Catalysts|Tablets/.test(leg.text));
  assert.deepEqual(random.map((leg) => leg.claim.v), ["cf", "ss", "uv"], "essences conflict, catalysts community, tablets unresolved");
  console.log(`PASS  bench ladders: ${emotionPairs.length} emotion + ${runePairs.length} rune conversions, 3 → 1, poe2db order; random outputs graded and unpriced`);
}

function marketFor(id: string, div: number): [string, YieldMarket] {
  const exchangeId = entityById(id)?.exchange_id;
  if (!exchangeId) throw new Error(`${id} has no exchange id`);
  return [exchangeId, { div, fetchedAt: "2026-10-01T11:00:00.000Z", change7d: null, volume: 100 }];
}

function testViews(strategies: readonly Strategy[]): void {
  const markets = new Map([
    marketFor("lesser-desert-rune", 0.01),
    marketFor("desert-rune", 0.05),
    marketFor("diluted-liquid-ire", 0.2),
    marketFor("diluted-liquid-guilt", 0.5),
    marketFor("waystone-14", 0.02),
    marketFor("waystone-15", 0.1),
  ]);
  const views = buildStrategyViews(strategies, "Forbidden Rites", markets, Date.parse("2026-10-01T12:00:00Z"));
  const bench = viewsOfKind(views, "trade").find((v) => v.id === "reforging-bench-ladders");
  if (!bench) throw new Error("bench view missing");
  const ranked = rankConversions(bench.price_refs);
  assert.deepEqual(ranked.slice(0, 2).map((c) => conversionLabel(c)), ["3 × Lesser Desert Rune → Desert Rune", "3 × Diluted Liquid Ire → Diluted Liquid Guilt"], "best EV first");
  assert.ok(ranked[0]?.ev.status === "priced" && Math.abs(ranked[0].ev.ev_div - 0.02) < 1e-12);
  assert.ok(ranked[1]?.ev.status === "priced" && Math.abs(ranked[1].ev.ev_div + 0.1) < 1e-12, "a losing step stays visible with its sign");
  const greater = bench.price_refs.find((c) => c.outputs[0]?.ref.id === "greater-desert-rune");
  assert.deepEqual(greater?.ev, { status: "unpriced", missing: ["Greater Desert Rune"] }, "one unpriced leg → no EV, and that leg is named");
  assert.equal(ladderSummary(bench.price_refs), "1 of 2 priced steps pay today");
  const waystones = viewsOfKind(views, "roll_and_sell").find((v) => v.id === "waystone-bench-tiers");
  assert.equal(waystones?.sell_ref?.price?.div, 0.1, "the sold item carries its live price");
  const step = waystones?.price_refs.find((c) => c.inputs[0]?.ref.id === "waystone-14");
  assert.ok(step?.ev.status === "priced" && Math.abs(step.ev.ev_div - 0.04) < 1e-12, "3 × T14 at 0.02 → T15 at 0.1");
  const temple = viewsOfKind(views, "roll_and_sell").find((v) => v.id === "temple-tablet-crystals");
  const url = new URL(temple?.target_mods[0]?.search_url ?? "");
  const q = JSON.parse(url.searchParams.get("q") ?? "{}") as { query: { type?: string; stats: Array<{ filters: Array<{ id: string }> }> } };
  assert.equal(q.query.type, "Temple Tablet", "the target mod search is scoped to the rolled base");
  assert.deepEqual(q.query.stats[0]?.filters.map((f) => f.id), ["explicit.stat_1940774881"]);
  const gem = viewsOfKind(views, "trade").find((v) => v.id === "gem-double-corruption");
  assert.equal(gem?.inputs.find((leg) => leg.ref?.id === "vaal")?.ref?.price, null, "an unpriced leg is null, never 0");
  console.log("PASS  views: conversion EV live and ranked, unpriced leg named, sold item priced, target-mod search scoped to the base");
}

function testHelpers(): void {
  assert.deepEqual([fmtSignedDivOrEx(2.5, 400), fmtSignedDivOrEx(-0.01, 400), fmtSignedDivOrEx(0, 400)], [`+${fmtDivOrEx(2.5, 400)}`, `−${fmtDivOrEx(0.01, 400)}`, "0"], "signed amounts");
  assert.equal(evText({ status: "unpriced", missing: ["Greater Desert Rune"] }, 400).tip, "No EV: no exchange price for Greater Desert Rune.");
  assert.equal(evText({ status: "unpriced", missing: ["X"] }, 400).text, "—");
  assert.equal(attemptCost(0.5, 10, [0.1, 0.2]), 5.3, "consumables + half the item");
  assert.equal(attemptCost(0.5, 10, [0.1, null]), null, "an unpriced consumable → no number, never a partial sum");
  assert.equal(attemptCost(0.5, 0, [0.1]), null, "no item value → no number");
  assert.equal(attemptCost(1.5, 10, [0.1]), null, "a chance outside 0–1 is rejected");
  assert.deepEqual(Object.keys(RARITY_LABEL), [...ITEM_RARITIES]);
  assert.deepEqual(Object.keys(SELL_UNIT_LABEL), [...SELL_UNITS]);
  assert.equal(ladderSummary([]), null);
  console.log("PASS  helpers: signed EV text, unpriced tip, attempt cost (null when anything is unknown), labels per enum");
}

/** Owner rule (2026-10-01): a card's profit is only what live prices say, and a loss is shown muted, not hidden. */
function testProfitHeadline(strategies: readonly Strategy[]): void {
  const at = (markets: Map<string, YieldMarket>) => viewsOfKind(buildStrategyViews(strategies, "Forbidden Rites", markets, Date.parse("2026-10-01T12:00:00Z")), "trade").find((v) => v.id === "reforging-bench-ladders");
  const paying = at(new Map([marketFor("lesser-iron-rune", 0.01), marketFor("iron-rune", 0.05)]));
  const losing = at(new Map([marketFor("lesser-iron-rune", 0.02), marketFor("iron-rune", 0.05)]));
  const none = at(new Map());
  if (!paying || !losing || !none) throw new Error("bench view missing");
  const up = profitHeadline(paying.price_refs, 400, "x");
  assert.equal(up.tone, "profit");
  assert.equal(up.text, `+${fmtDivOrEx(0.02, 400)}`, "the best live EV, signed");
  const down = profitHeadline(losing.price_refs, 400, "x");
  assert.deepEqual([down.tone, down.text], ["loss", "not profitable at current prices"], "EV ≤ 0 is said, not hidden");
  assert.match(down.tip, /3 × Lesser Iron Rune → Iron Rune/, "the hover names the best step and its number");
  const unpriced = profitHeadline(none.price_refs, 400, "x");
  assert.deepEqual([unpriced.tone, unpriced.text], ["unpriced", "—"]);
  assert.match(unpriced.tip, /^No EV: no exchange price for /, "the hover names an unpriced leg");
  assert.deepEqual(profitHeadline([], 400, "no live price here"), { tone: "unpriced", text: "—", tip: "no live price here", best: null });
  for (const s of strategies) {
    assert.ok(s.durability.why_it_works.length > 0 && s.durability.breaks_when.length > 0 && s.durability.claim.src.length > 0, `${s.id}: durability names its mechanic, cites it and says what ends it`);
  }
  console.log("PASS  profit headline: live EV only (profit / muted 'not profitable' / —); every strategy carries a cited durability line");
}

/** The independent fact-check's corrections (2026-10-01), pinned so a later edit cannot undo them. */
function testFactCheck(strategies: readonly Strategy[]): void {
  const text = (id: string): string => readFileSync(join(STRATEGIES_DIR, `${id}.json`), "utf8");
  assert.doesNotMatch(text("temple-tablet-crystals") + text("atziri-temple-rush"), /city map|four tablets|4 tablets/i, "no fourth tablet slot");
  const ritual = strategiesOfKind(strategies, "roll_and_sell").find((s) => s.id === "ritual-tablet-rerolls");
  assert.ok(ritual && !ritual.roll_steps.some((step) => step.currencies.some((c) => c.id === "ancient-infuser" || c.id === "vaal")), "no corruption step");
  assert.ok(ritual.risks.some((r) => /does not make it \+4/.test(r)), "corrupting never makes +4, and the card says so");
  const atziri = strategiesOfKind(strategies, "farm").find((s) => s.id === "atziri-temple-rush");
  assert.ok(atziri && !atziri.yields.some((y) => y.ref.id === "jiquanis-thesis"), "Jiquani's Thesis is not an Atziri drop");
  assert.doesNotMatch(text("boss-entry-conversion"), /guarantee/i, "Head of the King drops; never 'guaranteed'");
  const breach = strategiesOfKind(strategies, "roll_and_sell").find((s) => s.id === "breach-tablet-invasion");
  assert.ok(breach?.target_mods.some((m) => m.text.startsWith("Unstable Breaches in Map spawn (1–2)")), "the 0.5.5 range is 1–2");
  assert.doesNotMatch(text("breach-tablet-invasion"), /\d+\s*div\b/, "no pre-nerf jackpot figure");
  assert.doesNotMatch(text("waystone-bench-tiers"), /eight modifiers"|Vaal Orb to eight/i, "the 8-mod Vaal step is not a step");
  const gem = strategiesOfKind(strategies, "trade").find((s) => s.id === "gem-double-corruption");
  assert.ok(gem && gem.odds.claim.v !== "vp" && gem.odds.loss_chance === 0.5, "community odds are graded as community");
  for (const s of strategies) {
    for (const ref of strategyRefs(s)) assert.ok(entityById(ref.id), `${s.id}: ${ref.id} in the catalog`);
    if (s.kind !== "farm") {
      for (const key of ["build", "complexity"] as const) assert.ok(s.ratings[key].value === null || s.ratings[key].claim.src.length > 0, `${s.id}: rated ${key} cites a source`);
    }
  }
  console.log("PASS  fact-check pins: 3 tablets max, no corrupt → +4, no Jiquani's Thesis, Head of the King not 'guaranteed', breach 1–2, gem odds community");
}

export function runStrategyKindCases(strategies: readonly Strategy[]): void {
  testEv();
  testLadders(strategies);
  testViews(strategies);
  testHelpers();
  testProfitHeadline(strategies);
  testFactCheck(strategies);
}
