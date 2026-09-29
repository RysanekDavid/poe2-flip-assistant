/* Snipe persistence contracts against a TEMP DB: once-per-listing SNIPE dedupe, the alerts
 * league filter, the zero-mod price-book refusal, the scan-request queue and the one-shot drop of
 * the retired Hunt tables.
 * Run: npm run test:snipe (src/scripts/runWithTestEnv.ts snipe-db sets DB_PATH + disables toasts). */
import { config } from "../config/env";
import { getDb, purgeLegacyPriceBook } from "../db/database";
import { dbRateStore } from "../db/tradeRateQueries";
import { createRateGovernor } from "../api/tradeRateLimit";
import { fireAlert } from "../core/alertEngine";
import { emptyReport } from "../core/autoSnipe";
import { getAlertCounts, getAlertFeed, markVisibleSeen } from "../db/alertQueries";
import { feedPriceBook, newBookCounters, bookReference } from "../core/priceBookFeed";
import { consumeScanRequests, isScanPending, requestScan } from "../db/scanRequestQueries";
import { getSnipeFailure, getSnipeReport, saveSnipeFailure, saveSnipeReport } from "../db/snipeReportQueries";
import { dropRetiredHunts } from "../db/retiredMigrations";
import { snipeOutcomeTests } from "./testSnipeOutcomes";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const db = getDb();
db.exec(`
  DELETE FROM alerts; DELETE FROM price_book_obs; DELETE FROM scan_request;
`);
const USER = 1;
const A = "League Alpha";
const B = "League Beta";
const count = (sql: string, ...p: unknown[]): number => (db.prepare(sql).get(...p) as { c: number }).c;
const age = (hours: number): void => {
  db.prepare("UPDATE alerts SET created_at = datetime('now', ?)").run(`-${hours} hours`);
};

// --- SNIPE alerts: once per listing id, EVER ---
const snipe = { type: "SNIPE" as const, itemId: "listing-1", itemName: "Doom Grip", message: "m", value: 40, threshold: 35, dedupe: "once" as const };
fireAlert(USER, A, snipe);
fireAlert(USER, A, snipe);
ok("same listing twice → one SNIPE alert", count("SELECT COUNT(*) c FROM alerts WHERE item_id = 'listing-1'") === 1);
age(5);
fireAlert(USER, A, snipe);
ok("hours later (past the old 60-min cooldown) → still one", count("SELECT COUNT(*) c FROM alerts WHERE item_id = 'listing-1'") === 1);
fireAlert(USER, A, { ...snipe, itemId: "listing-2" });
ok("a different listing does alert", count("SELECT COUNT(*) c FROM alerts WHERE item_id = 'listing-2'") === 1);
const cooldown = { type: "SPREAD" as const, itemId: "divine", itemName: "Divine", message: "m", value: 20, threshold: 15 };
fireAlert(USER, A, cooldown);
fireAlert(USER, A, cooldown);
age(5);
fireAlert(USER, A, cooldown);
ok("a spread that merely stays open does not re-alert hours later", count("SELECT COUNT(*) c FROM alerts WHERE item_id = 'divine'") === 1);
fireAlert(USER, A, { ...cooldown, value: 30 });
ok("…but a +50% move past the cooldown does", count("SELECT COUNT(*) c FROM alerts WHERE item_id = 'divine'") === 2);

