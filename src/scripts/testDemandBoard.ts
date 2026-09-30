/* Market › board regressions (2026-09-30): only page 1 of each poe2scout category was read, and a
 * league where scout has no recent price log showed an empty default view with sell-through,
 * trend and heat all 0. Covers paging, the missing-history → unknown logic and the default filter. */
import {
  fetchCategoryPages,
  hasPriceHistory,
  MAX_DEMAND_PAGES,
  newestPointByItem,
  toDemandItems,
  type ByCategoryItem,
  type ByCategoryPage,
} from "../api/scoutDemand";
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

const item = (id: number, over: Partial<ByCategoryItem> = {}): ByCategoryItem => ({
  ItemId: id,
  Name: `Unique ${id}`,
  Type: "Base",
  CategoryApiId: "armour",
  IconUrl: null,
  CurrentPrice: 100,
  CurrentQuantity: 20,
  PriceLogs: [null, null, null, null, null, null, null], // what scout returns today
  ...over,
});

/** A fake 3-page category (100 + 100 + 27, like armour on 2026-09-30) that records every page asked for. */
function fakeCategory(pages: number, perPage: number, total: number) {
  const asked: number[] = [];
  const fetchPage = async (page: number): Promise<ByCategoryPage> => {
    asked.push(page);
    const from = (page - 1) * perPage;
    const ids = Array.from({ length: Math.max(0, Math.min(perPage, total - from)) }, (_, i) => from + i + 1);
    return { CurrentPage: page, Pages: pages, Items: ids.map((id) => item(id)) };
  };
  return { asked, fetchPage };
}

async function testPaging(): Promise<void> {
  const cat = fakeCategory(3, 100, 227);
  const items = await fetchCategoryPages("armour", cat.fetchPage);
  ok("paging: all 227 items across 3 pages", items.length === 227, String(items.length));
  ok("paging: pages fetched in order, once each", cat.asked.join(",") === "1,2,3", cat.asked.join(","));
  ok("paging: no duplicate ids", new Set(items.map((i) => i.ItemId)).size === 227);

  const single = fakeCategory(1, 100, 40);
  ok("paging: a one-page category makes one request", (await fetchCategoryPages("flask", single.fetchPage)).length === 40 && single.asked.length === 1);
  const empty = fakeCategory(0, 100, 0);
  ok("paging: Pages = 0 stops after the first request", (await fetchCategoryPages("sanctum", empty.fetchPage)).length === 0 && empty.asked.length === 1);

  const ignored = async (): Promise<ByCategoryPage> => ({ CurrentPage: 1, Pages: 3, Items: [item(1)] });
  const ignoredErr = await fetchCategoryPages("armour", ignored).then(() => null, (e: unknown) => String(e));
  ok("paging: a page param scout ignores throws instead of duplicating page 1", ignoredErr?.includes("got page 1") === true, ignoredErr ?? "no throw");

  const runaway = fakeCategory(MAX_DEMAND_PAGES + 5, 1, 1000);
  const runawayErr = await fetchCategoryPages("weapon", runaway.fetchPage).then(() => null, (e: unknown) => String(e));
  ok("paging: bounded — a runaway page count throws", runawayErr?.includes("more than") === true && runaway.asked.length === MAX_DEMAND_PAGES);
}

function testMissingHistory(): void {
  const ages = newestPointByItem({
    ItemHistories: [{ ItemId: 1, History: [{ Time: "2026-09-10T20:56:46.1811760Z" }, { Time: "2026-09-11T03:13:11.4207100Z" }] }],
  });
  ok("price age = newest history point", ages.get(1) === "2026-09-11T03:13:11.420Z", ages.get(1));
  let badTime: string | null = null;
  try {
    newestPointByItem({ ItemHistories: [{ ItemId: 2, History: [{ Time: "soon" }] }] });
  } catch (e: unknown) {
    badTime = String(e);
  }
  ok("unparseable history time throws", badTime?.includes("unparseable") === true, badTime ?? "no throw");

  const [bare, noAge] = toDemandItems([item(1), item(2)], ages);
  ok("no log → sell-through unknown (null), not 0", bare!.sellThrough === null);
  ok("no log → trend unknown (null), not 0", bare!.momentumPct === null);
  ok("no log → listed avg unknown (null), not 0", bare!.listedAvg === null);
  ok("no log → heat unknown (null), not 0", heatScore(bare!.sellThrough, bare!.momentumPct) === null);
  ok("no log → 0 samples, price and age kept", bare!.samples === 0 && bare!.priceExalt === 100 && bare!.priceAt === ages.get(1));
  ok("item missing from the history → age unknown (null)", noAge!.priceAt === null);
  ok("no log anywhere → league has no history", !hasPriceHistory([bare!, noAge!]));

  const logs = [
    { Price: 90, Quantity: 30, Time: "2026-09-24T00:00:00Z" },
    { Price: 100, Quantity: 24, Time: "2026-09-25T00:00:00Z" },
    { Price: 110, Quantity: 18, Time: "2026-09-26T00:00:00Z" },
    { Price: 120, Quantity: 12, Time: "2026-09-27T00:00:00Z" },
  ];
  const [logged] = toDemandItems([item(3, { PriceLogs: logs })], new Map());
  ok("with a log → sell-through and trend are numbers", logged!.sellThrough != null && logged!.sellThrough > 0 && (logged!.momentumPct ?? 0) > 0);
  ok("with a log → league has history", hasPriceHistory([logged!]));

  ok("trust: no log but enough listings is not thin", demandTrust(0, 20, 0) === "no-history");
  ok("trust: too few listings is thin even without a log", demandTrust(0, 2, 0) === "thin");
  ok("trust: a short log is thin", demandTrust(2, 20, 0) === "thin");
  ok("trust: enough log + listings is ok", demandTrust(5, 20, 0) === "ok");
}

function testSnipeAndWealth(): void {
  const valuable = toDemandItems([item(1, { CurrentPrice: 50 * 500 })], new Map());
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
  // today's league: no row has a log — the old default ("hide thin", thin = no log) showed nothing
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
  testMissingHistory();
  testSnipeAndWealth();
  testDefaultView();
  console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
