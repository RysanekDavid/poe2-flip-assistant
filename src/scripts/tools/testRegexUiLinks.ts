/* Regex UI support logic, part 2 (run from testRegexTool.ts): trade2 link building incl. the
 * filters it can and cannot carry, number/range field parsing (never clamps), the session mirror,
 * and the explain job's time budget on the largest pool. */
import assert from "node:assert/strict";
import { composePool } from "../../core/tools/regex/poolCompose";
import { POOL_HEADERS } from "../../core/tools/regex/pools/headers";
import { buildRegexTradeLink, indexStats, TRADE_CATEGORY } from "../../core/tools/regex/tradeLink";
import { EXPLAIN_TIMEOUT_MS, runExplainJob } from "../../lib/tools/regexExplainJob";
import { emptyPoolSelection } from "../../lib/tools/regexPoolContract";
import { tradeLinkRequest } from "../../lib/tools/regexTradeContract";
import { explainSamples } from "../../components/tools/regex/modView";
import { parseNumberText, parseRangeText, rangeOf, setModState, tierOf } from "../../components/tools/regex/selectionOps";
import { parseStoredState } from "../../components/tools/regex/sessionState";
import { loadPool, sampleWaystone } from "./testRegexUi";

type Query = { query: { filters: Record<string, { filters: Record<string, unknown> }>; stats: Array<{ type: string; filters: Array<{ id: string }> }>; type?: string } };
const queryOf = (url: string): Query => JSON.parse(new URL(url).searchParams.get("q") ?? "{}") as Query;

function testWaystoneLink(): void {
  const pool = loadPool("waystone");
  const sel = { ...sampleWaystone(pool), props: { itemRarity: { min: 40, max: null }, itemLevel: { min: 80, max: null } } };
  const { request: req, dropped } = tradeLinkRequest(pool, sel);
  assert.deepEqual(dropped, [], "nothing in this selection is beyond trade2");
  assert.deepEqual(req.tier, { min: 14, max: 16 });
  const [first, second] = req.lines;
  assert.ok(first && second && first.state === "want" && first.min === 20, "the threshold rides along on its line");
  const stats = indexStats([
    { id: "explicit.stat_1", text: first.template, group: "explicit" },
    { id: "implicit.stat_1", text: first.template, group: "implicit" },
    { id: "explicit.stat_2", text: second.template.toUpperCase(), group: "explicit" },
  ]);
  const link = buildRegexTradeLink(stats, "Runes of Aldur", req);
  assert.ok(new URL(link.url).pathname.endsWith("/Runes%20of%20Aldur"));
  const q = queryOf(link.url);
  assert.deepEqual(q.query.filters.type_filters?.filters.category, { option: TRADE_CATEGORY.waystone });
  assert.deepEqual(q.query.filters.type_filters?.filters.ilvl, { min: 80 }, "item level becomes the ilvl type filter");
  assert.deepEqual(q.query.filters.map_filters?.filters, { map_tier: { min: 14, max: 16 }, map_iir: { min: 40 } }, "tier and Item Rarity map filters");
  assert.deepEqual(q.query.stats.map((g) => g.type), ["count"], "any mode = count group; no avoid line matched");
  assert.deepEqual(q.query.stats[0]?.filters.map((f) => f.id), ["explicit.stat_1", "explicit.stat_2"], "explicit wins, text match ignores case");
  assert.equal(link.matched, 2);
  assert.equal(link.unmatched.length, req.lines.length - 2, "every line without a trade2 stat is reported");
}

function testTabletAndRarityLink(): void {
  const pool = loadPool("tablet");
  const one = { ...emptyPoolSelection("tablet"), types: ["breach" as const], rarity: ["rare" as const], props: { uses: { min: 5, max: null } } };
  const plan = tradeLinkRequest(pool, one);
  assert.equal(plan.request.baseType, "Breach Tablet", "one tablet type → its base type");
  assert.equal(plan.request.rarity, "rare");
  const link = buildRegexTradeLink(new Map(), "L", plan.request);
  const q = queryOf(link.url);
  assert.equal(q.query.type, "Breach Tablet");
  assert.deepEqual(q.query.filters.type_filters?.filters.rarity, { option: "rare" });
  assert.ok(link.unmatched.some((u) => /Uses Remaining/.test(u)), "a property trade2 lacks is reported, not dropped");
  const many = tradeLinkRequest(pool, { ...one, types: ["breach", "ritual"], rarity: ["magic", "rare"] });
  assert.equal(many.request.baseType, null);
  assert.equal(many.request.rarity, null);
  assert.equal(many.dropped.length, 2, "several tablet types and several rarities are named as not on trade");
}

