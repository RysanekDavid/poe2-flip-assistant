/* Alert center contracts: the pure grouping/mute helpers the ticker + popover render from, and
 * the per-type capped feed, exact counts and per-type mark-seen against a TEMP DB — keeping the
 * league rule (market alerts per viewed league; default-league pipelines in every view).
 * Run: npm run test:notify (runWithTestEnv.ts alert-center). */
import { config } from "../config/env";
import { getDb } from "../db/database";
import { getAlertCounts, getAlertFeed, insertAlert, markVisibleSeen } from "../db/alertQueries";
import { freshForNotify, groupAlerts, maxAlertId, tickerRecent, unmutedUnseen, type Alert } from "../lib/alertCenter";

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
  id, type, item_id: `i${id}`, item_name: null, message: "m", value: 1, threshold: 1, whisper: null, link: null,
  seen, created_at: at, foreign_league: null,
});

testGrouping();
testFeedQueries();

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
  ok("ticker strip skips muted types", tickerRecent(alerts, ["TREND"], 3).map((a) => a.id).join(",") === "5,4,2");
  ok("browser notify: only newer + unmuted", freshForNotify(alerts, 2, ["TREND"]).map((a) => a.id).join(",") === "5,4");
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
