/* DB half of test:tools:liquidate (Wealth › Sell): balance_items listing identity + retention,
 * idempotent migrations, cred state, listing_comps retention, reprice queue / cooldown / budget,
 * and the sell response contract. Needs the temp DB runWithTestEnv points DB_PATH at. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import Bottleneck from "bottleneck";
import { scanListings, type ScannedItem } from "../../api/accountScan";
import { TradeAuthError, TradeRateLimitedError } from "../../api/tradeErrors";
import { parseFetchResponse, type Listing } from "../../api/tradeListing";
import { scheduleMetered } from "../../api/tradeMeter";
import { withCredStatus } from "../../auth/credStatus";
import { groupStashItems } from "../../core/wealth/plan";
import { pickRepriceCandidates, runRepriceScan, REPRICE_MAX_SEARCHES, type RepriceDeps } from "../../core/wealth/repriceScan";
import {
  BALANCE_ITEMS_KEEP_SNAPSHOTS, insertBalanceItems, latestStashItems, recentStashReads, type BalanceItemRow,
} from "../../db/balanceItemQueries";
import { ensureCredColumns } from "../../db/credMigrations";
import { getCredStatus, resetCredStatus } from "../../db/credStatusQueries";
import { listingComps, pruneListingComps, upsertListingComp, type CompWrite } from "../../db/listingCompsQueries";
import { ensureWealthColumns } from "../../db/wealthMigrations";
import { columnsOf, freshToolsDb, insertUser } from "./toolsTestKit";
import { runRepriceQueueTests } from "./repriceQueueTests";
import { testSellContract } from "./wealthContractTest";

const RATES = { exaltPerDivine: 400, chaosPerDivine: 20 };
const near = (a: number, b: number, msg: string): void => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
const DAY = 24 * 60 * 60 * 1000;

function snapshotFor(db: Database.Database, userId: number, league: string, hoursAgo: number): number {
  const r = db
    .prepare(
      `INSERT INTO balance_snapshots (user_id, league, exalt_per_div, chaos_per_div, net_worth_div, source, listed_seen, listed_total, fetched_at)
       VALUES (?, ?, 400, 20, 0, 'trade', 2, 2, datetime('now', ?))`,
    )
    .run(userId, league, `-${hoursAgo} hours`);
  return Number(r.lastInsertRowid);
}

export const scanned = (itemName: string, over: Partial<ScannedItem> = {}): ScannedItem => ({
  listingId: `id-${itemName}`, indexed: "2026-09-20T10:00:00Z", rare: null, tab: "sell", itemName, baseType: itemName, rarity: null,
  stackSize: 1, marketDiv: null, marketSource: null, ask: { amount: 2, currency: "divine" }, ...over,
});

function testBalanceItems(db: Database.Database): void {
  assert.deepEqual(columnsOf(db, "balance_items"), [
    "id", "snapshot_id", "tab", "item_name", "base_type", "rarity", "stack_size", "market_div", "market_source",
    "ask_amount", "ask_currency", "listing_id", "indexed_at", "item_json",
  ]);
  const me = insertUser(db, "seller");
  const other = insertUser(db, "other");
  assert.deepEqual(latestStashItems(me, "L"), { snapshot: null, items: [] });
  const ids: number[] = [];
  for (let i = BALANCE_ITEMS_KEEP_SNAPSHOTS + 2; i >= 1; i--) {
    const id = snapshotFor(db, me, "L", i);
    insertBalanceItems(id, [scanned(`Item ${i}`, { stackSize: 3 }), scanned("Divine Orb", { stackSize: 5, listingId: "" })]);
    ids.push(id);
  }
  insertBalanceItems(snapshotFor(db, other, "L", 100), [scanned("Their Item")]);
  const [latest, previous] = recentStashReads(me, "L", 2);
  assert.equal(latest?.snapshot.id, ids[ids.length - 1], "newest trade read first");
  assert.equal(previous?.items[0]?.item_name, "Item 2", "then the read before it (sold-since baseline)");
  assert.deepEqual(latest?.items.map((r) => [r.item_name, r.listing_id, r.indexed_at]), [
    ["Item 1", "id-Item 1", "2026-09-20T10:00:00Z"], ["Divine Orb", null, "2026-09-20T10:00:00Z"],
  ], "listing identity stored; an empty parser id is stored as unknown (NULL)");
  const withItems = db.prepare("SELECT COUNT(DISTINCT snapshot_id) c FROM balance_items bi JOIN balance_snapshots s ON s.id = bi.snapshot_id WHERE s.user_id = ?").get(me) as { c: number };
  assert.equal(withItems.c, BALANCE_ITEMS_KEEP_SNAPSHOTS, "item rows of older reads are trimmed");
  assert.equal(latestStashItems(other, "L").items.length, 1, "another user's rows are never trimmed");
  db.prepare("DELETE FROM balance_snapshots WHERE id = ?").run(ids[ids.length - 1]);
  assert.equal(latestStashItems(me, "L").items[0]?.item_name, "Item 2", "a deleted snapshot takes its items with it (cascade)");
  const grouped = groupStashItems(latestStashItems(me, "L").items, RATES);
  assert.equal(grouped.skippedOrbs, 1, "raw orbs are never planned");
  assert.deepEqual(grouped.items, [
    { name: "Item 2", qty: 3, rarity: null, tabs: ["sell"], askDiv: 2, listingId: "id-Item 2", listedAt: "2026-09-20T10:00:00Z" },
  ], "the stored ask is per unit — never divided by the stack");
}

function fixtureListings(): Listing[] {
  return parseFetchResponse(JSON.parse(readFileSync(resolve("src/scripts/fixtures/trade2-fetch-shape.json"), "utf8")));
}

function testAccountScanItems(db: Database.Database): void {
  const valuer = { value: (name: string, stack: number) => (name === "Twin Grasp" ? { div: 5 * Math.max(1, stack), source: "scout" as const } : null) };
  const scan = scanListings(fixtureListings(), 9, RATES, valuer);
  const doom = scan.items.find((i) => i.itemName === "Doom Grip");
  assert.ok(doom);
  assert.deepEqual([doom.listingId, doom.indexed, doom.marketSource, doom.marketDiv], ["fx-gloves-ib", "2026-09-25T10:00:00Z", "ask", 3]);
  assert.ok(doom.rare != null && doom.rare.modLines.length > 0, "a rare keeps its rolls for the reprice search");
  const rune = scan.items.find((i) => i.itemName === "Rune Loop");
  assert.deepEqual([rune?.marketDiv, rune?.ask], [null, null], "no price, no market → unpriced (null)");
  const user = insertUser(db, "scanner");
  insertBalanceItems(snapshotFor(db, user, "S", 1), scan.items);
  const stored = latestStashItems(user, "S").items.find((r) => r.item_name === "Doom Grip");
  assert.deepEqual(stored?.item_json, doom.rare, "item_json round-trips the rare's rolls");
}

function testMigrations(db: Database.Database): void {
  // An old DB: users and balance_items as they shipped, before any of these columns.
  const old = new Database(":memory:");
  old.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO users (id, name) VALUES (1, 'o');");
  old.exec("CREATE TABLE balance_items (id INTEGER PRIMARY KEY, snapshot_id INTEGER, item_name TEXT)");
  for (let i = 0; i < 2; i++) {
    ensureCredColumns(old);
    ensureWealthColumns(old);
  }
  assert.deepEqual(columnsOf(old, "users"), ["id", "name", "poe_cred_state", "poe_cred_checked_at", "poe_cred_error"]);
  assert.deepEqual(columnsOf(old, "balance_items"), ["id", "snapshot_id", "item_name", "listing_id", "indexed_at", "item_json"]);
  assert.equal((old.prepare("SELECT poe_cred_state s FROM users").get() as { s: string }).s, "unknown", "existing rows read 'unknown'");
  old.close();
  const before = [columnsOf(db, "users").length, columnsOf(db, "balance_items").length];
  ensureCredColumns(db);
  ensureWealthColumns(db);
  assert.deepEqual([columnsOf(db, "users").length, columnsOf(db, "balance_items").length], before, "re-running on a migrated DB is a no-op");
  const bare = new Database(":memory:");
  assert.throws(() => ensureWealthColumns(bare), /balance_items missing/, "wrong schema order fails loudly");
  bare.close();
}

async function testCredStatus(db: Database.Database): Promise<void> {
  const u = insertUser(db, "cookie");
  const stored = { poesessid: "a".repeat(32), source: "stored" as const };
  assert.deepEqual(getCredStatus(u), { state: "unknown", checkedAt: null, error: null });
  const envCred = { poesessid: "b".repeat(32), source: "env" as const };
  await assert.rejects(withCredStatus(u, envCred, async () => Promise.reject(new TradeAuthError("post", "/search"))), TradeAuthError);
  assert.equal(getCredStatus(u).state, "unknown", "the owner's .env fallback cookie never judges the saved one");
  await assert.rejects(withCredStatus(u, stored, async () => Promise.reject(new TradeAuthError("post", "/search/poe2/L"))), TradeAuthError);
  const expired = getCredStatus(u);
  assert.equal(expired.state, "expired");
  assert.match(expired.error ?? "", /403.*POESESSID/);
  await assert.rejects(withCredStatus(u, stored, async () => Promise.reject(new TradeRateLimitedError("search", 5000))), TradeRateLimitedError);
  assert.equal(getCredStatus(u).state, "expired", "a busy budget says nothing about the cookie");
  assert.equal(await withCredStatus(u, stored, async () => 7), 7);
  assert.deepEqual([getCredStatus(u).state, getCredStatus(u).error], ["ok", null], "a success clears expired");
  resetCredStatus(u);
  assert.deepEqual(getCredStatus(u), { state: "unknown", checkedAt: null, error: null }, "a new cookie has not been tried");
  assert.equal(new TradeAuthError("get", "/fetch/x").status, 403);
}

function testComps(db: Database.Database): void {
  const u = insertUser(db, "comper");
  const c = (listingId: string, fairDiv: number | null): CompWrite => ({ listingId, itemName: `Item ${listingId}`, fairDiv, cheapestDiv: fairDiv, samples: 3, searchUrl: null });
  upsertListingComp(u, "L", c("a", 3), new Date("2026-09-29T10:00:00Z"));
  upsertListingComp(u, "L", c("a", 2.5), new Date("2026-09-29T11:00:00Z"));
  upsertListingComp(u, "L", c("b", null));
  upsertListingComp(u, "Other", c("z", 1));
  const comps = listingComps(u, "L");
  assert.deepEqual(comps.map((x) => [x.listingId, x.fairDiv]).sort(), [["a", 2.5], ["b", null]], "one row per listing, newest check wins; nothing usable → null");
  assert.equal(pruneListingComps(u, "L", ["a"]), 1, "a listing gone from the latest read loses its comps");
  assert.deepEqual(listingComps(u, "L").map((x) => x.listingId), ["a"]);
  assert.equal(listingComps(u, "Other").length, 1, "pruning is league-scoped");
  db.prepare("DELETE FROM users WHERE id = ?").run(u);
  assert.equal(listingComps(u, "L").length, 0, "comps cascade with the user");
}

export async function runWealthDbTests(): Promise<void> {
  const db = freshToolsDb();
  testBalanceItems(db);
  testAccountScanItems(db);
  testMigrations(db);
  await testCredStatus(db);
  testComps(db);
  await runRepriceQueueTests(db);
  await testRepriceScan();
  testNoTradeSearchInWealthRoutes();
  testSellContract();
}

const row = (name: string, over: Partial<BalanceItemRow>): BalanceItemRow => ({
  tab: "t", item_name: name, base_type: "Base", rarity: "Unique", stack_size: 1, market_div: null, market_source: null,
  ask_amount: 5, ask_currency: "divine", listing_id: `L-${name}`, indexed_at: "2026-09-20T10:00:00Z", item_json: null, ...over,
});

async function testRepriceScan(): Promise<void> {
  const now = Date.parse("2026-09-29T12:00:00Z");
  const rare = { itemLevel: 80, corrupted: false, mirrored: false, modLines: [] };
  const items = [
    row("Fresh", { indexed_at: new Date(now - DAY + 60_000).toISOString() }),
    row("Cheap", { ask_amount: 300, ask_currency: "exalted" }),
    row("Orb stack", { rarity: "Currency" }),
    row("Rare no rolls", { rarity: "Rare" }),
    row("Rare with rolls", { rarity: "Rare", ask_amount: 9, item_json: rare }),
    row("No id", { listing_id: null }),
    ...Array.from({ length: 9 }, (_, i) => row(`Unique ${i}`, { ask_amount: 10 + i })),
  ];
  const picked = pickRepriceCandidates(items, RATES, now);
  assert.equal(picked.length, REPRICE_MAX_SEARCHES, "≤ 8 per run");
  assert.deepEqual(picked.slice(0, 2).map((c) => c.itemName), ["Unique 8", "Unique 7"], "priciest first");
  assert.ok(!picked.some((c) => ["Fresh", "Cheap", "Orb stack", "Rare no rolls", "No id"].includes(c.itemName)), "only ≥1 div, >24h, unique/rare-with-rolls");
  assert.ok(pickRepriceCandidates(items.slice(0, 6), RATES, now).some((c) => c.itemName === "Rare with rolls" && c.kind === "rare"));

  const limiter = new Bottleneck({ maxConcurrent: 1 });
  const writes: CompWrite[] = [];
  const listing = (id: string, account: string, amount: number): Listing => ({ ...fixtureListings()[0]!, listingId: id, account, online: true, price: { amount, currency: "divine" } });
  const deps = (failAt: number | null): RepriceDeps => {
    let n = 0;
    return {
      queryFor: async (c) => ({ name: c.itemName }),
      writeComp: (c) => writes.push(c),
      // counted through the real meter path, as tradeClient.call counts a live request
      search: (_q, _cred) =>
        scheduleMetered(limiter, "search", async (count) => {
          count();
          if (failAt != null && ++n === failAt) throw new TradeAuthError("post", "/search");
          return { total: 4, searchUrl: "https://trade/x", listings: [listing("L-Unique 8", "Me#1", 1), listing("o1", "me#1", 0.5), listing("o2", "B#2", 7), listing("o3", "C#3", 8)] };
        }),
    };
  };
  const cred = { poesessid: "x".repeat(32), account: "Me#1" };
  const ok = await runRepriceScan([...picked, ...picked], cred, RATES, deps(null));
  assert.deepEqual([ok.checked, ok.meter.search, ok.fatal], [REPRICE_MAX_SEARCHES, REPRICE_MAX_SEARCHES, null], "the meter stops the run at 8 searches");
  const first = writes[0]!;
  assert.deepEqual([first.fairDiv, first.cheapestDiv, first.samples], [7.5, 7, 2], "own listing (by id and by account) is not a comparable");
  writes.length = 0;
  const dead = await runRepriceScan(picked, cred, RATES, deps(3));
  assert.deepEqual([dead.checked, dead.meter.search, writes.length], [2, 3, 2], "a 403 ends the run — every later search would fail too");
  assert.match(dead.fatal ?? "", /403/);
}

/** Plan §C: a web route never spends trade2 searches for the Sell column — the poller does. */
function testNoTradeSearchInWealthRoutes(): void {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  for (const f of files(resolve("src/app/api/wealth"))) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/tradeClient|searchListings|createSearch|fetchListings|wealth\/repriceRun"/.test(src), `${f} must not reach trade2`);
  }
  near(REPRICE_MAX_SEARCHES * 2 * 3 / 6, 8, "3 users × (8 searches + 8 fetches) / 6h = 8 requests/h, ≤ 4 searches/h");
}
