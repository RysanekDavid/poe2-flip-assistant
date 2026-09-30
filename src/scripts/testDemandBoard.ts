/* Market › board regressions (2026-09-30): only page 1 of each poe2scout category was read, and a
 * league where scout has no recent price history showed an empty default view with sell-through,
 * trend and heat all 0. Covers paging + dedupe, the shared demand cache, the history → unknown
 * logic and the default filter. */
import {
  createDemandCache,
  fetchCategoryPages,
  hasPriceHistory,
  historyByItem,
  HISTORY_WINDOW_MS,
  MAX_DEMAND_PAGES,
  toDemandItems,
  WARNED_TTL_MS,
  type ByCategoryItem,
  type ByCategoryPage,
  type DemandData,
  type HistoryPoint,
} from "../api/scoutDemand";
import { SCOUT_CACHE_TTL_MS } from "../api/scoutClient";
import { demandTrust, heatScore } from "../core/demandHeat";
import { rankSnipeTargets } from "../core/snipeTargets";
import { tradeListingQuote } from "../core/wealth/tradeRoute";
import type { DemandRow } from "../lib/demandContract";
import { applyFilters, DEFAULT_FILTERS, DEFAULT_SORT, sortRows } from "../lib/demandView";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};
const errOf = <T>(p: Promise<T>): Promise<string | null> => p.then(() => null, (e: unknown) => String(e));

const NOW = Date.parse("2026-09-30T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const item = (id: number, over: Partial<ByCategoryItem> = {}): ByCategoryItem => ({
  ItemId: id,
  Name: `Unique ${id}`,
  Type: "Base",
  CategoryApiId: "armour",
  IconUrl: null,
  CurrentPrice: 100,
  CurrentQuantity: 20,
  ...over,
});

/** A fake paged category that records every page asked for; `ids(page)` picks each page's rows. */
function fakeCategory(pages: number, ids: (page: number) => number[]) {
  const asked: number[] = [];
  const fetchPage = async (page: number): Promise<ByCategoryPage> => {
    asked.push(page);
    return { CurrentPage: page, Pages: pages, Items: ids(page).map((id) => item(id)) };
  };
  return { asked, fetchPage };
}
const range = (from: number, n: number): number[] => Array.from({ length: Math.max(0, n) }, (_, i) => from + i);
/** 227 rows at 100 per page, like armour on 2026-09-30. */
const armour = (page: number): number[] => range((page - 1) * 100 + 1, Math.min(100, 227 - (page - 1) * 100));

async function testPaging(): Promise<void> {
  const cat = fakeCategory(3, armour);
  const { items, repeats } = await fetchCategoryPages("armour", cat.fetchPage);
  ok("paging: all 227 items across 3 pages", items.length === 227 && repeats === 0, String(items.length));
  ok("paging: pages fetched in order, once each", cat.asked.join(",") === "1,2,3", cat.asked.join(","));

  const single = fakeCategory(1, () => range(1, 40));
  ok("paging: a one-page category makes one request", (await fetchCategoryPages("flask", single.fetchPage)).items.length === 40 && single.asked.length === 1);
  const empty = fakeCategory(0, () => []);
  ok("paging: Pages = 0 stops after the first request", (await fetchCategoryPages("sanctum", empty.fetchPage)).items.length === 0 && empty.asked.length === 1);

  const ignored = async (): Promise<ByCategoryPage> => ({ CurrentPage: 1, Pages: 3, Items: [item(1)] });
  const ignoredErr = await errOf(fetchCategoryPages("armour", ignored));
  ok("paging: a page param scout ignores throws instead of duplicating page 1", ignoredErr?.includes("got page 1") === true, ignoredErr ?? "no throw");

  const runaway = fakeCategory(MAX_DEMAND_PAGES + 5, (page) => [page]);
  const runawayErr = await errOf(fetchCategoryPages("weapon", runaway.fetchPage));
  ok("paging: bounded — a runaway page count throws", runawayErr?.includes("more than") === true && runaway.asked.length === MAX_DEMAND_PAGES);
}

