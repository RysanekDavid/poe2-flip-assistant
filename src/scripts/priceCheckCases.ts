/* Market › Price check cases, run from testValuation.ts: classification of four pastes, the
 * currency plan through an injected PlanContext, uniques without a poe2scout row, the contract
 * round trip, and a spy proving the base check never spends trade2 budget. No network, no DB. */
import { isDeepStrictEqual } from "node:util";
import type { TradeCred } from "../api/tradeClient";
import type { PricedItem } from "../api/types";
import type { CxItemStats } from "../core/cx/cxPersistence";
import { parseTabRoute } from "../components/shell/tabRegistry";
import { parseItem } from "../core/itemParser";
import { LiveNotAllowedError, priceCheck, priceCheckLive } from "../core/pricecheck/check";
import { classifyPaste, readStackSize } from "../core/pricecheck/classify";
import type { PriceCheckServices, TradeServices } from "../core/pricecheck/services";
import { readItemMeta } from "../core/tools/craftmoves/itemMeta";
import { planLiquidation, type PlanContext } from "../core/wealth/plan";
import { priceCheckLiveResponseSchema, priceCheckResponseSchema, type PriceCheckResponse } from "../lib/priceCheckContract";

type Ok = (name: string, cond: boolean, extra?: string) => void;

const RATES = { exaltPerDivine: 400, chaosPerDivine: 20 };
const CRED: TradeCred = { poesessid: "test", source: "stored" };

export const PASTES = {
  currency: `Item Class: Stackable Currency\nRarity: Currency\nOrb of Annulment\n--------\nStack Size: 7/20\n--------\nRemoves a random modifier from an item`,
  unique: `Item Class: Belts\nRarity: Unique\nHeadhunter\nLeather Belt\n--------\nItem Level: 80\n--------\n+25 to Strength\n--------\nCorrupted`,
  rare: `Item Class: Rings\nRarity: Rare\nDoom Loop\nRuby Ring\n--------\nItem Level: 82\n--------\n+26% to Fire Resistance (implicit)\n--------\n+104 to maximum Life\n+38% to Cold Resistance`,
  other: `Item Class: Rings\nRarity: Magic\nSapphire Ring of the Whale\n--------\nItem Level: 50\n--------\n+40 to maximum Life`,
} as const;

const annul: PricedItem = {
  itemId: "annul", itemName: "Orb of Annulment", category: "Currency", baseValue: 0.5, volume: 900, change7d: 3, spark7d: null, icon: "https://icon/annul.png",
};
const annulCx: CxItemStats = { newestHour: 1_790_000_000, midDiv: 0.52, bandDiv: null, marketUnitsPerHour: 5000, edge: null, issue: null, rawNetPct: null };

function planContext(uniqueDiv: ReadonlyMap<string, number>): PlanContext {
  return {
    rates: RATES,
    ninjaByName: new Map([["orb of annulment", annul]]),
    cxByItemId: new Map([["annul", annulCx]]),
    uniqueDiv,
    compDiv: new Map(),
    competition: new Map(),
    params: { goldPerExalt: 5000, flowSharePct: 10, maxGridStepPct: 10 },
  };
}

interface Spy {
  trade: TradeServices;
  calls: string[];
}

function tradeSpy(): Spy {
  const calls: string[] = [];
  return {
    calls,
    trade: {
      liveRare: async () => {
        calls.push("liveRare");
        return { valueDiv: 5, minDiv: 4, samples: 6, dropped: 1, unrated: 0, total: 40, searchUrl: "https://www.pathofexile.com/trade2/search/poe2/L/abc", searchedStats: 3, targetLine: null };
      },
      searchComparables: async () => {
        calls.push("searchComparables");
        return { total: 0, listings: [], searchUrl: "https://www.pathofexile.com/trade2/search/poe2/L/def" };
      },
    },
  };
}

function services(spy: Spy, over: Partial<PriceCheckServices> = {}, uniqueDiv: ReadonlyMap<string, number> = new Map()): PriceCheckServices {
  return {
    league: "L",
    defaultLeague: "L",
    hasCred: true,
    rates: { rates: RATES, source: "cx", fetchedAt: null },
    ages: { ninjaAgeMin: 30, cxAgeMin: 50, scoutAgeMin: 600 },
    planContext: async () => ({ ctx: planContext(uniqueDiv), warnings: [] }),
    isExchangeItem: (n) => n.toLowerCase() === "orb of annulment",
    rareBook: async () => ({
      query: { type: "Ruby Ring", rarity: "rare" },
      ref: { valueDiv: 4, samples: 6, dropped: 0, minDiv: 3, keptAsc: [3, 4, 5] },
      resolvedMods: 3,
    }),
    trade: spy.trade,
    ...over,
  };
}

function testClassify(ok: Ok): void {
  const kinds = Object.entries(PASTES).map(([want, text]) => {
    const parsed = parseItem(text);
    if (!parsed) throw new Error(`fixture ${want} did not parse`);
    return [want, classifyPaste(parsed, readItemMeta(text), text, (n) => n === "Orb of Annulment").kind];
  });
  ok("pricecheck: 4 fixture pastes classify", kinds.every(([want, got]) => want === got), JSON.stringify(kinds));
  ok("pricecheck: stack size read", readStackSize(PASTES.currency) === 7 && readStackSize("Stack Size: 1,234/5,000") === 1234);
  ok("pricecheck: no stack line = 1", readStackSize(PASTES.rare) === 1);
}

