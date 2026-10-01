/* Pure suite for core/cx/cxPricing + the shadow report maths, on a TRIMMED REAL digest hour
 * (src/data/test/cx-digest-pricing.fixture.json: Forbidden Rites, next_change_id 1790852400 =
 * 2026-10-01 11:00 UTC, every volume as GGG published it). Run via testCxShadow.ts. NO NETWORK. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CX_CURRENCY_IDS, CX_HOUR_SECONDS, parseCxDigest, type CxDigest, type CxMarket } from "../api/cxClient";
import { toMarketRow } from "../core/cx/cxIngest";
import { exchangeIdsByDigestId } from "../core/cx/cxPriceShadow";
import { cxBridgeRates, priceCxHour, type CxShadowPrice } from "../core/cx/cxPricing";
import type { CxMarketRow } from "../db/cxMarketQueries";

export const FR = "Forbidden Rites";
export const PRICING_DIGEST: CxDigest = parseCxDigest(
  JSON.parse(readFileSync(join(process.cwd(), "src/data/test/cx-digest-pricing.fixture.json"), "utf8")),
);
export const HP = PRICING_DIGEST.next_change_id;

const M = "Metadata/Items/";
export const PIDS = {
  ...CX_CURRENCY_IDS,
  abyss: `${M}Currency/CurrencyCorruptedEssenceAbyss`,
  uncut20: `${M}Gems/SkillGemUncut20`,
  spirit9: `${M}Gems/ReservationGemUncut9`,
  ailith: `${M}Gems/SupportGemAilithLineage`,
  uncut10: `${M}Gems/SkillGemUncut10`,
  stoneRune: `${M}SoulCores/RuneStun`,
  breachSac: `${M}Currency/Breach/BreachPinnacleKey`,
  shard: `${M}Currency/Expedition/ExpeditionPinnacleKeyShard`,
} as const;

/** Real published volumes of the three base markets in the fixture hour. */
const DIV_PER_EX = 2392 / 1_657_448;
const DIV_PER_CHAOS = 130_234 / 1_451_057;

export const ID_MAP: ReadonlyMap<string, string> = exchangeIdsByDigestId();

/** A league's markets of a digest as stored rows at `hour`. */
export function rowsAt(markets: readonly CxMarket[], hour: number, league = FR): CxMarketRow[] {
  return markets
    .filter((m) => m.league === league)
    .map((m) => toMarketRow(m, hour))
    .filter((r): r is CxMarketRow => r != null);
}

export const baseMarkets = (): CxMarket[] =>
  PRICING_DIGEST.markets.filter((m) => m.league === FR && m.market_pair.every((id) => Object.values(CX_CURRENCY_IDS).some((b) => b === id)));

const byId = (prices: readonly CxShadowPrice[]): Map<string, CxShadowPrice> => new Map(prices.map((p) => [p.exchangeId, p]));

function near(actual: number | undefined, expected: number): void {
  assert.ok(actual != null && Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), `${actual} ≈ ${expected}`);
}

function testCatalogMapping(): void {
  assert.equal(ID_MAP.get(PIDS.divine), "divine");
  assert.equal(ID_MAP.get(PIDS.exalted), "exalted");
  assert.equal(ID_MAP.get(PIDS.chaos), "chaos");
  assert.equal(ID_MAP.get(PIDS.abyss), "essence-of-the-abyss");
  assert.equal(ID_MAP.get(PIDS.spirit9), "uncut-spirit-gem-9");
  assert.equal(ID_MAP.get(PIDS.shard), undefined, "a digest id the catalog lacks stays unmapped");
  const clash = { entities: [
    { exchange_id: "a", repoe_id: "X" },
    { exchange_id: "b", repoe_id: "X" },
  ] } as unknown as Parameters<typeof exchangeIdsByDigestId>[0];
  assert.throws(() => exchangeIdsByDigestId(clash), /maps to both a and b/, "an ambiguous metadata id fails loudly");
}

