/* Market › Opportunities contracts: the automatic budget from net worth (and none without one),
 * near-miss selection, trend eligibility (thin or stale history is left out, never faked), the
 * per-user cap on live-listing clicks, the old ?tool=board deep link, and the SNIPE alert read.
 * Run: npm run test:market-league (runWithTestEnv.ts opportunities sets a TEMP DB_PATH). */
import type { HistoryPoint } from "../api/scoutDemand";
import { TradeRateLimitedError } from "../api/tradeErrors";
import { redirectTool } from "../components/shell/tabRegistry";
import { config } from "../config/env";
import { fireAlert } from "../core/alertEngine";
import { BUDGET_SHARE_OF_NET_WORTH, budgetFromNetWorth, withinBudget } from "../core/opportunities/budget";
import { createListingsCache, lookupListings, type LookupDeps } from "../core/opportunities/listings";
import { selectLiveSnipes } from "../core/opportunities/liveSnipes";
import { buildRising, MAX_NEWEST_POINT_AGE_MS, uniqueTrend } from "../core/opportunities/rising";
import { buildSnipeSection } from "../core/opportunities/snipeSection";
import { NEAR_MISS_LIMIT, nearMissReason, selectNearMisses, type NearMissLimits } from "../core/snipeNearMiss";
import { evaluateSnipe, type SnipeGateInput } from "../core/snipeGate";
import { createLiveLimiter, LIVE_VALUES_PER_HOUR, spendReserved } from "../core/tools/modpool/liveLimit";
import { recentSnipeAlerts } from "../db/alertQueries";
import { getDb } from "../db/database";
import type { MarketUniqueItem } from "../lib/marketUniquesContract";
import { budgetSchema } from "../lib/opportunitiesContract";
import { NearMissSchema, type NearMiss } from "../lib/snipeScanContract";
import { sampleSnipeCard } from "./snipeCardFixture";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) throw new Error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const NOW = Date.parse("2026-09-30T12:00:00Z");
const MIN = 60_000;
const H = 60 * MIN;
const iso = (agoMs: number): string => new Date(NOW - agoMs).toISOString();
const GATE = { minAskDiv: 0.02, minAskFracOfValue: 0.05, minResolvedMods: 2, freshMinutes: 120, minSamples: 5 };
const LIMITS: NearMissLimits = { gate: GATE, minMarginPct: 15, minValueDiv: 1 };

function testBudget(): void {
  const none = budgetFromNetWorth(null);
  ok("budget: no net worth → no cap, never a 0 cap", none.capDiv === null && none.netWorthDiv === null && budgetSchema.safeParse(none).success);
  const b = budgetFromNetWorth({ netWorthDiv: 250, at: "2026-09-30 10:00:00" });
  ok("budget: cap = share × latest net worth", b.capDiv === 250 * BUDGET_SHARE_OF_NET_WORTH && b.sharePct === BUDGET_SHARE_OF_NET_WORTH * 100, String(b.capDiv));
  ok("budget: a zero or negative net worth is no net worth", budgetFromNetWorth({ netWorthDiv: 0, at: "x" }).capDiv === null && budgetFromNetWorth({ netWorthDiv: -3, at: "x" }).capDiv === null);
  const rows = [{ p: 5 }, { p: 25 }, { p: 26 }];
  const capped = withinBudget(rows, (r) => r.p, b);
  ok("budget: rows over the cap are hidden and counted", capped.kept.length === 2 && capped.hidden === 1);
  ok("budget: no cap keeps everything", withinBudget(rows, (r) => r.p, none).kept.length === 3);
  let threw = false;
  try {
    budgetFromNetWorth({ netWorthDiv: 1, at: "x" }, 0);
  } catch {
    threw = true;
  }
  ok("budget: a share outside (0, 1] throws", threw);
}

const input = (over: Partial<SnipeGateInput>): SnipeGateInput => ({ askDiv: 7.2, refDiv: 10, samples: 6, resolvedMods: 3, indexed: iso(20 * MIN), discountPct: 35, nowMs: NOW, ...over });
const reasonOf = (over: Partial<SnipeGateInput>) => {
  const i = input(over);
  return nearMissReason(i, evaluateSnipe(i, GATE), LIMITS);
};

