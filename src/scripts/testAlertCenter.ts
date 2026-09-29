/* Alert center contracts: the pure grouping/mute helpers the ticker + popover render from, and
 * the per-type capped feed, exact counts and per-type mark-seen against a TEMP DB — keeping the
 * league rule (market alerts per viewed league; default-league pipelines in every view).
 * Run: npm run test:notify (runWithTestEnv.ts alert-center). */
import { config } from "../config/env";
import { getDb } from "../db/database";
import { getAlertCounts, getAlertFeed, insertAlert, markVisibleSeen } from "../db/alertQueries";
import { AlertCenterSchema, actionableUnseen, freshForNotify, groupAlerts, maxAlertId, tickerRecent, unmutedUnseen, type Alert } from "../lib/alertCenter";
import { fireAlert } from "../core/alertEngine";
import { browserPrefs } from "../db/notifyQueries";
import { sampleSnipeCard } from "./snipeCardFixture";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const mk = (id: number, type: string, seen = 0, at = `2026-09-26 10:${String(id).padStart(2, "0")}:00`): Alert => ({
  id, type, item_id: `i${id}`, item_name: null, message: "m", value: 1, threshold: 1, whisper: null, link: null, details: null, details_error: null,
  seen, created_at: at, foreign_league: null,
});

testGrouping();
testFeedQueries();
testSnipeCardPersistence();

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);

function testGrouping(): void {
  const alerts = [mk(1, "TREND"), mk(2, "SNIPE"), mk(3, "TREND", 1), mk(4, "SPREAD"), mk(5, "VOLUME")];
  const counts = [
    { type: "TREND", total: 40, unseen: 30 },
    { type: "SNIPE", total: 1, unseen: 1 },
    { type: "SPREAD", total: 5, unseen: 1 },
  ];
  const groups = groupAlerts(alerts, counts, ["TREND"]);
  ok("one group per type", groups.length === 4, groups.map((g) => g.type).join(","));
  ok("unmuted first, actionable first, muted last", groups.map((g) => g.type).join(",") === "SNIPE,SPREAD,VOLUME,TREND");
  ok("server counts win over the capped rows", groups.find((g) => g.type === "TREND")?.total === 40);
  ok("type without a server count falls back to its rows", groups.find((g) => g.type === "VOLUME")?.unseen === 1);
  ok("rows newest first inside a group", groups.find((g) => g.type === "TREND")?.alerts.map((a) => a.id).join(",") === "3,1");
  ok("badge ignores muted types", unmutedUnseen(groups) === 3, String(unmutedUnseen(groups)));
  ok("bell counts actionable types only (VOLUME is not)", actionableUnseen(groups) === 2, String(actionableUnseen(groups)));
  const league = groupAlerts([mk(6, "LEAGUE"), mk(7, "CRAFT_MARGIN")], [], []);
  ok("a league switch never lights the bell; a craft margin does", actionableUnseen(league) === 1, String(actionableUnseen(league)));
  ok("muted actionable types stay off the bell", actionableUnseen(groupAlerts([mk(8, "SNIPE")], [], ["SNIPE"])) === 0);
  ok("ticker strip skips muted types", tickerRecent(alerts, ["TREND"], 3).map((a) => a.id).join(",") === "5,4,2");
  ok("browser notify: only newer alerts of the enabled types", freshForNotify(alerts, 2, ["SPREAD", "VOLUME"]).map((a) => a.id).join(",") === "5,4");
  ok("browser notify: a type with the channel off never fires", freshForNotify(alerts, 0, ["SNIPE"]).map((a) => a.id).join(",") === "2");
  ok("notify baseline counts muted ids (unmute never replays)", maxAlertId(alerts) === 5);
  ok("empty feed → no groups", groupAlerts([], [], []).length === 0);
}