function testRealHour(): void {
  const rows = rowsAt(PRICING_DIGEST.markets, HP);
  near(cxBridgeRates(rows).divPerExalt ?? undefined, DIV_PER_EX);
  near(cxBridgeRates(rows).divPerChaos ?? undefined, DIV_PER_CHAOS);
  const { prices, unmapped } = priceCxHour(rows, HP, ID_MAP);
  const p = byId(prices);
  assert.deepEqual([p.get("divine")?.priceDiv, p.get("divine")?.method], [1, "direct"]);
  near(p.get("exalted")?.priceDiv, DIV_PER_EX);
  near(p.get("chaos")?.priceDiv, DIV_PER_CHAOS);
  // The leg with the most item units wins: here the Divine leg (587 vs 391 Ex, 334 Chaos units).
  near(p.get("essence-of-the-abyss")?.priceDiv, 175 / 587);
  assert.deepEqual(
    [p.get("essence-of-the-abyss")?.units, p.get("essence-of-the-abyss")?.volumeDiv, p.get("essence-of-the-abyss")?.legs],
    [587, 175, 3],
  );
  near(p.get("uncut-skill-gem-20")?.priceDiv, 2368 / 404); // its CurrencyRemoveMod market is not a quote
  near(p.get("breachlord-sac")?.priceDiv, 1988 / 174);
  // 0/0 Divine market = resting orders only; Chaos (2 units) beats Exalted (1 unit).
  const spirit = p.get("uncut-spirit-gem-9");
  assert.deepEqual([spirit?.method, spirit?.legs, spirit?.units], ["bridge", 2, 2]);
  near(spirit?.priceDiv, (20 * DIV_PER_CHAOS) / 2);
  near(p.get("ailiths-chimes")?.priceDiv, (1205 * DIV_PER_EX) / 31);
  near(p.get("uncut-skill-gem-10")?.priceDiv, (89 * DIV_PER_EX) / 13); // the Vaal-Orb market is not a quote
  assert.equal(p.has("stone-rune"), false, "a market with no fills prices nothing");
  assert.deepEqual(unmapped, [PIDS.shard], "unmapped ids are reported, not priced");
  assert.ok(prices.every((x) => x.tradedHour === HP && x.method !== "carried"));
  assert.throws(() => priceCxHour(rows, HP + CX_HOUR_SECONDS, ID_MAP), /passed to priceCxHour/);
}

/** GGG lists pairs in no fixed order: reversing every pair must not move a single price. */
function testInvertedOrientation(): void {
  const flipped = PRICING_DIGEST.markets.map((m) => ({ ...m, market_pair: [...m.market_pair].reverse() }));
  const a = priceCxHour(rowsAt(PRICING_DIGEST.markets, HP), HP, ID_MAP).prices;
  const b = priceCxHour(rowsAt(flipped, HP), HP, ID_MAP).prices;
  const sort = (xs: CxShadowPrice[]): CxShadowPrice[] => [...xs].sort((x, y) => x.exchangeId.localeCompare(y.exchangeId));
  assert.deepEqual(sort(b), sort(a));
}

function market(item: string, quote: string, vItem: number, vQuote: number): CxMarket {
  return { league: FR, market_id: `${item}|${quote}`, market_pair: [item, quote], volume_traded: { [item]: vItem, [quote]: vQuote } };
}

