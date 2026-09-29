/* Market › Prices against a TEMP DB: the latest-row query, the response builder, the contract,
 * the category labels and the table's sort/filter rules. No network.
 * Run: npm run test:market-league (runWithTestEnv sets DB_PATH). */
import assert from "node:assert/strict";
import { CATEGORIES, type PricedItem } from "../api/types";
import { config } from "../config/env";
import type { CxMarketView } from "../core/cx/cxItemMarkets";
import type { CxItemStats } from "../core/cx/cxPersistence";
import { buildMarketPrices } from "../core/marketPrices";
import { getDb } from "../db/database";
import { getCurrencyDivMap, getMaterialPrices } from "../db/craftQueries";
import { latestPriceRows, latestPriceRowsFor } from "../db/latestSnapshotQueries";
import { insertSnapshots, latestSnapshotPrices, latestSnapshots } from "../db/marketQueries";
import { categoryBySlug, ECONOMY_CATEGORIES, economyCategory, OTHER_CATEGORY } from "../lib/economyCategories";
import { fmtDivOrExRange } from "../lib/format";
import { marketPricesResponseSchema, type MarketPriceItem } from "../lib/marketPricesContract";
import { comparePrices, DEFAULT_PRICE_SORT, fmtChange, nextSort, railCounts, visibleItems } from "../components/market/prices/pricesView";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

const pass = (what: string): void => console.log(`PASS  ${what}`);
const A = "League Alpha";
const B = "League Beta";

const priced = (itemId: string, category: string, baseValue: number, volume = 100, icon: string | null = `https://x/${itemId}.png`): PricedItem => ({
  itemId,
  itemName: itemId.replace(/-/g, " "),
  category,
  baseValue,
  volume,
  change7d: 5,
  spark7d: [0, 2, 5],
  icon,
});

function testCategories(): void {
  // One-way on purpose: a retired type keeps its label (its rows outlive the poller change), so
  // the label list may be a superset of what is polled today.
  for (const { type } of CATEGORIES) assert.ok(economyCategory(type), `polled poe.ninja type "${type}" has a label`);
  assert.equal(new Set(ECONOMY_CATEGORIES.map((c) => c.type)).size, ECONOMY_CATEGORIES.length, "one label per type");
  const slugs = [...ECONOMY_CATEGORIES, OTHER_CATEGORY].map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs are unique, Other included");
  assert.equal(economyCategory(OTHER_CATEGORY.type), null, "Other is not a labelled poe.ninja type");
  assert.equal(economyCategory("Breach")?.label, "Catalysts");
  assert.equal(economyCategory("Ritual")?.label, "Omens");
  assert.equal(economyCategory("Tattoos"), null);
  assert.equal(categoryBySlug("omens")?.type, "Ritual");
  assert.equal(categoryBySlug("other")?.type, OTHER_CATEGORY.type);
  assert.equal(categoryBySlug("bogus"), null);
  pass("categories: every polled type labelled (retired labels allowed), unique slugs, unlabelled → null");
}

function seed(): void {
  const db = getDb();
  db.exec("DELETE FROM price_snapshots; DELETE FROM item_spark;");
  insertSnapshots(A, [priced("divine", "Currency", 1, 5000), priced("exalted", "Currency", 0.004, 900), priced("omen-of-chance", "Ritual", 9, 0)]);
  insertSnapshots(B, [priced("divine", "Currency", 1), priced("exalted", "Currency", 0.9)]);
  // A second, newer row for exalted in A: the query must read it, not the first one.
  db.prepare("UPDATE price_snapshots SET fetched_at = datetime('now', '-2 hours') WHERE league = ?").run(A);
  insertSnapshots(A, [priced("exalted", "Currency", 0.005, 1000), priced("unpriced-thing", "Currency", 0, 0, null)]);
}

function testLatestRows(): void {
  seed();
  const rows = latestPriceRows(A);
  const byId = new Map(rows.map((r) => [r.itemId, r]));
  assert.deepEqual([...byId.keys()].sort(), ["divine", "exalted", "omen-of-chance", "unpriced-thing"], "league-scoped, one row per item");
  assert.equal(byId.get("exalted")?.baseValue, 0.005, "the newest snapshot wins");
  assert.deepEqual(byId.get("divine")?.spark7d, [0, 2, 5], "spark joined from item_spark");
  assert.ok(byId.get("divine")?.trendAt, "trend age carried");
  const legacy = new Map(latestSnapshots(A).map((r) => [r.itemId, r.baseValue]));
  for (const r of rows) assert.equal(r.baseValue, legacy.get(r.itemId), `${r.itemId}: same value as latestSnapshots`);
  assert.equal(latestPriceRows("No Such League").length, 0);
  pass("latestPriceRows: league-scoped, newest row per item, spark + ages, agrees with latestSnapshots");
}

/**
 * Every current-price reader resolves "latest" the same way: newest fetched_at, ties → higher id.
 * The seeded rows make the old MAX(id) rule disagree (a backfilled row with an older stamp has the
 * higher id), so a reader still on MAX(id) fails here.
 */