function nm(id: string, marginPct: number, over: Partial<NearMiss> = {}): NearMiss {
  const valueDiv = 10;
  return NearMissSchema.parse({
    listingId: id, archetype: "Wand", name: `Wand ${id}`, baseType: "Bone Wand", rarity: "Rare", icon: null,
    priceDiv: valueDiv * (1 - marginPct / 100), valueDiv, marginPct, samples: 6, basis: "comps", reason: "not-discounted",
    detail: "under value, not enough", listedAt: iso(10 * MIN), exaltPerDivine: 200,
    tradeUrl: "https://www.pathofexile.com/trade2/search/poe2/Standard?q=x", ...over,
  });
}

function testNearMisses(): void {
  ok("near-miss: 28% under value on 6 comps", reasonOf({}) === "not-discounted");
  ok("near-miss: deep discount on 2 comps is thin-reference", reasonOf({ askDiv: 4, samples: 2 }) === "thin-reference");
  ok("near-miss: a real snipe is not a near-miss", reasonOf({ askDiv: 5 }) === null);
  ok("near-miss: only 10% under value is noise", reasonOf({ askDiv: 9 }) === null);
  ok("near-miss: a stale listing is out", reasonOf({ indexed: iso(3 * H) }) === null);
  ok("near-miss: a bait-floor ask is out", reasonOf({ askDiv: 0.01, samples: 2 }) === null);
  ok("near-miss: too few resolved mods is out", reasonOf({ resolvedMods: 1 }) === null);
  ok("near-miss: no comparables at all is out", reasonOf({ samples: 0 }) === null);
  ok("near-miss: junk under the value floor is out", reasonOf({ askDiv: 0.5, refDiv: 0.7 }) === null);

  const pool = [nm("a", 20), nm("b", 30), nm("c", 25), nm("b", 90), nm("d", 12), nm("e", 40, { listedAt: iso(3 * H) }), nm("f", 22)];
  const picked = selectNearMisses(pool, NOW, LIMITS);
  ok("near-miss: best margins first, capped", picked.map((n) => n.listingId).join(",") === "b,c,f" && picked.length === NEAR_MISS_LIMIT, picked.map((n) => n.listingId).join(","));
  ok("near-miss: a listing seen twice keeps its newest entry", picked[0]?.marginPct === 30);
  ok("near-miss: stale and sub-margin entries dropped", !picked.some((n) => n.listingId === "e" || n.listingId === "d"));
}

function testSnipeSection(): void {
  const card = (listingId: string, priceDiv: number, listedAgoMs: number) => ({
    alertId: listingId.length, listingId, league: "Runes of Aldur", seen: 0, createdAt: "2026-09-30 11:50:00",
    card: sampleSnipeCard({ priceDiv, listedAt: iso(listedAgoMs) }),
  });
  const alerts = [card("live", 0.45, 10 * MIN), card("old", 0.45, 3 * H), card("gone", 0.45, 5 * MIN), card("dear", 40, 5 * MIN)];
  const budget = budgetFromNetWorth({ netWorthDiv: 100, at: "x" });
  const section = buildSnipeSection({
    alerts, gone: new Set(["gone"]), nearMisses: [nm("live", 30), nm("n1", 30), nm("n2", 20, { priceDiv: 50 })], limits: LIMITS, budget,
    viewerLeague: "Standard", scannerEnabled: true, reportError: null, nowMs: NOW,
  });
  ok("snipes: only fresh, not-gone, affordable cards", section.cards.map((c) => c.listingId).join(",") === "live", section.cards.map((c) => c.listingId).join(","));
  ok("snipes: a near-miss that is also a card shows once", section.nearMisses.map((n) => n.listingId).join(",") === "n1");
  ok("snipes: over-budget card + near-miss counted", section.overBudget === 2, String(section.overBudget));
  ok("snipes: another league is labelled", section.cards[0]?.foreignLeague === "Runes of Aldur");
  const noWorth = selectLiveSnipes(alerts, new Set(), { viewerLeague: "Runes of Aldur", freshMinutes: 120, nowMs: NOW });
  ok("snipes: same league carries no label; no budget keeps the dear one", noWorth.every((c) => c.foreignLeague === null) && noWorth.some((c) => c.listingId === "dear"));
}