// --- alerts feed: market alerts filtered to the viewed league; own-pipeline alerts labeled ---
fireAlert(USER, B, { ...snipe, itemId: "listing-beta" });
fireAlert(USER, B, { ...cooldown, itemId: "beta-spread" });
db.prepare(
  "INSERT INTO alerts (user_id, league, type, item_id, item_name, message) VALUES (?, ?, 'LEAGUE', 'league', ?, 'new league')",
).run(USER, B, B);
db.prepare("INSERT INTO alerts (user_id, league, type, item_id, item_name, message) VALUES (?, NULL, 'SPREAD', 'legacy', 'x', 'old')").run(USER);
const alphaFeed = getAlertFeed(USER, A);
ok("Alpha viewer does not see Beta MARKET alerts (spread)", !alphaFeed.some((a) => a.item_id === "beta-spread"));
const betaSnipe = alphaFeed.find((a) => a.item_id === "listing-beta");
ok("Beta SNIPE (default-league pipeline) still shown to its owner, labeled Beta", betaSnipe?.foreign_league === B, JSON.stringify(betaSnipe?.foreign_league));
ok("Alpha alerts shown unlabeled", alphaFeed.find((a) => a.item_id === "listing-1")?.foreign_league === null);
ok("LEAGUE news reaches every league view", alphaFeed.some((a) => a.type === "LEAGUE"));
ok("legacy NULL-league rows stay visible", alphaFeed.some((a) => a.item_id === "legacy"));
ok("league match is case-insensitive", getAlertFeed(USER, "league beta").some((a) => a.item_id === "beta-spread"));
const alphaUnseen = (): number => getAlertCounts(USER, A).reduce((n, c) => n + c.unseen, 0);
const before = alphaUnseen();
markVisibleSeen(USER, A, "LEAGUE");
ok("per-type mark-seen clears only that type", alphaUnseen() === before - 1 && getAlertFeed(USER, A).find((a) => a.type === "LEAGUE")?.seen === 1);
markVisibleSeen(USER, A, null);
ok("mark all seen clears the Alpha view", alphaUnseen() === 0);
ok("Beta market alert (hidden from Alpha) left unseen", getAlertFeed(USER, B).find((a) => a.item_id === "beta-spread")?.seen === 0);

// --- price book refuses zero-mod observations, counts them ---
const book = newBookCounters();
feedPriceBook(A, { sig: "vaal gauntlets|", baseType: "Vaal Gauntlets", div: 2, listingId: "z1" }, book);
feedPriceBook(A, { sig: "vaal gauntlets|a#b3~b#b4", baseType: "Vaal Gauntlets", div: 8, listingId: "g1" }, book);
ok("zero-mod observation refused + counted", book.refusedZeroMod === 1 && book.recorded === 1, JSON.stringify(book));
ok("nothing written for the bare signature", count("SELECT COUNT(*) c FROM price_book_obs WHERE sig = 'vaal gauntlets|'") === 0);
for (const [id, d] of [["g2", 10], ["g3", 11], ["g4", 9], ["g5", 10]] as const) {
  feedPriceBook(A, { sig: "vaal gauntlets|a#b3~b#b4", baseType: "Vaal Gauntlets", div: d, listingId: id }, book);
}
const withSelf = bookReference(A, "vaal gauntlets|a#b3~b#b4", null);
const withoutSelf = bookReference(A, "vaal gauntlets|a#b3~b#b4", "g1");
ok("book reference excludes the judged listing", withSelf.samples === 5 && withoutSelf.samples === 4, `${withSelf.samples}/${withoutSelf.samples}`);

// --- manual scans are queued for the poller, not run in the web process ---
requestScan("autosnipe");
requestScan("autosnipe");
ok("request pending", isScanPending("autosnipe"));
ok("duplicate requests collapse to one", consumeScanRequests("autosnipe").length === 1);
ok("consumed request is gone", !isScanPending("autosnipe") && consumeScanRequests("autosnipe").length === 0);