function testReadersAgree(): void {
  const db = getDb();
  db.exec("DELETE FROM price_snapshots; DELETE FROM item_spark;");
  const put = db.prepare(
    "INSERT INTO price_snapshots (league, item_id, item_name, category, chaos_equiv, volume, icon, fetched_at) VALUES (?, ?, ?, 'Currency', ?, 1, NULL, ?)",
  );
  put.run(A, "regal", "Regal Orb", 0.02, "2026-09-29 12:00:00");
  put.run(A, "regal", "Regal Orb", 0.01, "2026-09-29 09:00:00"); // backfill: higher id, older stamp
  put.run(A, "alch", "Orb of Alchemy", 0.03, "2026-09-29 12:00:00");
  put.run(A, "alch", "Orb of Alchemy", 0.04, "2026-09-29 12:00:00"); // same stamp: higher id wins
  const want = new Map([["regal", 0.02], ["alch", 0.04]]);
  const readers: Array<[string, Map<string, number>]> = [
    ["latestPriceRows", new Map(latestPriceRows(A).map((r) => [r.itemId, r.baseValue]))],
    ["latestPriceRowsFor", new Map(latestPriceRowsFor(A, ["regal", "alch", "missing"]).map((r) => [r.itemId, r.baseValue]))],
    ["latestSnapshots", new Map(latestSnapshots(A).map((r) => [r.itemId, r.baseValue]))],
    ["latestSnapshotPrices", new Map(latestSnapshotPrices(A).map((r) => [r.itemId, r.baseValue]))],
    ["getCurrencyDivMap", getCurrencyDivMap(A)],
    ["getMaterialPrices", new Map([...getMaterialPrices(A, ["regal", "alch"])].map(([id, m]) => [id, m.priceDiv]))],
  ];
  for (const [name, got] of readers) assert.deepEqual(got, want, `${name} picks max(fetched_at), tie → id DESC`);
  assert.deepEqual(latestPriceRowsFor(A, []), []);
  pass("latest-row readers agree: max(fetched_at) wins over MAX(id), equal stamps → higher id");
}

function cxView(): CxMarketView {
  const stats = { newestHour: 1_790_000_000, midDiv: 0.0051, bandDiv: { low: 0.005, high: 0.0052 }, marketUnitsPerHour: 4200, edge: null, issue: null, rawNetPct: null };
  return { newestHour: 1_790_000_000, byItemId: new Map<string, CxItemStats>([["exalted", stats]]), coverage: { cxItems: 1, mapped: 1, unnamed: 0, unmatched: 0, ambiguous: 0 } };
}

function testBuilder(): void {
  seed();
  const rates = { rates: { exaltPerDivine: 200, chaosPerDivine: 40 }, source: "cx" as const, fetchedAt: "2026-09-29 10:00:00" };
  const body = marketPricesResponseSchema.parse(buildMarketPrices({ league: A, rows: latestPriceRows(A), cx: cxView(), rates }));
  const item = (id: string): MarketPriceItem => {
    const found = body.items.find((i) => i.itemId === id);
    assert.ok(found, id);
    return found;
  };
  assert.equal(item("divine").valueDiv, 1, "Divine per item, never inverted");
  assert.equal(item("exalted").valueDiv, 0.005, "a sub-Div value stays sub-Div (not 1/x)");
  assert.equal(item("unpriced-thing").valueDiv, null, "value 0 = unpriced, never 0");
  assert.deepEqual([item("unpriced-thing").volumePerHour, item("unpriced-thing").volumeSource], [null, null], "no volume stays null");
  assert.deepEqual([item("exalted").volumePerHour, item("exalted").volumeSource], [4200, "cx"], "exchange flow wins");
  assert.deepEqual([item("exalted").cxMidDiv, item("exalted").cxBand], [0.0051, { low: 0.005, high: 0.0052 }]);
  assert.deepEqual([item("divine").volumePerHour, item("divine").volumeSource], [5000, "ninja"], "ninja volume ÷ value, marked ninja");
  assert.equal(item("omen-of-chance").volumePerHour, null, "ninja volume 0 = unknown");
  assert.equal(body.cxHour, 1_790_000_000);
  assert.deepEqual(body.rates, { exPerDiv: 200, chaosPerDiv: 40, source: "cx", fetchedAt: "2026-09-29 10:00:00" });
  const currency = body.categories.find((c) => c.type === "Currency");
  assert.deepEqual([currency?.count, currency?.icon, currency?.label], [3, "https://x/divine.png", "Currency"], "curated icon");
  assert.equal(body.categories.find((c) => c.type === "Ritual")?.icon, "https://x/omen-of-chance.png", "fallback: priciest item's icon");
  assert.equal(body.categories.length, ECONOMY_CATEGORIES.length, "empty categories stay listed (count 0)");
  assert.ok(body.fetchedAt !== null && body.fetchedAt >= item("divine").valueAt, "fetchedAt = newest value row");
  const none = marketPricesResponseSchema.parse(buildMarketPrices({ league: "Empty", rows: [], cx: null, rates: null }));
  assert.deepEqual([none.fetchedAt, none.rates, none.cxHour, none.items.length], [null, null, null, 0]);
  testUnlabelledType();
  pass("buildMarketPrices: Divine per item, unknown = null, cx flow wins, curated/fallback art, contract round-trip");
}

