import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CX_CURRENCY_IDS, CX_HOUR_SECONDS, parseCxDigest, type CxDigest, type CxMarket } from "../api/cxClient";
import { toMarketRow } from "../core/cx/cxIngest";
import { modelParams, type ModelParams } from "../core/cx/cxMarketModel";
import type { CxMarketRow } from "../db/cxMarketQueries";

/**
 * Test digests for the exchange-history suites. NO NETWORK.
 *
 * The three base-currency markets are the REAL captured digest (cx-digest.fixture.json,
 * Forbidden Rites, 2026-09-16) — every hour reuses them, so the Ex/Div and Chaos/Div VWAPs are
 * the live ones. Item markets are DERIVED: real GGG base ids (checked against the committed RePoE
 * catalog) with hand-set volumes, so each assertion can be recomputed by hand. The shapes mirror
 * what a live 12h Forbidden Rites run surfaced: thin 1:1 Ex legs on sub-Exalt items, quantised
 * cheap quotes, and implausible multi-hundred-% "edges".
 */

export const FR = "Forbidden Rites";
export const PRIVATE = "HC FRites League by Cardiff (PL86503)";
/** next_change_id of the captured digest. */
export const H0 = 1_789_570_800;

export const IDS = {
  ...CX_CURRENCY_IDS,
  greaterExalted: "Metadata/Items/Currency/CurrencyAddModToRare2",
  omenOfLight: "Metadata/Items/Currency/OmenOnAnnulRemoveAbyssMod",
  simulacrum: "Metadata/Items/MapFragments/CurrencyAfflictionFragment",
  kulemak: "Metadata/Items/Currency/Abyss/AbyssPinnacleKey",
  preservedRib: "Metadata/Items/Currency/AbyssalBenchTicketArmour",
  gnawedRib: "Metadata/Items/Currency/AbyssalBenchTicketArmourLow",
  vaalSiphoner: "Metadata/Items/Currency/CurrencyIncursionVaalIncubator",
} as const;

/** Real captured Forbidden Rites VWAPs (Ex/Div 5458986/12400, Chaos/Div 2241349/241502). */
export const EX_PER_DIV = 5_458_986 / 12_400;
export const CHAOS_PER_DIV = 2_241_349 / 241_502;

/** Default model thresholds (bands off, 20 units / 5 Div per leg, 25% grid, 50% cap). */
export const PARAMS: ModelParams = modelParams();

export const REAL_DIGEST: CxDigest = parseCxDigest(
  JSON.parse(readFileSync(join(process.cwd(), "src/data/test/cx-digest.fixture.json"), "utf8")),
);

/** An item market: `units` of the item traded for `quoteUnits` of the quote, optional ratio band. */
export function market(
  league: string,
  item: string,
  quote: string,
  units: number,
  quoteUnits: number,
  band?: { low: [number, number]; high: [number, number] },
): CxMarket {
  // GGG lists pairs in no guaranteed order — put the quote first so storage must normalize.
  return {
    league,
    market_id: `${quote}|${item}`,
    market_pair: [quote, item],
    volume_traded: { [item]: units, [quote]: quoteUnits },
    lowest_ratio: band ? { [item]: band.low[0], [quote]: band.low[1] } : null,
    highest_ratio: band ? { [item]: band.high[0], [quote]: band.high[1] } : null,
    lowest_stock: { [item]: 10, [quote]: 20 },
    highest_stock: { [item]: 30, [quote]: 40 },
  };
}

/** The captured digest's markets re-stamped to another hour, plus extra item markets. */
export function digestAt(id: number, extra: readonly CxMarket[]): CxDigest {
  return { ...REAL_DIGEST, next_change_id: id, markets: [...REAL_DIGEST.markets, ...extra] };
}

/** Item priced `divEach` in its Div market and `divEach × (1 + gap)` via its Ex market. */
export function crossMarkets(item: string, divEach: number, gapPct: number, units = { div: 200, ex: 100 }, league = FR): CxMarket[] {
  const exEach = divEach * (1 + gapPct / 100) * EX_PER_DIV;
  return [
    market(league, item, IDS.divine, units.div, units.div * divEach),
    market(league, item, IDS.exalted, units.ex, Math.round(units.ex * exEach)),
  ];
}

/** Simulacrum at 40 Div (fine grid both legs, 100–200 units/h) with a `gapPct` cross gap. */
export const simulacrumMarkets = (gapPct: number, league: string = FR): CxMarket[] => crossMarkets(IDS.simulacrum, 40, gapPct, undefined, league);