/** Parsed from the wire exactly as the panel parses it, with nothing lost or reshaped. */
function roundTrip(r: PriceCheckResponse): boolean {
  const parsed = priceCheckResponseSchema.safeParse(JSON.parse(JSON.stringify(r)));
  if (!parsed.success) {
    console.error(`round trip ${r.kind}: ${parsed.error.message}`);
    return false;
  }
  return isDeepStrictEqual(parsed.data, r);
}

async function testBase(ok: Ok): Promise<void> {
  const spy = tradeSpy();
  const s = services(spy);
  const cur = await priceCheck(PASTES.currency, s);
  const row = planLiquidation([{ name: "Orb of Annulment", qty: 7 }], planContext(new Map())).rows[0]!;
  ok("pricecheck: currency = exchange mid × stack", cur.kind === "currency" && cur.unitDiv === 0.52 && Math.abs((cur.totalDiv ?? 0) - 3.64) < 1e-9, String(cur.totalDiv));
  ok("pricecheck: currency hint = planner's cx route after fee", cur.hint.action === "sell-cx" && cur.hint.cxFastTotalDiv === row.fastTotalDiv, cur.hint.reason);
  ok("pricecheck: currency source cx, age from cx", cur.confidence.source === "cx" && cur.confidence.ageMin === 50);
  ok("pricecheck: currency has no live button / craft link", !cur.live.allowed && cur.craftQuery === null && cur.tradeUrl === null);

  const uni = await priceCheck(PASTES.unique, s);
  ok("pricecheck: unique without scout row → unitDiv null", uni.kind === "unique" && uni.unitDiv === null && uni.totalDiv === null && uni.confidence.source === null);
  ok("pricecheck: unpriced unique → no hint, live allowed", uni.hint.action === "none" && uni.live.allowed);
  const priced = await priceCheck(PASTES.unique, services(spy, {}, new Map([["headhunter", 40]])));
  ok("pricecheck: unique with scout row → list at fair", priced.unitDiv === 40 && priced.hint.action === "list" && priced.confidence.source === "scout");
  ok("pricecheck: unique trade link names it", priced.tradeUrl?.includes("Headhunter") === true);

  const rare = await priceCheck(PASTES.rare, s);
  ok("pricecheck: rare = book reference", rare.kind === "rare" && rare.unitDiv === 4 && rare.confidence.samples === 6 && rare.confidence.source === "book");
  ok("pricecheck: rare craft deep link", rare.craftQuery?.startsWith("?tab=craft&tool=moves&item=") === true);
  const other = await priceCheck(PASTES.other, s);
  ok("pricecheck: other = no value, craft link", other.kind === "other" && other.unitDiv === null && other.craftQuery !== null && !other.live.allowed);

  ok("pricecheck: contract round trip (4 kinds)", [cur, uni, rare, other].every(roundTrip));
  ok("pricecheck: base check never spends trade2 (spy)", spy.calls.length === 0, spy.calls.join(","));
}

async function rejects(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch (e: unknown) {
    return e instanceof LiveNotAllowedError;
  }
}

async function testLive(ok: Ok): Promise<void> {
  const spy = tradeSpy();
  const rare = await priceCheckLive(PASTES.rare, services(spy), CRED);
  ok("pricecheck live: rare → liveValue once", spy.calls.join(",") === "liveRare" && rare.valueDiv === 5 && rare.hint.action === "list");
  const uni = await priceCheckLive(PASTES.unique, services(spy), CRED);
  ok("pricecheck live: unique → one comparables search", spy.calls.join(",") === "liveRare,searchComparables");
  ok("pricecheck live: no comparables → valueDiv null, never 0", uni.valueDiv === null && uni.hint.action === "none");
  ok("pricecheck live: response contract", priceCheckLiveResponseSchema.safeParse(rare).success && priceCheckLiveResponseSchema.safeParse(uni).success);
  const before = spy.calls.length;
  const offLeague = await rejects(priceCheckLive(PASTES.rare, services(spy, { league: "Other" }), CRED));
  const currency = await rejects(priceCheckLive(PASTES.currency, services(spy), CRED));
  ok("pricecheck live: other league / currency refused before any search", offLeague && currency && spy.calls.length === before);
  const gate = (await priceCheck(PASTES.rare, services(spy, { league: "Other" }))).live;
  ok("pricecheck: non-default league disables live with a reason", !gate.allowed && gate.reason?.includes("Other") === true);
  const noCred = (await priceCheck(PASTES.rare, services(spy, { hasCred: false }))).live;
  ok("pricecheck: no cookie disables live with a reason", !noCred.allowed && noCred.reason?.includes("POESESSID") === true);
}

export async function runPriceCheckCases(ok: Ok): Promise<void> {
  ok("pricecheck: Market opens on Price check", parseTabRoute("market", null).tool === "price" && parseTabRoute("market", "board").tool === "board");
  testClassify(ok);
  await testBase(ok);
  await testLive(ok);
}
