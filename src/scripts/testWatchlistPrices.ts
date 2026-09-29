/* Manual Ange prices are per league: saving them re-stamps the user's single watchlist row to the
 * league being viewed, and re-watching a row in another league drops the old economy's prices.
 * Against a TEMP DB. Run: npm run test:user-league (runWithTestEnv.ts watchlist-prices). */
import assert from "node:assert/strict";
import { config } from "../config/env";
import { getDb } from "../db/database";
import { addWatch, getWatchlist, getWatchlistForLeague, setManualPrices, setManualPricesInLeague } from "../db/watchlistQueries";
import { clearLeagueCache, setActiveLeague } from "../core/leagueState";
import { clearUserLeague, clearUserLeagueCache, setUserLeague } from "../core/leagueUsers";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

const A = "League Alpha";
const B = "League Beta";
const USER = 2;
const ITEM = { itemId: "omen-of-light", itemName: "Omen of Light", category: "Ritual" };

const db = getDb();
db.exec("DELETE FROM watchlist; DELETE FROM users;");
db.prepare("INSERT INTO users (id, name, password_hash, api_key, role) VALUES (?, 'member', 'hash', 'pk_member', 'member')").run(USER);
clearLeagueCache();
clearUserLeagueCache();
setActiveLeague(A);

try {
  testSavingInAnotherLeagueRestampsTheRow();
  testRewatchingInAnotherLeagueDropsOldPrices();
  testRewatchingInTheSameLeagueKeepsPrices();
  clearUserLeague(USER);
  db.close();
  console.log("ALL PASS — manual prices land in the viewed league; foreign prices never carry over");
} catch (error: unknown) {
  db.close();
  console.error(error);
  process.exit(1);
}

function row() {
  const r = getWatchlist(USER, false).find((w) => w.item_id === ITEM.itemId);
  assert.ok(r, "the item has a watchlist row");
  return r;
}

function watchInAWithPrices(): void {
  db.exec("DELETE FROM watchlist");
  setUserLeague(USER, A);
  addWatch(USER, { ...ITEM, buyThresholdPct: 25, sellThresholdPct: 12 });
  setManualPrices(USER, ITEM.itemId, 800, "EXALT", 25, "CHAOS");
}

function testSavingInAnotherLeagueRestampsTheRow(): void {
  watchInAWithPrices();
  setUserLeague(USER, B);
  setManualPricesInLeague(USER, B, ITEM, { amount: 2, ccy: "DIVINE" }, { amount: 30, ccy: "CHAOS" });
  const r = row();
  assert.equal(r.league, B, "the row now belongs to the league the prices were seen in");
  assert.equal(r.manual_buy_exalt, 2);
  assert.equal(r.manual_buy_ccy, "DIVINE");
  assert.equal(r.manual_sell_chaos, 30);
  assert.equal(r.buy_threshold_pct, 25, "custom thresholds survive the re-stamp");
  assert.deepEqual(getWatchlistForLeague(USER, B).map((w) => w.item_id), [ITEM.itemId], "league B evaluates it");
  assert.deepEqual(getWatchlistForLeague(USER, A), [], "league A no longer evaluates B's prices");

  // an unwatched item is watched in the viewed league by the same call
  setManualPricesInLeague(USER, B, { itemId: "fresh", itemName: "Fresh", category: "Currency" }, { amount: 1, ccy: "EXALT" }, { amount: 2, ccy: "EXALT" });
  assert.equal(getWatchlistForLeague(USER, B).find((w) => w.item_id === "fresh")?.manual_sell_chaos, 2);
}

function testRewatchingInAnotherLeagueDropsOldPrices(): void {
  watchInAWithPrices();
  setUserLeague(USER, B);
  addWatch(USER, ITEM);
  const r = row();
  assert.equal(r.league, B);
  assert.equal(r.manual_buy_exalt, null, "A's Ange prices never become B's REAL spread");
  assert.equal(r.manual_set_at, null);
}

function testRewatchingInTheSameLeagueKeepsPrices(): void {
  watchInAWithPrices();
  addWatch(USER, ITEM);
  assert.equal(row().manual_buy_exalt, 800, "re-watching in the same league keeps your prices");
}