const pts = (...rows: Array<[agoH: number, price: number, qty: number]>): HistoryPoint[] =>
  rows.map(([ago, price, quantity]) => ({ price, quantity, atMs: NOW - ago * H })).sort((a, b) => a.atMs - b.atMs);
const RISING = pts([60, 100, 40], [40, 105, 38], [20, 120, 30], [6, 130, 25]);

function testTrend(): void {
  ok("trend: 4 recent points, price up, listings down → rising", uniqueTrend(RISING, true, NOW).kind === "rising");
  ok("trend: 3 points is thin", uniqueTrend(RISING.slice(1), true, NOW).kind === "thin");
  ok("trend: newest point past 48 h is stale", uniqueTrend(pts([120, 100, 40], [100, 110, 30], [80, 120, 20], [50, 130, 10]), true, NOW).kind === "stale");
  ok("trend: no recent point but older history is stale", uniqueTrend([], true, NOW).kind === "stale");
  ok("trend: no history at all is thin", uniqueTrend([], false, NOW).kind === "thin");
  ok("trend: price up while listings pile up is flat", uniqueTrend(pts([60, 100, 10], [40, 105, 12], [20, 120, 30], [6, 130, 40]), true, NOW).kind === "flat");
  ok("trend: 0-price points do not count", uniqueTrend(pts([60, 0, 40], [40, 105, 38], [20, 120, 30], [6, 130, 25]), true, NOW).kind === "thin");
}

const unique = (id: string, valueDiv: number | null): MarketUniqueItem => ({
  id, name: `U${id}`, base: "Silk Robe", category: "armour", icon: null, valueDiv, valueSource: valueDiv === null ? null : "scout",
  unpricedReason: valueDiv === null ? "no price" : null, priceAt: iso(6 * H), listings: 20, change7d: null, spark7d: [],
});

function testRising(): void {
  const history = new Map([["1", RISING], ["2", RISING], ["3", RISING], ["4", RISING.slice(2)]].map(([id, recent]) => [id as string, { recent: recent as HistoryPoint[], newestAt: iso(6 * H) }]));
  const items = [unique("1", 30), unique("2", 0.4), unique("3", null), unique("4", 50)];
  const noCap = buildRising({ items, history, newestPointAt: iso(6 * H), budget: budgetFromNetWorth(null), nowMs: NOW });
  ok("rising: ≥1 Div with a real trend only (cheap, unpriced, thin out)", noCap.items.map((i) => i.id).join(",") === "1", noCap.items.map((i) => i.id).join(","));
  ok("rising: listed then → now from the halves", noCap.items[0]?.listedThen === 39 && noCap.items[0]?.listedNow === 28, `${noCap.items[0]?.listedThen} → ${noCap.items[0]?.listedNow}`);
  const capped = buildRising({ items, history, newestPointAt: iso(6 * H), budget: budgetFromNetWorth({ netWorthDiv: 100, at: "x" }), nowMs: NOW });
  ok("rising: over-budget rows hidden, and the empty line says so", capped.items.length === 0 && capped.overBudget === 1 && capped.emptyReason?.includes("budget") === true, capped.emptyReason ?? "");
  const stale = buildRising({ items, history: new Map(), newestPointAt: iso(18 * 24 * H), budget: budgetFromNetWorth(null), nowMs: NOW });
  ok("rising: stale scout history → empty, and says how old", stale.items.length === 0 && stale.emptyReason?.includes("18 days ago") === true, stale.emptyReason ?? "");
  const none = buildRising({ items, history: new Map(), newestPointAt: null, budget: budgetFromNetWorth(null), nowMs: NOW });
  ok("rising: no scout history at all is said plainly", none.emptyReason?.includes("no price history") === true && MAX_NEWEST_POINT_AGE_MS === 48 * H);
}