function testOneSidedAndMissingBridge(): void {
  const oneSided = [
    ...baseMarkets(),
    market(PIDS.stoneRune, PIDS.divine, 5, 0), // never observed live; still no price from it
    market(PIDS.abyss, PIDS.divine, 0, 3),
    market(PIDS.abyss, PIDS.exalted, 10, 2000),
  ];
  const p = byId(priceCxHour(rowsAt(oneSided, HP), HP, ID_MAP).prices);
  assert.equal(p.has("stone-rune"), false, "one-sided volume is not a rate");
  assert.equal(p.get("essence-of-the-abyss")?.method, "bridge", "a one-sided Divine leg falls back to the bridge");
  near(p.get("essence-of-the-abyss")?.priceDiv, (2000 * DIV_PER_EX) / 10);

  // No Ex/Div fills this hour: the Exalted bridge is gone, Chaos still works.
  const noExDiv = PRICING_DIGEST.markets.filter((m) => !(m.market_pair.includes(PIDS.exalted) && m.market_pair.includes(PIDS.divine)));
  const q = byId(priceCxHour(rowsAt(noExDiv, HP), HP, ID_MAP).prices);
  assert.equal(q.has("divine"), false, "the unit row needs a filled Div/Ex market");
  assert.equal(q.has("uncut-skill-gem-10"), false, "Exalted-only item has no bridge left");
  assert.deepEqual([q.get("ailiths-chimes")?.units, q.get("ailiths-chimes")?.method], [9, "bridge"]);
  near(q.get("ailiths-chimes")?.priceDiv, (18 * DIV_PER_CHAOS) / 9); // its bigger Exalted leg has no rate now
  near(q.get("exalted")?.priceDiv, (5309 * DIV_PER_CHAOS) / 359_075); // Exalted itself via its Chaos market
}

/** The live failure the leg rule exists for: a thin integer-ratio Divine overpay must not set the price. */
function testThinDivineLegLoses(): void {
  const opulence = [
    ...baseMarkets(),
    market(PIDS.abyss, PIDS.divine, 20, 20), // 20 items filled at 1:1 for Divine
    market(PIDS.abyss, PIDS.exalted, 143, 4618),
    market(PIDS.abyss, PIDS.chaos, 127, 89),
  ];
  const p = byId(priceCxHour(rowsAt(opulence, HP), HP, ID_MAP).prices).get("essence-of-the-abyss");
  assert.deepEqual([p?.method, p?.units, p?.legs], ["bridge", 143, 3]);
  near(p?.priceDiv, (4618 * DIV_PER_EX) / 143);
  const tie = [...baseMarkets(), market(PIDS.abyss, PIDS.divine, 10, 3), market(PIDS.abyss, PIDS.exalted, 10, 2000)];
  const t = byId(priceCxHour(rowsAt(tie, HP), HP, ID_MAP).prices).get("essence-of-the-abyss");
  assert.deepEqual([t?.method, t?.priceDiv], ["direct", 0.3], "Divine wins a tie on units");
}

function testCarryForward(): void {
  const first = priceCxHour(rowsAt(PRICING_DIGEST.markets, HP), HP, ID_MAP).prices;
  const next = HP + CX_HOUR_SECONDS;
  const quiet = byId(priceCxHour(rowsAt(baseMarkets(), next), next, ID_MAP, first).prices);
  const carried = quiet.get("essence-of-the-abyss");
  assert.deepEqual(
    [carried?.method, carried?.tradedHour, carried?.units, carried?.volumeDiv, carried?.legs],
    ["carried", HP, 0, 0, 0],
  );
  near(carried?.priceDiv, 175 / 587);
  assert.equal(quiet.get("exalted")?.method, "direct", "an item that traded again is not carried");
  // A carried row carries again with its ORIGINAL traded hour, until the cap.
  const later = next + CX_HOUR_SECONDS;
  // Stored rows carry their own `hour`; it must not leak into the new hour's row.
  const stored = [...quiet.values()].map((x) => ({ ...x, hour: next }));
  const again = byId(priceCxHour(rowsAt(baseMarkets(), later), later, ID_MAP, stored, 2).prices);
  assert.equal(again.get("essence-of-the-abyss")?.tradedHour, HP);
  assert.equal("hour" in (again.get("essence-of-the-abyss") ?? {}), false);
  const capped = byId(priceCxHour(rowsAt(baseMarkets(), later), later, ID_MAP, [...quiet.values()], 1).prices);
  assert.equal(capped.has("essence-of-the-abyss"), false, "older than maxCarryHours → dropped");
}

export function runCxPricingTests(): void {
  testCatalogMapping();
  testRealHour();
  testInvertedOrientation();
  testOneSidedAndMissingBridge();
  testThinDivineLegLoses();
  testCarryForward();
  console.log("  ok — cx pricing: catalog map, real hour, orientation, one-sided, missing bridge, leg rule, carry");
}