/** An unlabelled stored type must not 500 the route: it lands under Other with one warning per type. */
function testUnlabelledType(): void {
  const first = latestPriceRows(A)[0]!;
  const strays = [
    { ...first, itemId: "stray-a", category: "Tattoos" },
    { ...first, itemId: "stray-b", category: "Tattoos" },
  ];
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(" "));
  try {
    const twice = [0, 1].map(() => marketPricesResponseSchema.parse(buildMarketPrices({ league: A, rows: strays, cx: null, rates: null })));
    const body = twice[1]!;
    assert.deepEqual(body.items.map((i) => i.category), [OTHER_CATEGORY.type, OTHER_CATEGORY.type]);
    assert.deepEqual(body.categories.filter((c) => c.type === OTHER_CATEGORY.type).map((c) => [c.label, c.count]), [["Other", 2]]);
  } finally {
    console.warn = realWarn;
  }
  assert.equal(warnings.length, 1, `one warning per unlabelled type, got ${JSON.stringify(warnings)}`);
  assert.match(warnings[0]!, /"Tattoos"/);
  const clean = buildMarketPrices({ league: A, rows: latestPriceRows(A), cx: null, rates: null });
  assert.ok(!clean.categories.some((c) => c.type === OTHER_CATEGORY.type), "Other is hidden while empty");
}

function row(itemId: string, category: string, valueDiv: number | null, change7d: number | null, volumePerHour: number | null): MarketPriceItem {
  return { itemId, name: itemId, category, icon: null, valueDiv, valueAt: "2026-09-29 10:00:00", change7d, spark7d: null, trendAt: null, volumePerHour, volumeSource: volumePerHour === null ? null : "cx", cxMidDiv: null, cxBand: null };
}

function testView(): void {
  const items = [row("a", "Currency", 2, 30, 50), row("b", "Currency", null, null, null), row("c", "Currency", 0.1, -25, 5), row("d", "Runes", 7, 1, 20)];
  const ids = (list: MarketPriceItem[]) => list.map((i) => i.itemId);
  const base = { category: "Currency", query: "", movers: false, liquid: false };
  assert.deepEqual(ids(visibleItems(items, base, { key: "value", dir: "desc" })), ["a", "c", "b"], "value desc, unpriced last");
  assert.deepEqual(ids(visibleItems(items, base, { key: "value", dir: "asc" })), ["c", "a", "b"], "unpriced last ascending too");
  assert.deepEqual(ids(visibleItems(items, { ...base, movers: true }, { key: "change", dir: "desc" })), ["a", "c"], "movers = |7d| ≥ 20%");
  assert.deepEqual(ids(visibleItems(items, { ...base, liquid: true }, { key: "volume", dir: "desc" })), ["a"], "liquid = ≥ 10/h");
  assert.deepEqual(ids(visibleItems(items, { ...base, query: "d" }, { key: "name", dir: "asc" })), ["d"], "search spans every category");
  assert.equal(comparePrices(items[1]!, items[1]!, { key: "volume", dir: "desc" }), 0);
  assert.deepEqual(nextSort({ key: "value", dir: "desc" }, "value"), { key: "value", dir: "asc" });
  assert.deepEqual(nextSort({ key: "value", dir: "desc" }, "name"), { key: "name", dir: "asc" });
  assert.deepEqual([fmtChange(12.4), fmtChange(-3.46), fmtChange(0), fmtChange(1040)], ["+12%", "−3.5%", "0%", "+1,040%"]);
  assert.equal(fmtDivOrExRange(0.95, 1.1, 200), "0.95 div – 1.1 div", "a band straddling 1 div stays in div");
  assert.equal(fmtDivOrExRange(0.05, 0.08, 200), "10 ex – 16 ex", "a sub-div band reads in ex");
  assert.equal(fmtDivOrExRange(0.05, 0.08, 0), "0.05 div – 0.08 div", "no rate: div with 2 significant digits");
  const moversCounts = railCounts(items, { query: "", movers: true, liquid: false });
  assert.deepEqual([moversCounts.byCategory.get("Currency"), moversCounts.byCategory.get("Runes")], [2, undefined], "rail counts follow the chips");
  assert.equal(moversCounts.byCategory.get("Currency"), visibleItems(items, { ...base, movers: true }, DEFAULT_PRICE_SORT).length, "count = rows a click shows");
  assert.equal(railCounts(items, { query: "a", movers: false, liquid: true }).matches, 1, "search matches under the chips");
  pass("pricesView: nulls sink both ways, movers/liquid filters, cross-category search, sort toggles, rail counts");
}

testCategories();
testLatestRows();
testBuilder();
testReadersAgree();
testView();
