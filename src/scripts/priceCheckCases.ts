/* Trade › Price check cases, run from testValuation.ts: classification of the fixture pastes, the
 * currency plan through an injected PlanContext, trade-only stacks, uniques without a poe2scout row,
 * corrupted uniques/rares, the contract round trip, and a spy proving the base check never spends
 * trade2 budget. No network, no DB. */
import { isDeepStrictEqual } from "node:util";
import type { TradeCred } from "../api/tradeClient";
import type { PricedItem } from "../api/types";
import type { CxItemStats } from "../core/cx/cxPersistence";
import { parseTabRoute } from "../components/shell/tabRegistry";
import { parseItem } from "../core/itemParser";
import { LiveNotAllowedError, priceCheck, priceCheckLive } from "../core/pricecheck/check";
import { classifyPaste, readStackSize } from "../core/pricecheck/classify";
import { UNPRICED_TRADE } from "../core/pricecheck/hint";
import type { PriceCheckServices, TradeServices } from "../core/pricecheck/services";
import { readItemMeta } from "../core/tools/craftmoves/itemMeta";
import { planLiquidation, type PlanContext } from "../core/wealth/plan";
import type { TradeQuery } from "../lib/tradeLink";
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

/** A Currency-rarity stack poe.ninja does not list: a trade item, not an exchange one. */
const SHARD = `Item Class: Stackable Currency\nRarity: Currency\nArtificer's Shard\n--------\nStack Size: 12/20`;
const CLEAN_UNIQUE = PASTES.unique.replace("\n--------\nCorrupted", "");
const CORRUPTED_RARE = `${PASTES.rare}\n--------\nCorrupted`;

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
  queries: TradeQuery[];
  bookReads: number;
}