async function testDedupe(): Promise<void> {
  // a price update mid-paging shifts row 100 onto page 2 as well
  const shifted = fakeCategory(2, (page) => (page === 1 ? range(1, 100) : range(100, 51)));
  const { items, repeats } = await fetchCategoryPages("armour", shifted.fetchPage);
  ok("dedupe: a row repeated across pages is kept once", items.length === 150 && new Set(items.map((i) => i.ItemId)).size === 150, String(items.length));
  ok("dedupe: repeats are counted", repeats === 1, String(repeats));

  const circular = fakeCategory(3, (page) => (page === 1 ? range(1, 100) : range(1, 100)));
  const err = await errOf(fetchCategoryPages("weapon", circular.fetchPage));
  ok("dedupe: a page made only of earlier rows throws", err?.includes("only repeats") === true && circular.asked.join(",") === "1,2", err ?? "no throw");
}

const data = (warnings: string[] = []): DemandData => ({ rates: { exaltPerDivine: 500, chaosPerDivine: 30 }, items: [], warnings });

async function testCache(): Promise<void> {
  let clock = NOW;
  let loads = 0;
  let warnings: string[] = [];
  let release: () => void = () => undefined;
  const cache = createDemandCache(async () => {
    loads += 1;
    await new Promise<void>((r) => (release = r));
    return data(warnings);
  }, () => clock);

  const [a, b] = [cache.get("L"), cache.get("L")];
  release();
  const [ra, rb] = await Promise.all([a, b]);
  ok("inflight: two parallel callers share one fill", loads === 1 && ra === rb, `loads ${loads}`);
  const again = cache.get("L");
  ok("cache: a fresh clean fill is served without loading", loads === 1 && (await again) === ra);
  clock += WARNED_TTL_MS + 1;
  await cache.get("L");
  ok("cache: a clean fill outlives the warned TTL", loads === 1);
  clock += SCOUT_CACHE_TTL_MS;
  const expired = cache.get("L");
  release();
  await expired;
  ok("cache: a clean fill expires after the full TTL", loads === 2, `loads ${loads}`);

  warnings = ["poe2scout category failed — jewel: 503"];
  clock += SCOUT_CACHE_TTL_MS + 1;
  const warned = cache.get("L");
  release();
  await warned;
  clock += WARNED_TTL_MS + 1;
  const retry = cache.get("L");
  release();
  await retry;
  ok("cache: a fill with warnings retries after WARNED_TTL_MS", loads === 4, `loads ${loads}`);
}

async function testInflightFailure(): Promise<void> {
  let loads = 0;
  const cache = createDemandCache(async () => {
    loads += 1;
    if (loads === 1) throw new Error("scout down");
    return data();
  });
  const first = await errOf(cache.get("L"));
  ok("inflight: a failed fill rejects its callers", first?.includes("scout down") === true);
  await cache.get("L");
  ok("inflight: cleared after a failure, so the next call loads again", loads === 2, `loads ${loads}`);
}

const pts = (...days: Array<[daysAgo: number, price: number, qty: number]>): HistoryPoint[] =>
  days.map(([ago, price, quantity]) => ({ price, quantity, atMs: NOW - ago * DAY })).sort((x, y) => x.atMs - y.atMs);

