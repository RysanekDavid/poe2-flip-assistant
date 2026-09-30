/* Market › Prices UNIQUES group: category labels, the builder's null handling and trade-fallback
 * labelling, the contract, and the table's filters. Pure — no network, no DB.
 * Run: npm run test:market-league (runWithTestEnv sets the test env). */
import assert from "node:assert/strict";
import { DEMAND_CATEGORIES, toUnpricedUniques, type ByCategoryItem, type CachedDemand, type DemandItem } from "../api/scoutDemand";
import { buildMarketUniques } from "../core/marketUniques";
import type { UniqueTradeRow } from "../db/uniqueTradeQueries";
import { ECONOMY_CATEGORIES, OTHER_CATEGORY } from "../lib/economyCategories";
import { marketUniqueItemSchema, marketUniquesResponseSchema, type MarketUniqueItem } from "../lib/marketUniquesContract";
import { isUniqueSlug, UNIQUE_CATEGORIES, uniqueCategory } from "../lib/uniqueCategories";
import {
  changeGapReason,
  compareUniques,
  DEFAULT_UNIQUE_SORT,
  emptyUniquesSentence,
  uniqueRailCounts,
  valueSourceLabel,
  visibleUniques,
} from "../components/market/prices/uniquesView";

const pass = (what: string): void => console.log(`PASS  ${what}`);
const NOW = Date.parse("2026-09-30T12:00:00Z");
const H = 3_600_000;
const EX_PER_DIV = 500;

function testCategories(): void {
  for (const id of DEMAND_CATEGORIES) assert.ok(uniqueCategory(id), `scout demand category "${id}" has a label`);
  assert.equal(UNIQUE_CATEGORIES.length, DEMAND_CATEGORIES.length, "no label for a category nobody fetches");
  const exchangeSlugs = new Set([...ECONOMY_CATEGORIES, OTHER_CATEGORY].map((c) => c.slug));
  const slugs = UNIQUE_CATEGORIES.map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length, "unique slugs are distinct");
  for (const s of slugs) assert.ok(!exchangeSlugs.has(s) && isUniqueSlug(s), `unique slug ${s} never collides with an exchange slug`);
  assert.equal(isUniqueSlug("currency"), false);
  assert.equal(uniqueCategory("sanctum")?.label, "Relics");
  assert.equal(uniqueCategory("map"), null);
  pass("categories: every demand category labelled, slugs distinct from exchange, unknown → null");
}

const demandItem = (id: number, over: Partial<DemandItem> = {}): DemandItem => ({
  id, name: `Unique ${id}`, type: "Silk Robe", category: "armour", icon: `https://web.poecdn.com/u${id}.png`,
  priceExalt: 1000, rawPriceExalt: 1000, quantity: 12, listedAvg: null, sellThrough: null, momentumPct: null,
  samples: 0, sparkPrices: [], priceAt: new Date(NOW - 18 * 24 * H).toISOString(), ...over,
});

const tradeRow = (nameKey: string, div: number | null, over: Partial<UniqueTradeRow> = {}): UniqueTradeRow => ({
  nameKey, observed: { div, listed: 9, samples: div === null ? 1 : 5, atMs: NOW - 3 * H }, checkedAtMs: NOW - 3 * H, searchedAtMs: NOW - 3 * H, error: null, ...over,
});

function demand(items: DemandItem[], unpricedRaw: ByCategoryItem[] = [], rate = EX_PER_DIV): CachedDemand {
  return { rates: { exaltPerDivine: rate, chaosPerDivine: 30 }, items, unpriced: toUnpricedUniques(unpricedRaw), warnings: ["price history and ages unavailable (poe2scout: 503)"], at: NOW - 60_000, league: "Default League" };
}

const raw = (id: number, over: Partial<ByCategoryItem> = {}): ByCategoryItem => ({
  ItemId: id, Name: `Raw ${id}`, Type: "Gold Ring", CategoryApiId: "accessory", IconUrl: null, CurrentPrice: null, CurrentQuantity: 0, ...over,
});

