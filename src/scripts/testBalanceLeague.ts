/* Temp-DB test of league-scoped net-worth reads: every read sees only the requested league,
 * %-change baselines compare like-with-like sources, and trade-read annotations round-trip. */
import "../config/env";
import { getDb } from "../db/database";
import { insertBalance, insertTabs, type BalanceInput } from "../db/queries";
import { annotateBalanceScan, balanceStats, getBalances, latestTabs, tabSeries } from "../db/balanceQueries";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const USER = 1;
const A = "Test League A";
const B = "Test League B";
const db = getDb();
// the per-target temp DB persists between runs — start from a clean slate for our leagues
db.prepare("DELETE FROM balance_snapshots WHERE league IN (?, ?)").run(A, B);

const snap = (league: string, divine: number, source: BalanceInput["source"], hoursAgo: number, otherDiv = 0): number => {
  const s = insertBalance(USER, league, { divine, exalted: 0, chaos: 0, exaltPerDiv: 100, chaosPerDiv: 10, otherDiv, source });
  db.prepare("UPDATE balance_snapshots SET fetched_at = datetime('now', ?) WHERE id = ?").run(`-${hoursAgo} hours`, s.id);
  return s.id;
};
const tab = (id: number, name: string, valueDiv: number) =>
  insertTabs(id, [{ tab: name, divine: valueDiv, exalted: 0, chaos: 0, otherDiv: 0, valueDiv, items: 1, unpriced: 0 }]);

// League A: trade reads 100 (48h ago) → 150 (now), plus a manual entry 30h ago at 10 (currency only).
const a1 = snap(A, 100, "trade", 48);
tab(a1, "A-tab", 100);
snap(A, 10, "manual", 30);
const a3 = snap(A, 150, "trade", 0);
tab(a3, "A-tab", 150);
// League B: one big trade snapshot — must never leak into A.
const b1 = snap(B, 9000, "trade", 1);
tab(b1, "B-tab", 9000);

{
  const rowsA = getBalances(USER, A);
  ok("getBalances(A) only returns league A rows", rowsA.length === 3 && rowsA.every((r) => r.league === A), String(rowsA.length));
  ok("getBalances(B) only returns league B rows", getBalances(USER, B).length === 1);
}

{
  const s = balanceStats(USER, A);
  ok("balanceStats latest is league A's newest", s.latest?.id === a3, String(s.latest?.id));
  ok("balanceStats count scoped to league", s.count === 3, String(s.count));
  // like-with-like: the 24h baseline must be the 48h-old TRADE snapshot (100), not the 30h manual (10)
  ok("24h change compares trade vs trade (+50%)", s.change24hPct != null && Math.abs(s.change24hPct - 50) < 1e-9, String(s.change24hPct));
  ok("all-time baseline is the first same-source snapshot", s.first?.id === a1 && s.changeAllPct != null && Math.abs(s.changeAllPct - 50) < 1e-9, `${s.first?.id} ${s.changeAllPct}`);
  const sb = balanceStats(USER, B);
  ok("league B has no 24h baseline (no older same-source row)", sb.change24hPct === null && sb.latest?.id === b1);
  ok("empty league → no latest", balanceStats(USER, "Nope League").latest === null);
}

{
  const tabsA = latestTabs(USER, A);
  ok("latestTabs(A) = A's newest tab breakdown", tabsA.length === 1 && tabsA[0]!.tab === "A-tab" && tabsA[0]!.value_div === 150, JSON.stringify(tabsA));
  const seriesA = tabSeries(USER, A);
  ok("tabSeries(A) excludes league B tabs", seriesA.length === 2 && seriesA.every((p) => p.tab === "A-tab"), JSON.stringify(seriesA));
  ok("tabSeries(A) is oldest → newest", seriesA[0]!.value_div === 100 && seriesA[1]!.value_div === 150);
}

{
  annotateBalanceScan(a3, { listedSeen: 100, listedTotal: 240, gearAtAskDiv: 3.5 });
  const latest = balanceStats(USER, A).latest;
  ok(
    "annotateBalanceScan round-trips listed_seen/listed_total/gear_at_ask_div",
    latest?.listed_seen === 100 && latest.listed_total === 240 && latest.gear_at_ask_div === 3.5,
    JSON.stringify(latest),
  );
  const manual = getBalances(USER, A).find((r) => r.source === "manual");
  ok("un-annotated snapshots read the new columns as NULL", manual?.listed_seen === null && manual.gear_at_ask_div === null);
}

db.prepare("DELETE FROM balance_snapshots WHERE league IN (?, ?)").run(A, B);
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