/**
 * Omen of Light at 8.4 Div (Div market, 1:8–1:9 ratio extremes) vs 3920 Ex: a 6% gap, but an
 * 8.4-Div item fills only at 8:1 or 9:1 — an 11.9% grid — so the gap is quantisation.
 */
export function omenMarkets(league: string = FR): CxMarket[] {
  return [
    market(league, IDS.omenOfLight, IDS.divine, 1000, 8400, { low: [1, 8], high: [1, 9] }),
    market(league, IDS.omenOfLight, IDS.exalted, 500, 1_960_000),
  ];
}

/** The live failure: 3 ribs at 1:1 Ex vs 1000 ribs for 1 Div → "+127%", thin on both legs. */
export function thinRibMarkets(league: string = FR): CxMarket[] {
  return [
    market(league, IDS.preservedRib, IDS.exalted, 3, 3, { low: [1, 1], high: [1, 2] }),
    market(league, IDS.preservedRib, IDS.divine, 1000, 1),
  ];
}

/** A liquid, fine-grid, sub-Exalt item (0.002 Div) with a 10% Div-vs-Chaos gap and no known fee. */
export function subExaltMarkets(league: string = FR): CxMarket[] {
  const divEach = 0.002;
  return [
    market(league, IDS.gnawedRib, IDS.divine, 10_000, 10_000 * divEach),
    market(league, IDS.gnawedRib, IDS.chaos, 10_000, Math.round(10_000 * divEach * 1.1 * CHAOS_PER_DIV)),
  ];
}

/** Liquid, fine-grid, +80% — a data artefact the cap must refuse. */
export const implausibleMarkets = (league: string = FR): CxMarket[] => crossMarkets(IDS.vaalSiphoner, 40, 80, undefined, league);

export const hourId = (k: number): number => H0 - k * CX_HOUR_SECONDS;

/** Names the stubbed resolver knows — the same strings RePoE carries for these ids. */
export const TEST_NAMES: ReadonlyMap<string, string> = new Map([
  [IDS.divine, "Divine Orb"],
  [IDS.exalted, "Exalted Orb"],
  [IDS.chaos, "Chaos Orb"],
  [IDS.greaterExalted, "Greater Exalted Orb"],
  [IDS.omenOfLight, "Omen of Light"],
  [IDS.simulacrum, "Simulacrum"],
  [IDS.kulemak, "Kulemak's Invitation"],
  [IDS.preservedRib, "Preserved Rib"],
  [IDS.gnawedRib, "Gnawed Rib"],
  [IDS.vaalSiphoner, "Vaal Siphoner"],
]);

export function stubNames(ids: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of ids) {
    const name = TEST_NAMES.get(id);
    if (name != null) out.set(id, name);
  }
  return out;
}

/** A digest's markets for one league as stored rows. */
export function rowsOf(id: number, markets = REAL_DIGEST.markets, league = FR): CxMarketRow[] {
  return markets
    .filter((m) => m.league === league)
    .map((m) => toMarketRow(m, id))
    .filter((r): r is CxMarketRow => r != null);
}

/** Kulemak at 40 Div with a valid 20% gap — used as a single-hour print. */
export const kulemakSpike = (): CxMarket[] => crossMarkets(IDS.kulemak, 40, 20, { div: 25, ex: 25 });

/** Stored rows for hours k = 0..n−1 (newest first), each hour's extra markets from `extraAt(k)`. */
export function hoursOf(n: number, extraAt: (k: number) => CxMarket[]): CxMarketRow[] {
  const rows: CxMarketRow[] = [];
  for (let k = 0; k < n; k++) rows.push(...rowsOf(hourId(k), digestAt(hourId(k), extraAt(k)).markets));
  return rows;
}

/**
 * Six hours: Simulacrum holds a 12% gap in 5 of 6 (hour 3 collapses to 0%); Kulemak prints one
 * valid 20% hour and is silent otherwise; the thin rib prints its fake "+127%" every hour; the
 * +80% artefact prints every hour.
 */
export function persistentAndSpikeRows(): CxMarketRow[] {
  return hoursOf(6, (k) => [
    ...simulacrumMarkets(k === 3 ? 0 : 12),
    ...thinRibMarkets(),
    ...implausibleMarkets(),
    ...(k === 0 ? kulemakSpike() : []),
  ]);
}

export function near(actual: number | null | undefined, expected: number, eps = 1e-9): boolean {
  return actual != null && Math.abs(actual - expected) <= eps * Math.max(1, Math.abs(expected));
}