function testRanges(): void {
  assert.deepEqual(parseNumberText("15"), { ok: true, value: 15 });
  assert.deepEqual(parseNumberText(" "), { ok: true, value: null });
  assert.equal(parseNumberText("7", { lo: 1, hi: 6 }).ok, false, "out of bounds is an error, never clamped");
  assert.equal(parseNumberText("2.5").ok, false);
  const tierBounds = { lo: 1, hi: 16 };
  assert.deepEqual(parseRangeText("1", "", tierBounds), { ok: true, min: 1, max: null }, "typing the 1 of 15 is accepted as is");
  assert.deepEqual(parseRangeText("15", "16", tierBounds), { ok: true, min: 15, max: 16 }, "T15 is typeable");
  assert.deepEqual(parseRangeText("30", "3"), { ok: false, error: "min is above max" }, "max below min is reported, not rewritten");
  assert.deepEqual(parseRangeText("30", "300"), { ok: true, min: 30, max: 300 }, "30 → 300 stays 300");
  assert.deepEqual(tierOf(15, null), { min: 15, max: 16 });
  assert.deepEqual(tierOf(null, 5), { min: 1, max: 5 });
  assert.equal(tierOf(null, null), null);
  assert.deepEqual(rangeOf(null, 40), { min: 0, max: 40 });
  assert.equal(rangeOf(null, null), null);
}

function testSessionState(): void {
  const waystone = setModState(emptyPoolSelection("waystone"), "MapMonsterAccuracy", "want");
  const raw = JSON.stringify({ waystone, relic: { tab: "relic", mods: "oops" }, price: { tab: "price", mode: "keep", minDiv: 1, categories: [], includeUniques: true } });
  const { patch, problems } = parseStoredState(raw);
  assert.deepEqual(patch.waystone, waystone, "a stored waystone selection comes back");
  assert.equal(patch.price?.minDiv, 1);
  assert.equal(patch.relic, undefined, "a stale entry is dropped…");
  assert.ok(problems.some((p) => p.startsWith("relic:")), "…and named");
  assert.deepEqual(parseStoredState(null), { patch: {}, problems: [] });
  assert.equal(parseStoredState("{not json").problems.length, 1);
}

/** A composed jewel string over every jewel mod must fit the worker's deadline with room to spare. */
function testExplainBudget(): number {
  const pool = loadPool("jewel");
  let sel = emptyPoolSelection("jewel");
  pool.mods.slice(0, 4).forEach((m) => (sel = setModState(sel, m.id, "want")));
  pool.mods.slice(10, 12).forEach((m) => (sel = setModState(sel, m.id, "avoid")));
  const search = composePool(pool, POOL_HEADERS.jewel, sel, { maxChars: 250 }).chunks[0]?.text;
  assert.ok(search, "the jewel selection composes");
  const job = { search, items: explainSamples(pool).map((s) => ({ key: s.key, lines: s.lines })) };
  runExplainJob(job); // warm the JIT like a long-lived worker would be
  const t = performance.now();
  const out = runExplainJob(job);
  const ms = performance.now() - t;
  assert.ok(out.ok && out.items.length === pool.mods.length);
  assert.ok(ms < EXPLAIN_TIMEOUT_MS / 2, `explaining "${search}" over ${pool.mods.length} jewel mods took ${ms.toFixed(1)} ms`);
  return ms;
}

export function testRegexUiLinks(): void {
  testWaystoneLink();
  testTabletAndRarityLink();
  testRanges();
  testSessionState();
  const ms = testExplainBudget();
  console.log(`  explain budget: jewel string over the full pool in ${ms.toFixed(1)} ms (limit ${EXPLAIN_TIMEOUT_MS} ms)`);
}