function tradeSpy(): Spy {
  const calls: string[] = [];
  const queries: TradeQuery[] = [];
  const trade: TradeServices = {
    liveRare: async () => {
      calls.push("liveRare");
      return { valueDiv: 5, minDiv: 4, samples: 6, dropped: 1, unrated: 0, total: 40, searchUrl: "https://www.pathofexile.com/trade2/search/poe2/L/abc", searchedStats: 3, targetLine: null };
    },
    searchComparables: async (q) => {
      calls.push("searchComparables");
      queries.push(q);
      return { total: 0, listings: [], searchUrl: "https://www.pathofexile.com/trade2/search/poe2/L/def" };
    },
  };
  return { trade, calls, queries, bookReads: 0 };
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
    rarePlan: async () => ({ query: { type: "Ruby Ring", rarity: "rare", ilvlMin: 78 }, signature: "Ruby Ring|x", resolvedMods: 3 }),
    bookReference: () => {
      spy.bookReads++;
      return { valueDiv: 4, samples: 6, dropped: 0, minDiv: 3, keptAsc: [3, 4, 5] };
    },
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
  const shard = classifyPaste(parseItem(SHARD)!, readItemMeta(SHARD), SHARD, () => false);
  ok("pricecheck: Currency rarity off the exchange → trade stack", shard.kind === "currency" && !shard.onExchange && shard.qty === 12);
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

async function testCurrency(ok: Ok, spy: Spy): Promise<PriceCheckResponse[]> {
  const cur = await priceCheck(PASTES.currency, services(spy));
  const row = planLiquidation([{ name: "Orb of Annulment", qty: 7 }], planContext(new Map())).rows[0]!;
  ok("pricecheck: currency = exchange mid × stack", cur.kind === "currency" && cur.unitDiv === 0.52 && Math.abs((cur.totalDiv ?? 0) - 3.64) < 1e-9, String(cur.totalDiv));
  ok("pricecheck: currency hint = planner's cx route after fee", cur.hint.action === "sell-cx" && cur.hint.cxFastTotalDiv === row.fastTotalDiv, cur.hint.reason);
  ok("pricecheck: currency source cx, age from cx", cur.confidence.source === "cx" && cur.confidence.ageMin === 50);
  ok("pricecheck: exchange item has no live button / craft link", !cur.live.allowed && cur.craftQuery === null && cur.tradeUrl === null);
  const shard = await priceCheck(SHARD, services(spy));
  ok("pricecheck: trade-only stack → trade link, live allowed", shard.kind === "currency" && !shard.onExchange && shard.tradeUrl !== null && shard.live.allowed);
  ok("pricecheck: trade-only stack says it is not on the exchange", shard.warnings.some((w) => w.includes("not on the exchange in L")));
  ok("pricecheck: unpriced trade stack → price-check wording", shard.unitDiv === null && shard.hint.reason === UNPRICED_TRADE, shard.hint.reason);
  return [cur, shard];
}

async function testUnique(ok: Ok, spy: Spy): Promise<PriceCheckResponse[]> {
  const uni = await priceCheck(PASTES.unique, services(spy));
  ok("pricecheck: unique without scout row → unitDiv null", uni.kind === "unique" && uni.unitDiv === null && uni.totalDiv === null && uni.confidence.source === null);
  ok("pricecheck: unpriced unique → price-check wording, live allowed", uni.hint.reason === UNPRICED_TRADE && uni.live.allowed, uni.hint.reason);
  ok("pricecheck: corrupted unique warns + corrupted trade link", uni.warnings.some((w) => w.startsWith("corrupted")) && uni.tradeUrl?.includes("corrupted") === true);
  const priced = await priceCheck(CLEAN_UNIQUE, services(spy, {}, new Map([["headhunter", 40]])));
  ok("pricecheck: unique with scout row → list at fair", priced.unitDiv === 40 && priced.hint.action === "list" && priced.confidence.source === "scout");
  ok("pricecheck: clean unique has no corrupted warning", priced.warnings.length === 0 && priced.tradeUrl?.includes("Headhunter") === true);
  return [uni, priced];
}

async function testRareOther(ok: Ok, spy: Spy): Promise<PriceCheckResponse[]> {
  const rare = await priceCheck(PASTES.rare, services(spy));
  ok("pricecheck: rare = book reference", rare.kind === "rare" && rare.unitDiv === 4 && rare.confidence.samples === 6 && rare.confidence.source === "book");
  ok("pricecheck: rare craft deep link", rare.craftQuery?.startsWith("?tab=craft&tool=moves&item=") === true);
  const readsBefore = spy.bookReads;
  const corrupted = await priceCheck(CORRUPTED_RARE, services(spy));
  ok("pricecheck: corrupted rare skips the book only", spy.bookReads === readsBefore && corrupted.unitDiv === null && corrupted.tradeUrl?.includes("78") === true);
  const other = await priceCheck(PASTES.other, services(spy));
  ok("pricecheck: other = no value, craft link", other.kind === "other" && other.unitDiv === null && other.craftQuery !== null && !other.live.allowed);
  return [rare, corrupted, other];
}

async function testBase(ok: Ok): Promise<void> {
  const spy = tradeSpy();
  const all = [...(await testCurrency(ok, spy)), ...(await testUnique(ok, spy)), ...(await testRareOther(ok, spy))];
  ok("pricecheck: contract round trip (every kind)", all.every(roundTrip));
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

async function testLiveSearches(ok: Ok): Promise<void> {
  const spy = tradeSpy();
  const rare = await priceCheckLive(PASTES.rare, services(spy), CRED);
  ok("pricecheck live: rare → liveValue once", spy.calls.join(",") === "liveRare" && rare.valueDiv === 5 && rare.hint.action === "list");
  const uni = await priceCheckLive(PASTES.unique, services(spy), CRED);
  ok("pricecheck live: unique → one comparables search", spy.calls.join(",") === "liveRare,searchComparables");
  ok("pricecheck live: corrupted unique searches corrupted copies", spy.queries[0]?.corrupted === true && spy.queries[0]?.instantBuyout === true);
  ok("pricecheck live: no comparables → valueDiv null, live wording", uni.valueDiv === null && uni.hint.action === "none" && uni.hint.reason.startsWith("no live comparables"));
  await priceCheckLive(CLEAN_UNIQUE, services(spy), CRED);
  ok("pricecheck live: clean unique searches clean copies", spy.queries[1]?.corrupted === false);
  const shard = await priceCheckLive(SHARD, services(spy), CRED);
  ok("pricecheck live: trade-only stack searches by type", shard.kind === "currency" && spy.queries[2]?.type === "Artificer's Shard");
  ok("pricecheck live: response contract", [rare, uni, shard].every((v) => priceCheckLiveResponseSchema.safeParse(v).success));
}

async function testLiveGates(ok: Ok): Promise<void> {
  const spy = tradeSpy();
  const offLeague = await rejects(priceCheckLive(PASTES.rare, services(spy, { league: "Other" }), CRED));
  const currency = await rejects(priceCheckLive(PASTES.currency, services(spy), CRED));
  ok("pricecheck live: other league / exchange item refused before any search", offLeague && currency && spy.calls.length === 0);
  const gate = (await priceCheck(PASTES.rare, services(spy, { league: "Other" }))).live;
  ok("pricecheck: non-default league disables live with a reason", !gate.allowed && gate.reason?.includes("Other") === true);
  const noCred = (await priceCheck(PASTES.rare, services(spy, { hasCred: false }))).live;
  ok("pricecheck: no cookie disables live with a reason", !noCred.allowed && noCred.reason?.includes("POESESSID") === true);
}

export async function runPriceCheckCases(ok: Ok): Promise<void> {
  ok(
    "pricecheck: Trade opens on Price check (a newcomer has a drop in hand), Prices stays routable",
    parseTabRoute("trade", null).tool === "price" && parseTabRoute("trade", "prices").tool === "prices" && parseTabRoute("trade", "opportunities").tool === "opportunities",
  );
  testClassify(ok);
  await testBase(ok);
  await testLiveSearches(ok);
  await testLiveGates(ok);
}