function testUnpricedRows(): void {
  const rows = toUnpricedUniques([raw(1), raw(2, { CurrentPrice: 50 }), raw(3, { Name: "INCOMPLETE" }), raw(4, { Name: null }), raw(5, { CurrentPrice: 0 })]);
  assert.deepEqual(rows.map((r) => r.id), [1], "only named, non-placeholder rows with no CurrentPrice (0 stays a scout row)");
  pass("toUnpricedUniques: keeps the rows toDemandItems drops, minus placeholders");
}

function build(items: DemandItem[], unpricedRaw: ByCategoryItem[], trade: Map<string, UniqueTradeRow>, viewerLeague = "Default League") {
  return marketUniquesResponseSchema.parse(buildMarketUniques({ demand: demand(items, unpricedRaw), viewerLeague, trade, nowMs: NOW }));
}

function testBuilder(): void {
  const trade = new Map([
    ["unique 2", tradeRow("unique 2", 3.5)],
    ["raw 11", tradeRow("raw 11", 1.25)],
    ["raw 12", tradeRow("raw 12", null)],
    ["raw 13", tradeRow("raw 13", null, { observed: null, error: "Unknown item name", searchedAtMs: null })],
  ]);
  const body = build(
    [demandItem(1, { priceExalt: 250 }), demandItem(2, { priceExalt: 0 }), demandItem(3, { priceExalt: 0 })],
    [raw(11), raw(12), raw(13), raw(14)],
    trade,
  );
  const by = new Map(body.items.map((i) => [i.id, i]));
  assert.equal(by.get("1")?.valueDiv, 0.5, "250 ex at 500 ex/div = 0.5 div — Exalted ÷ rate, never inverted");
  assert.equal(by.get("1")?.valueSource, "scout");
  assert.equal(valueSourceLabel(by.get("1")!), null, "a scout value carries no source line");
  const fallback = by.get("2")!;
  assert.deepEqual([fallback.valueDiv, fallback.valueSource, fallback.listings, valueSourceLabel(fallback)], [3.5, "trade", 9, "trade listings"], "scout 0 + trade price → trade, labelled");
  assert.equal(fallback.priceAt, new Date(NOW - 3 * H).toISOString(), "a trade price is dated by its search");
  const zero = by.get("3")!;
  assert.equal(zero.valueDiv, null, "scout 0 without a trade price is unknown, never 0");
  assert.match(zero.unpricedReason ?? "", /lists it at 0/);
  assert.equal(by.get("11")?.valueSource, "trade", "scout null + trade price → trade");
  assert.match(by.get("12")?.unpricedReason ?? "", /without a price · only 1 usable of 9 trade listing/, "a thin trade search says why");
  assert.match(by.get("13")?.unpricedReason ?? "", /not searchable on trade/, "a failed lookup says why");
  assert.equal(by.get("14")?.unpricedReason, "poe2scout lists it without a price", "no trade row → scout's reason only");
  assert.ok(body.items.every((i) => i.valueDiv === null || i.valueDiv > 0), "no value is 0");
  assert.equal(body.categories.find((c) => c.id === "armour")?.icon, "https://web.poecdn.com/u2.png", "rail art = the priciest unique of the category");
  assert.equal(body.categories.find((c) => c.id === "weapon")?.icon, null, "an empty category has no art");
  assert.deepEqual([body.league, body.viewerLeague, body.exPerDiv, body.warnings.length], ["Default League", "Default League", EX_PER_DIV, 1], "league, rate and warnings pass through");
  assert.equal(build([], [], new Map(), "Pinned League").viewerLeague, "Pinned League", "the caller's league is reported for the honest note");
  pass("builder: scout ÷ rate, trade fallback labelled, unknown = null with a reason, rail art");
}

