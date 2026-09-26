import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CX_CURRENCY_IDS, CX_HOUR_SECONDS, parseCxDigest, type CxDigest, type CxMarket } from "../api/cxClient";

/**
 * Test digests for the exchange-history suites. NO NETWORK.
 *
 * The three base-currency markets are the REAL captured digest (cx-digest.fixture.json,
 * Forbidden Rites, 2026-09-16) — every hour reuses them, so the Ex/Div and Chaos/Div VWAPs are
 * the live ones. Item markets are DERIVED: real GGG base ids (checked against the committed RePoE
 * catalog) with hand-set volumes, so each assertion can be recomputed by hand.
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
} as const;

/** Real captured Forbidden Rites VWAPs (Ex/Div 5458986/12400, Chaos/Div 2241349/241502). */
export const EX_PER_DIV = 5_458_986 / 12_400;
export const CHAOS_PER_DIV = 2_241_349 / 241_502;

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

/**
 * Omen of Light, one hour: Div market 1000 units for 8400 Div (8.4 Div each, band 8–9 Div) and
 * Ex market 500 units for 1,960,000 Ex (3920 Ex each ≈ 8.904 Div at the real Ex/Div rate).
 */
export function omenMarkets(league: string = FR): CxMarket[] {
  return [
    market(league, IDS.omenOfLight, IDS.divine, 1000, 8400, { low: [1, 8], high: [1, 9] }),
    market(league, IDS.omenOfLight, IDS.exalted, 500, 1_960_000),
  ];
}

/** Simulacrum with no ratio band and two quotes whose Div prices differ by `gapPct`. */
export function simulacrumMarkets(gapPct: number, league: string = FR): CxMarket[] {
  const divEach = 3;
  const exEach = divEach * (1 + gapPct / 100) * EX_PER_DIV;
  return [
    market(league, IDS.simulacrum, IDS.divine, 200, 200 * divEach),
    market(league, IDS.simulacrum, IDS.exalted, 100, Math.round(100 * exEach)),
  ];
}

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
]);

export function stubNames(ids: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of ids) {
    const name = TEST_NAMES.get(id);
    if (name != null) out.set(id, name);
  }
  return out;
}

export function near(actual: number | null | undefined, expected: number, eps = 1e-9): boolean {
  return actual != null && Math.abs(actual - expected) <= eps * Math.max(1, Math.abs(expected));
}