async function testListingsCap(): Promise<void> {
  let searches = 0;
  const deps = (over: Partial<LookupDeps> = {}): LookupDeps => ({
    cache: createListingsCache(), limiter: createLiveLimiter({ now: () => NOW }),
    cred: { poesessid: "x", source: "stored" }, notSpent: (e) => e instanceof TradeRateLimitedError,
    search: async () => {
      searches += 1;
      return { total: 3, listings: [], searchUrl: "https://www.pathofexile.com/trade2/search/poe2/Standard/abc" };
    },
    ...over,
  });
  const d = deps();
  for (let i = 0; i < LIVE_VALUES_PER_HOUR; i++) await lookupListings({ userId: 1, key: `k${i}`, name: "U", nowMs: NOW }, d);
  const over = await lookupListings({ userId: 1, key: "k-new", name: "U", nowMs: NOW }, d);
  ok("listings: the 11th spent search in an hour is refused with a wait", over.kind === "limited" && over.retryAfterSec > 0 && searches === LIVE_VALUES_PER_HOUR);
  const hit = await lookupListings({ userId: 1, key: "k0", name: "U", nowMs: NOW + MIN }, d);
  ok("listings: a cache hit is free, even at the cap", hit.kind === "ok" && hit.body.cached && searches === LIVE_VALUES_PER_HOUR);
  ok("listings: another user has their own cap", (await lookupListings({ userId: 2, key: "k-new", name: "U", nowMs: NOW }, d)).kind === "ok");
  ok("listings: a miss without a cookie spends nothing", (await lookupListings({ userId: 3, key: "k-x", name: "U", nowMs: NOW }, deps({ cred: null }))).kind === "no-cred");
  const busy = deps({ search: async () => Promise.reject(new TradeRateLimitedError("search", 30_000)) });
  let refusals = 0;
  for (let i = 0; i < LIVE_VALUES_PER_HOUR + 2; i++) {
    try {
      await lookupListings({ userId: 4, key: `b${i}`, name: "U", nowMs: NOW }, busy);
    } catch (e: unknown) {
      if (e instanceof TradeRateLimitedError) refusals += 1;
    }
  }
  ok("listings: a busy shared budget (503) propagates and does not use up the cap", refusals === LIVE_VALUES_PER_HOUR + 2 && busy.limiter.check(4).allowed);
  // Mod pool live values and live listings share ONE window per user
  const shared = deps();
  for (let i = 0; i < LIVE_VALUES_PER_HOUR; i++) {
    const slot = shared.limiter.reserve(5);
    if (!slot.allowed) throw new Error("mod-pool spend refused early");
    await spendReserved(slot, () => false, async () => "mod-pool value");
  }
  const afterModPool = await lookupListings({ userId: 5, key: "s1", name: "U", nowMs: NOW }, shared);
  ok("listings: mod-pool spends count against the same window", afterModPool.kind === "limited");
  let calls = 0;
  let finish: () => void = () => undefined;
  const slow = deps({
    search: () => {
      calls += 1;
      return new Promise((resolve) => (finish = () => resolve({ total: 1, listings: [], searchUrl: "https://www.pathofexile.com/trade2/search/poe2/Standard/x" })));
    },
  });
  const first = lookupListings({ userId: 6, key: "same", name: "U", nowMs: NOW }, slow);
  const second = lookupListings({ userId: 7, key: "same", name: "U", nowMs: NOW }, slow);
  finish();
  const [a, b] = await Promise.all([first, second]);
  ok("listings: a second click on a search in flight shares it for free", calls === 1 && a.kind === "ok" && b.kind === "ok" && b.body.cached);
}

function testRedirectAndDb(): void {
  ok("deep link: ?tab=market&tool=board → opportunities", redirectTool("market", "board") === "opportunities" && redirectTool("farm", "board") === "board");
  const db = getDb();
  db.exec("DELETE FROM alerts");
  const snipe = (id: string) => ({ type: "SNIPE" as const, itemId: id, itemName: "Doom Grip", message: "m", value: 40, threshold: 35, dedupe: "once" as const, details: sampleSnipeCard() });
  fireAlert(1, "Runes of Aldur", snipe("fresh-1"));
  fireAlert(1, "Runes of Aldur", snipe("old-1"));
  fireAlert(2, "Runes of Aldur", snipe("other-user"));
  db.prepare("UPDATE alerts SET created_at = datetime('now', '-5 hours') WHERE item_id = 'old-1'").run();
  const rows = recentSnipeAlerts(1, 120);
  ok("db: recent SNIPE alerts of this user only, with parsed cards", rows.map((r) => r.listingId).join(",") === "fresh-1" && rows[0]?.card.name === "Doom Grip");
}

async function main(): Promise<void> {
  testBudget();
  testNearMisses();
  testSnipeSection();
  testTrend();
  testRising();
  await testListingsCap();
  testRedirectAndDb();
  console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