function testFailures(): void {
  assert.throws(() => buildMarketUniques({ demand: demand([demandItem(1)], [], 0), viewerLeague: "L", trade: new Map(), nowMs: NOW }), /Exalted per Divine is 0/);
  assert.throws(() => buildMarketUniques({ demand: demand([demandItem(1, { category: "map" })]), viewerLeague: "L", trade: new Map(), nowMs: NOW }), /"map".*no label/);
  const base = { id: "1", name: "U", base: "", category: "armour", icon: null, priceAt: null, listings: null, change7d: null, spark7d: [] };
  assert.equal(marketUniqueItemSchema.safeParse({ ...base, valueDiv: 0, valueSource: "scout", unpricedReason: null }).success, false, "contract rejects a 0 value");
  assert.equal(marketUniqueItemSchema.safeParse({ ...base, valueDiv: null, valueSource: null, unpricedReason: null }).success, false, "unpriced needs a reason");
  assert.equal(marketUniqueItemSchema.safeParse({ ...base, valueDiv: 2, valueSource: null, unpricedReason: null }).success, false, "a value needs a source");
  assert.equal(marketUniqueItemSchema.safeParse({ ...base, valueDiv: null, valueSource: null, unpricedReason: "no price" }).success, true, "nulls allowed where data is missing");
  pass("failures: zero rate and unlabelled category throw; contract rejects 0 and reasonless nulls");
}

const row = (id: string, category: string, valueDiv: number | null, over: Partial<MarketUniqueItem> = {}): MarketUniqueItem => ({
  id, name: `U${id}`, base: "Base", category, icon: null, valueDiv, valueSource: valueDiv === null ? null : "scout",
  unpricedReason: valueDiv === null ? "no price" : null, priceAt: null, listings: 3, change7d: null, spark7d: [], ...over,
});

function testFilters(): void {
  const items = [row("1", "armour", 0.4), row("2", "armour", 12), row("3", "armour", null), row("4", "weapon", 3, { base: "Silk Robe" }), row("5", "armour", 1)];
  const ids = (xs: MarketUniqueItem[]): string => xs.map((x) => x.id).join(",");
  const def = visibleUniques(items, { category: "armour", query: "", valuableOnly: true }, DEFAULT_UNIQUE_SORT);
  assert.equal(ids(def), "2,5", "≥ 1 Div (default on) hides cheap and unpriced rows; highest first");
  const all = visibleUniques(items, { category: "armour", query: "", valuableOnly: false }, DEFAULT_UNIQUE_SORT);
  assert.equal(ids(all), "2,5,1,3", "filter off: unpriced sinks to the bottom");
  const asc = [...all].sort((a, b) => compareUniques(a, b, { key: "value", dir: "asc" }));
  assert.equal(ids(asc), "1,5,2,3", "unknown sinks in ascending order too");
  assert.equal(ids(visibleUniques(items, { category: "armour", query: "silk", valuableOnly: true }, DEFAULT_UNIQUE_SORT)), "4", "search spans every category and matches the base");
  const counts = uniqueRailCounts(items, { query: "u", valuableOnly: true });
  assert.deepEqual([counts.byCategory.get("armour"), counts.byCategory.get("weapon"), counts.matches], [2, 1, 3], "rail counts follow the value filter");
  const empty = (category: string, query: string, valuableOnly: boolean): string => emptyUniquesSentence(items, { category, query, valuableOnly });
  assert.match(empty("armour", "zzz-no-match", true), /^No unique matches your search/, "a search that matches nothing does not blame ≥ 1 Div");
  assert.match(empty("armour", "U1", true), /turn off "≥ 1 Div"/, "a match hidden by the filter blames the filter");
  assert.match(empty("jewel", "", true), /lists no uniques in this category/, "an empty category says so, filter or not");
  assert.match(empty("armour", "", true), /turn off "≥ 1 Div"/, "a category the filter emptied blames the filter");
  assert.match(changeGapReason(row("6", "armour", 5, { spark7d: [4] })), /only 1 poe2scout price point/);
  assert.match(changeGapReason(row("7", "armour", 5)), /no poe2scout price point in the last 7 days/);
  assert.match(changeGapReason(row("8", "armour", null)), /no price for it, so no trend/);
  pass("filters: ≥ 1 Div default, search across uniques and bases, counts, nulls last, change reasons");
}

testCategories();
testUnpricedRows();
testBuilder();
testFailures();
testFilters();
console.log("\nALL PASS");
