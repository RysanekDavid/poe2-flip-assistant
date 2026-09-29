/* Alert noise contracts: the pure re-fire policy, fireAlert applying it against a TEMP DB, alert
 * retention (30d, unseen ≤7d kept) and the feed's ×N collapse of adjacent repeats.
 * Run: npm run test:notify (runWithTestEnv.ts alert-noise). */
import { config } from "../config/env";
import { getDb } from "../db/database";
import { pruneAlerts } from "../db/alertQueries";
import { recordSnipeOutcome } from "../db/snipeOutcomeQueries";
import { fireAlert, pruneAlertFeed } from "../core/alertEngine";
import { refireDecision, type LastAlert, type RefirePolicy } from "../core/alertRefire";
import { collapseRuns, type Alert } from "../lib/alertCenter";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

testRefirePolicy();
testFireAlertGate();
testSnipeSurvivesPrune();
testPruneGate();
testRetention();
testCollapse();

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);

function testRefirePolicy(): void {
  const policy: RefirePolicy = { cooldownMin: 60, risePct: 50, quietHours: 24 };
  const last = (ageMin: number, value: number | null, message = "m"): LastAlert => ({ ageMin, value, message });
  ok("first alert fires", refireDecision(null, { value: 20 }, policy) === "fire");
  ok("inside the cooldown nothing fires, even a big move", refireDecision(last(30, 20), { value: 100 }, policy) === "cooldown");
  ok("condition still holding, same value → quiet", refireDecision(last(120, 20), { value: 20 }, policy) === "unchanged");
  ok("+49% is not news", refireDecision(last(120, 20), { value: 29.8 }, policy) === "unchanged");
  ok("+50% is news", refireDecision(last(120, 20), { value: 30 }, policy) === "fire");
  ok("a drop is not news", refireDecision(last(120, 20), { value: 5 }, policy) === "unchanged");
  ok("after the quiet period it re-alerts once", refireDecision(last(24 * 60, 20), { value: 20 }, policy) === "fire");
  ok("TREND BUY→SELL is news regardless of value", refireDecision(last(120, 80, "BUY: up"), { value: 80, signal: "SELL" }, policy) === "fire");
  ok("TREND BUY→BUY needs the move", refireDecision(last(120, 80, "BUY: up"), { value: 90, signal: "BUY" }, policy) === "unchanged");
  ok("negative values compare by magnitude", refireDecision(last(120, -20), { value: -30 }, policy) === "fire");
  ok("no stored value falls back to the cooldown", refireDecision(last(120, null), { value: 1 }, policy) === "fire");
  ok("a zero stored value: any real move fires, zero again does not",
    refireDecision(last(120, 0), { value: 1 }, policy) === "fire" && refireDecision(last(120, 0), { value: 0 }, policy) === "unchanged");
}

function testFireAlertGate(): void {
  const db = getDb();
  db.exec("DELETE FROM alerts");
  const count = (): number => (db.prepare("SELECT COUNT(*) c FROM alerts WHERE item_id = 'recipe'").get() as { c: number }).c;
  const age = (hours: number): void => {
    db.prepare("UPDATE alerts SET created_at = datetime('now', ?) WHERE item_id = 'recipe'").run(`-${hours} hours`);
  };
  const craft = { type: "CRAFT_MARGIN" as const, itemId: "recipe", itemName: "Boots", message: "m", value: 45, threshold: 40 };
  ok("fireAlert reports a stored alert", fireAlert(1, "L", craft) === true);
  age(2);
  ok("still profitable 2h later → suppressed", fireAlert(1, "L", craft) === false && count() === 1);
  ok("margin 45%→70% → re-alerts", fireAlert(1, "L", { ...craft, value: 70 }) === true && count() === 2);
  age(25);
  ok("a day later the same margin reminds once", fireAlert(1, "L", { ...craft, value: 70 }) === true && count() === 3);
  ok("other users are gated separately", fireAlert(2, "L", craft) === true);
  ok("an alert in the old league does not suppress the first one in a new league", fireAlert(1, "New League", craft) === true);
  db.prepare("INSERT INTO alerts (user_id, league, type, item_id, item_name, message, value) VALUES (1, NULL, 'SPREAD', 'legacy-x', 'x', 'm', 99)").run();
  ok("a legacy NULL-league row is no baseline", fireAlert(1, "L", { ...craft, type: "SPREAD", itemId: "legacy-x", value: 20 }) === true);
}