function testHistory(): void {
  const hist = historyByItem({
    ItemHistories: [{ ItemId: 1, History: [{ Price: 4, Quantity: 5, Time: "2026-09-11T03:13:11.4207100Z" }, { Price: 3, Quantity: 6, Time: "2026-09-10T20:56:46.1811760Z" }] }],
  });
  ok("history: points sorted oldest→newest", hist.get(1)?.map((p) => p.price).join(",") === "3,4");
  for (const bad of ["soon", "2026-09-11T03:13:11"]) {
    let err: string | null = null;
    try {
      historyByItem({ ItemHistories: [{ ItemId: 2, History: [{ Price: 1, Quantity: 1, Time: bad }] }] });
    } catch (e: unknown) {
      err = String(e);
    }
    ok(`history: time "${bad}" (unparseable or zone-less) throws`, err?.includes("no zone") === true, err ?? "no throw");
  }
  ok("history: an offset time is accepted", historyByItem({ ItemHistories: [{ ItemId: 3, History: [{ Price: 1, Quantity: 1, Time: "2026-09-11T03:13:11+02:00" }] }] }).get(3)?.length === 1);

  // today's scout: every unique has points, but all older than the window
  const stale = new Map([[1, pts([68, 90, 30], [40, 100, 24], [18, 120, 12])]]);
  const [bare, missing] = toDemandItems([item(1), item(2)], stale, NOW);
  ok("stale history → sell-through, trend, listed avg unknown (null), not 0", bare!.sellThrough === null && bare!.momentumPct === null && bare!.listedAvg === null);
  ok("stale history → heat unknown (null), not 0", heatScore(bare!.sellThrough, bare!.momentumPct) === null);
  ok("stale history still dates the price", bare!.samples === 0 && bare!.priceExalt === 100 && bare!.priceAt === new Date(NOW - 18 * DAY).toISOString());
  ok("item missing from the history → age unknown (null)", missing!.priceAt === null);
  ok("no recent history anywhere → league has none", !hasPriceHistory([bare!, missing!]));

  const fresh = new Map([[3, pts([6, 90, 30], [4, 100, 24], [2, 110, 18], [0.5, 120, 12], [9, 50, 99])]]);
  const [live] = toDemandItems([item(3)], fresh, NOW);
  ok("recent history → sell-through and trend are numbers", live!.sellThrough != null && live!.sellThrough > 0 && (live!.momentumPct ?? 0) > 0);
  ok("only points inside the 7-day window count", live!.samples === 4 && live!.sparkPrices.join(",") === "90,100,110,120" && HISTORY_WINDOW_MS === 7 * DAY);
  ok("recent history → league has it", hasPriceHistory([live!]));

  ok("trust: no history but enough listings is not thin", demandTrust(0, 20, 0) === "no-history");
  ok("trust: too few listings is thin even without history", demandTrust(0, 2, 0) === "thin");
  ok("trust: a short history is thin", demandTrust(2, 20, 0) === "thin");
  ok("trust: enough history + listings is ok", demandTrust(5, 20, 0) === "ok");
}

function testSnipeAndWealth(): void {
  const valuable = toDemandItems([item(1, { CurrentPrice: 50 * 500 })], new Map(), NOW);
  ok("snipe targets: no history → none qualify (the panel explains why)", rankSnipeTargets(valuable, 500).length === 0 && !hasPriceHistory(valuable));
  const rates = { exaltPerDivine: 500, chaosPerDivine: 30 };
  const q = tradeListingQuote(2, 1, { listed: 5, sellThrough: null, samples: 0 }, rates);
  ok("wealth competition: unknown sell-through stays null, no 'slow' claim", q.competition?.sellThrough === null && q.competitionNote === null);
}

const row = (id: number, marketDivine: number, trust: DemandRow["trust"]): DemandRow => ({
  id, name: `U${id}`, type: "Base", category: "armour", icon: null, marketDivine, priceAt: null, quantity: 20,
  listedAvg: null, sellThrough: null, momentumPct: null, spark: [], heat: null, trust, divergePct: 0, tradeUrl: "",
});

function testDefaultView(): void {
  // today's league: no row has history — the old default ("hide thin", thin = no history) showed nothing
  const rows = [row(1, 0.05, "no-history"), row(2, 3700, "no-history"), row(3, 29, "no-history"), row(4, 0.9, "no-history"), row(5, 12, "thin")];
  const shown = sortRows(applyFilters(rows, DEFAULT_FILTERS), DEFAULT_SORT.key, DEFAULT_SORT.dir);
  ok("default view: rows without history are shown", shown.length > 0);
  ok("default view: ≥ 1 Div only, by value, thin hidden", shown.map((r) => r.id).join(",") === "2,3", shown.map((r) => r.id).join(","));
  const all = sortRows(applyFilters(rows, { ...DEFAULT_FILTERS, valuableOnly: false, trustedOnly: false }), DEFAULT_SORT.key, DEFAULT_SORT.dir);
  ok("both toggles off: everything, most valuable first", all.map((r) => r.id).join(",") === "2,3,5,4,1", all.map((r) => r.id).join(","));
  const byHeat = sortRows([{ ...row(6, 5, "ok"), heat: 10 }, row(7, 5, "no-history"), { ...row(8, 5, "ok"), heat: 40 }], "heat", "asc");
  ok("unknown heat sorts last in either direction", byHeat.map((r) => r.id).join(",") === "6,8,7", byHeat.map((r) => r.id).join(","));
}

async function main(): Promise<void> {
  await testPaging();
  await testDedupe();
  await testCache();
  await testInflightFailure();
  testHistory();
  testSnipeAndWealth();
  testDefaultView();
  console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