// --- the retired Hunt tables are dropped exactly once, with their alerts and routing rows ---
ok("fresh schema has no hunt tables → nothing to drop", !dropRetiredHunts(db));
db.exec(`
  CREATE TABLE hunts (id INTEGER PRIMARY KEY, label TEXT);
  CREATE TABLE hunt_hits (id INTEGER PRIMARY KEY, hunt_id INTEGER);
  CREATE TABLE hunt_runtime (id INTEGER PRIMARY KEY);
  INSERT INTO scan_request (kind, user_id) VALUES ('hunts', 7), ('autosnipe', 0);
  INSERT INTO subsystem_heartbeat (name, league, runs) VALUES ('hunts', '', 3);
  INSERT INTO notify_prefs (user_id, type, discord, ticker) VALUES (1, 'RESELL', 1, 1), (1, 'SNIPE', 0, 1);
`);
db.prepare("INSERT INTO alerts (user_id, league, type, item_id, item_name, message) VALUES (1, ?, 'CRAFT_BASE', 'cb-1', 'x', 'm')").run(A);
ok("legacy hunt tables dropped", dropRetiredHunts(db) && count("SELECT COUNT(*) c FROM sqlite_master WHERE name LIKE 'hunt%'") === 0);
ok("hunt scan requests + heartbeat gone, autosnipe request kept", isScanPending("autosnipe") && count("SELECT COUNT(*) c FROM scan_request WHERE kind = 'hunts'") === 0 && count("SELECT COUNT(*) c FROM subsystem_heartbeat WHERE name = 'hunts'") === 0);
ok("hunt-only alert types + their prefs gone, SNIPE pref kept", count("SELECT COUNT(*) c FROM alerts WHERE type = 'CRAFT_BASE'") === 0 && count("SELECT COUNT(*) c FROM notify_prefs WHERE type = 'RESELL'") === 0 && count("SELECT COUNT(*) c FROM notify_prefs WHERE type = 'SNIPE'") === 1);
ok("second run is a no-op", !dropRetiredHunts(db));
consumeScanRequests("autosnipe");
db.prepare("DELETE FROM notify_prefs").run();

// --- a failed autosnipe scan never wipes the last good report ---
saveSnipeReport(JSON.stringify({ findings: [{ listingId: "good-1" }] }));
saveSnipeFailure("scan failed: no fresh exchange rates");
ok("failure recorded separately", getSnipeFailure()?.error === "scan failed: no fresh exchange rates");
ok("last good report survives the failure", getSnipeReport()?.report_json.includes("good-1") === true);

// --- a stored scan report names the league it ran in (the Coach matches on it) ---
saveSnipeReport(JSON.stringify(emptyReport(350, A)));
ok("stored report carries its scan league", (JSON.parse(getSnipeReport()?.report_json ?? "{}") as { league?: string }).league === A);

// --- one-time price-book cutover purge ---
db.prepare("DELETE FROM app_settings WHERE key LIKE 'price_book_cutover%'").run();
db.prepare("INSERT INTO price_book_obs (league, sig, base_type, price_div, listing_id) VALUES (?, 'old|', 'x', 1, 'old-1')").run(A);
const firstPurge = purgeLegacyPriceBook(db);
ok("cutover purges legacy observations once", firstPurge > 0 && count("SELECT COUNT(*) c FROM price_book_obs") === 0, String(firstPurge));
feedPriceBook(A, { sig: "vaal gauntlets|a#b3~b#b4", baseType: "Vaal Gauntlets", div: 5, listingId: "post-cutover" }, book);
ok("cutover is idempotent — later runs keep new rows", purgeLegacyPriceBook(db) === 0 && count("SELECT COUNT(*) c FROM price_book_obs") === 1);

// --- DB rate store: shared, atomic reservations (web + poller see one budget) ---
db.exec("DELETE FROM trade_rate_hits; DELETE FROM trade_rate_policy;");
let clock = 1_000_000;
const govA = createRateGovernor(dbRateStore(), { now: () => clock });
const govB = createRateGovernor(dbRateStore(), { now: () => clock }); // "the other process"
ok("first search admitted", govA.reserve("search") === 0);
ok("second process sees the first's request (paced ~36s)", govB.reserve("search") === 36_000, String(govB.reserve("search")));
clock += 36_000;
ok("after the pace gap the other process may search", govB.reserve("search") === 0);
govA.observe("search", 429, { "retry-after": "90", "x-rate-limit-rules": "Ip", "x-rate-limit-ip": "5:10:60,15:60:300,30:300:1800,600:21600:3600", "x-rate-limit-ip-state": "2:10:0,2:60:0,2:300:0,2:21600:0" });
ok("a 429 seen by one process blocks the other", govB.reserve("search") === 90_000, String(govB.reserve("search")));
ok("fetch budget is separate from search", govB.reserve("fetch") === 0);

// --- snipe outcome tracking (async: the checker runs against faked trade2 calls) ---
snipeOutcomeTests(ok)
  .then(() => {
    console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((e: unknown) => {
    console.error("snipe outcome tests crashed:", e);
    process.exit(1);
  });