function testFeedQueries(): void {
  const db = getDb();
  db.exec("DELETE FROM alerts;");
  const U = 1;
  const add = (league: string, type: string, i: number): void =>
    insertAlert(U, league, { type, itemId: `${type}-${league}-${i}`, itemName: "x", message: "m", value: i, threshold: 0 });
  for (let i = 0; i < 25; i++) add("Alpha", "TREND", i);
  for (let i = 0; i < 3; i++) add("Alpha", "SNIPE", i);
  for (let i = 0; i < 4; i++) add("Beta", "SPREAD", i); // another league's market alerts
  add("Beta", "SNIPE", 99); // default-league pipeline → shown in every view
  const feed = getAlertFeed(U, "Alpha", 10);
  const byType = (t: string): number => feed.filter((a) => a.type === t).length;
  ok("chatty type capped per type", byType("TREND") === 10);
  ok("snipes not pushed out by the chatty type", byType("SNIPE") === 4);
  ok("other league's market alerts hidden", byType("SPREAD") === 0);
  ok("other league's snipe labeled", feed.find((a) => a.item_id === "SNIPE-Beta-99")?.foreign_league === "Beta");
  const counts = new Map(getAlertCounts(U, "Alpha").map((c) => [c.type, c]));
  ok("exact totals beyond the cap", counts.get("TREND")?.total === 25 && counts.get("TREND")?.unseen === 25);
  ok("counts follow the league rule", !counts.has("SPREAD") && counts.get("SNIPE")?.total === 4);
  const changed = markVisibleSeen(U, "Alpha", "TREND");
  ok("mark seen per type covers rows beyond the cap", changed === 25);
  ok("other types untouched", getAlertCounts(U, "Alpha").find((c) => c.type === "SNIPE")?.unseen === 4);
  markVisibleSeen(U, "Alpha", null);
  const beta = new Map(getAlertCounts(U, "Beta").map((c) => [c.type, c]));
  ok("mark ALL seen leaves alerts hidden from this view unseen", beta.get("SPREAD")?.unseen === 4 && beta.get("SNIPE")?.unseen === 0);
}

function testSnipeCardPersistence(): void {
  const db = getDb();
  db.exec("DELETE FROM alerts;");
  const card = sampleSnipeCard();
  fireAlert(1, "Alpha", {
    type: "SNIPE", itemId: "card-1", itemName: card.name, message: "75% under", value: 75, threshold: 35,
    whisper: card.whisper, link: card.tradeUrl, details: card, dedupe: "once",
  });
  insertAlert(1, "Alpha", { type: "SNIPE", itemId: "card-legacy", itemName: "Old", message: "m", value: 1, threshold: 0 });
  db.prepare("INSERT INTO alerts (user_id, league, type, item_id, item_name, message, details) VALUES (1, 'Alpha', 'SNIPE', 'card-bad', 'Bad', 'm', '{}')").run();
  const feed = getAlertFeed(1, "Alpha");
  const got = feed.find((a) => a.item_id === "card-1");
  ok("SNIPE card persisted with the alert and parsed back", got?.details?.tradeUrl === card.tradeUrl && got.details.mods.length === card.mods.length);
  ok("pre-card SNIPE row → details null, no error", feed.find((a) => a.item_id === "card-legacy")?.details === null);
  const bad = feed.find((a) => a.item_id === "card-bad");
  ok("unparseable card surfaces details_error instead of vanishing", bad?.details === null && (bad.details_error ?? "").length > 0);
  const logged: unknown[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]): void => {
    logged.push(args);
  };
  try {
    getAlertFeed(1, "Alpha");
    getAlertFeed(1, "Alpha");
  } finally {
    console.error = realError;
  }
  ok("a corrupt card is logged once per process, not on every poll", logged.length === 0, String(logged.length));
  ok("…but still reported on every read", getAlertFeed(1, "Alpha").find((x) => x.item_id === "card-bad")?.details_error != null);
  const payload = AlertCenterSchema.safeParse({ alerts: feed, counts: [], ...browserPrefs(1) });
  ok("the /api/alerts payload (cards included) passes the client schema", payload.success, payload.success ? "" : payload.error.issues[0]?.message);
  let threw = false;
  try {
    fireAlert(1, "Alpha", { type: "SNIPE", itemId: "card-2", itemName: "x", message: "m", value: 1, threshold: 0, details: { ...card, icon: "http://insecure/x.png" } });
  } catch {
    threw = true;
  }
  ok("an invalid card is refused at write time, loudly", threw && !getAlertFeed(1, "Alpha").some((a) => a.item_id === "card-2"));
}