function testSnipeSurvivesPrune(): void {
  const db = getDb();
  db.exec("DELETE FROM alerts; DELETE FROM snipe_outcomes");
  const snipe = { type: "SNIPE" as const, itemId: "listing-pruned", itemName: "Doom Grip", message: "m", value: 40, threshold: 35, dedupe: "once" as const };
  ok("a new listing alerts", fireAlert(1, "L", snipe) === true);
  recordSnipeOutcome({
    listingId: snipe.itemId, league: "L", profile: "p", baseType: "Vaal Gauntlets", itemName: snipe.itemName,
    askDiv: 1, valueDiv: 2, marginPct: 40, samples: 8, queryId: "q", recheckQuery: null, alertedAt: Date.now(),
  });
  db.prepare("UPDATE alerts SET created_at = datetime('now', '-40 days'), seen = 1").run();
  ok("the old snipe row leaves the feed", pruneAlerts(30, 7, db) === 1);
  ok("the same listing never re-alerts after its alert was pruned", fireAlert(1, "L", snipe) === false);
  ok("a listing with neither an alert nor an outcome still alerts", fireAlert(1, "L", { ...snipe, itemId: "listing-new" }) === true);
}

function testPruneGate(): void {
  const t0 = 1_000_000_000_000;
  const first = pruneAlertFeed(t0, true);
  ok("forced prune runs", typeof first === "number");
  ok("a prune inside the hour is skipped", pruneAlertFeed(t0 + 30 * 60_000) === null);
  ok("an hour later it runs again", typeof pruneAlertFeed(t0 + 61 * 60_000) === "number");
}

function testRetention(): void {
  const db = getDb();
  db.exec("DELETE FROM alerts");
  const put = (user: number, id: string, days: number, seen: number): void => {
    db.prepare(
      "INSERT INTO alerts (user_id, league, type, item_id, item_name, message, seen, created_at) VALUES (?, 'L', 'SPREAD', ?, 'x', 'm', ?, datetime('now', ?))",
    ).run(user, id, seen, `-${days} days`);
  };
  put(1, "old-seen", 40, 1);
  put(1, "old-unseen", 40, 0);
  put(1, "recent-seen", 10, 1);
  put(2, "u2-old", 31, 1);
  put(2, "u2-fresh", 1, 0);
  const removed = pruneAlerts(30, 7, db);
  const left = (db.prepare("SELECT item_id FROM alerts ORDER BY item_id").all() as Array<{ item_id: string }>).map((r) => r.item_id);
  ok("30d retention drops old alerts of every user", removed === 3, `${removed} removed`);
  ok("younger alerts survive", left.join(",") === "recent-seen,u2-fresh", left.join(","));

  db.exec("DELETE FROM alerts");
  put(1, "unseen-5d", 5, 0);
  put(1, "seen-5d", 5, 1);
  put(1, "unseen-9d", 9, 0);
  pruneAlerts(3, 7, db);
  const short = (db.prepare("SELECT item_id FROM alerts ORDER BY item_id").all() as Array<{ item_id: string }>).map((r) => r.item_id);
  ok("a shorter retention still keeps unseen alerts ≤7d old", short.join(",") === "unseen-5d", short.join(","));
}

function testCollapse(): void {
  const mk = (id: number, type: string, item: string, seen = 1, name: string | null = null): Alert => ({
    id, type, item_id: item, item_name: name, message: `v${id}`, value: id, threshold: 1, whisper: null, link: null,
    details: null, details_error: null, seen, created_at: `2026-09-26 10:${String(60 - id).padStart(2, "0")}:00`, foreign_league: null,
  });
  // newest first, as the feed renders
  const runs = collapseRuns([
    mk(9, "SPREAD", "divine"),
    mk(8, "SPREAD", "divine", 0),
    mk(7, "SPREAD", "divine"),
    mk(6, "TREND", "divine"),
    mk(5, "SPREAD", "divine"),
    mk(4, "LEAGUE", "league", 1, "Alpha"),
    mk(3, "LEAGUE", "league", 1, "Beta"),
  ]);
  ok("adjacent same type+item fold into one row", runs[0]?.count === 3 && runs[0]?.alert.id === 9);
  ok("the folded row shows the newest value", runs[0]?.alert.message === "v9");
  ok("an unseen alert anywhere in the run keeps the row unseen", runs[0]?.unseen === true);
  ok("a different type in between breaks the run", runs.map((r) => r.count).join(",") === "3,1,1,1,1", runs.map((r) => r.count).join(","));
  ok("LEAGUE rows for different leagues stay apart", runs.filter((r) => r.alert.type === "LEAGUE").length === 2);
  const snipes = collapseRuns([mk(2, "SNIPE", "listing"), mk(1, "SNIPE", "listing")]);
  ok("SNIPE cards never fold, even with the same listing id", snipes.length === 2 && snipes.every((r) => r.count === 1));
  ok("empty feed → no rows", collapseRuns([]).length === 0);
}
