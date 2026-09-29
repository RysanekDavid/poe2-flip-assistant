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
import { latestPriceRows } from "../db/marketPricesQueries";
import { insertSnapshots, latestSnapshots } from "../db/marketQueries";
import { categoryBySlug, ECONOMY_CATEGORIES, economyCategory } from "../lib/economyCategories";
import { marketPricesResponseSchema, type MarketPriceItem } from "../lib/marketPricesContract";
import { comparePrices, fmtChange, nextSort, visibleItems } from "../components/market/prices/pricesView";

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
  const ninjaTypes = CATEGORIES.map((c) => c.type).sort();
  assert.deepEqual(ECONOMY_CATEGORIES.map((c) => c.type).sort(), ninjaTypes, "every polled poe.ninja type has exactly one label");
  assert.equal(new Set(ECONOMY_CATEGORIES.map((c) => c.slug)).size, ECONOMY_CATEGORIES.length, "slugs are unique");
  assert.equal(economyCategory("Breach").label, "Catalysts");
  assert.equal(economyCategory("Ritual").label, "Omens");
  assert.throws(() => economyCategory("Tattoos"), /no label/, "an unlabelled type fails loudly");
  assert.equal(categoryBySlug("omens")?.type, "Ritual");
  assert.equal(categoryBySlug("bogus"), null);
  pass("categories: every CATEGORIES type labelled, unique slugs, unmapped type throws");
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
  const stray = { ...latestPriceRows(A)[0]!, category: "Tattoos" };
  assert.throws(() => buildMarketPrices({ league: A, rows: [stray], cx: null, rates: null }), /no label/);
  pass("buildMarketPrices: Divine per item, unknown = null, cx flow wins, curated/fallback art, contract round-trip");
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
  assert.deepEqual([fmtChange(12.4), fmtChange(-3.46), fmtChange(0)], ["+12%", "−3.5%", "0%"]);
  pass("pricesView: nulls sink both ways, movers/liquid filters, cross-category search, sort toggles");
}

testCategories();
testLatestRows();
testBuilder();
testView();
