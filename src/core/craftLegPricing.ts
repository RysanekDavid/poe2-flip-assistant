import { createSearch, fetchListings, type TradeCred } from "../api/tradeClient";
import type { Listing } from "../api/tradeListing";
import type { StatIndex } from "./statResolver";
import type { MaterialPrice } from "../db/craftQueries";
import { getDefaultLeague } from "./leagueState";
import type { ExchangeRates } from "./priceEngine";
import { LEG_SAMPLE, MIN_LEG_SAMPLES, floorValue, legFloorDiv } from "./craftValuation";
import type { CraftRecipe, RecipeLegSpec, RecipeStatSpec, LegReport, MaterialReportLine } from "./craftRecipes";
import { tradeSearchPageUrl, type StatFilter, type TradeQuery } from "../lib/tradeLink";
import type { StatOption } from "../api/tradeMeta";

/**
 * Per-leg trade2 I/O for the craft-margin engine: query assembly, listing → Div conversion, the
 * floor-percentile base pricing and the materials bill. Split from craftMargin.ts (which keeps
 * report assembly, persistence and scheduling) so both files stay under the size cap.
 */

// same normalization the stat catalog uses (strip '+', lowercase, collapse spaces)
const norm = (s: string): string => s.toLowerCase().replace(/\+/g, "").replace(/\s+/g, " ").trim();

/** Which catalog entry a spec means. A spec that names a group gets exactly that group; when the
 *  group is missing but the explicit twin exists we still search (a narrower filter would find
 *  nothing) — the caller marks it unresolved so the widening is visible and gates the report. */
function pickStat(s: RecipeStatSpec, matches: readonly StatOption[]): { pick: StatOption; exact: boolean } {
  const want = s.group ?? "explicit";
  const exact = matches.find((m) => m.group === want);
  if (exact) return { pick: exact, exact: true };
  const explicit = matches.find((m) => m.group === "explicit");
  // no group asked for: any catalog entry for the text is the stat the author meant
  if (s.group == null) return { pick: explicit ?? matches[0]!, exact: true };
  return { pick: explicit ?? matches[0]!, exact: false };
}

/** Resolve a leg's target mod texts to trade ids and assemble the search query. Texts the catalog
 *  can't resolve are returned in `unresolved` (never silently swallowed) so the caller can widen
 *  the search caveat AND suppress alerts — a renamed stat must not become an any-rare search.
 *  `opts.tier1Only` drops support (tier-2) stats for the relaxed result search; `opts.relaxPct`
 *  widens every stat min downward so near-identical rolls still count as comparables. */
export function legToQuery(
  leg: RecipeLegSpec,
  idx: StatIndex,
  opts: { tier1Only?: boolean; relaxPct?: number } = {},
): { query: TradeQuery; unresolved: string[] } {
  const filters: StatFilter[] = [];
  const unresolved: string[] = [];
  const relax = 1 - (opts.relaxPct ?? 0) / 100;
  for (const s of leg.stats) {
    if (opts.tier1Only && s.tier === 2) continue;
    const matches = idx.byText.get(norm(s.text));
    if (!matches || matches.length === 0) {
      unresolved.push(s.text);
      continue;
    }
    const { pick, exact } = pickStat(s, matches);
    if (!exact) unresolved.push(`${s.text} [no ${s.group} stat — searched as ${pick.group}]`);
    filters.push({ id: pick.id, min: s.min != null ? Math.floor(s.min * relax) : undefined });
  }
  const query: TradeQuery = {
    name: leg.name,
    type: leg.type,
    category: leg.category,
    rarity: leg.rarity,
    ilvlMin: leg.ilvlMin,
    pdpsMin: leg.pdpsMin,
    esMin: leg.esMin,
    evMin: leg.evMin,
    // comparables default to uncorrupted (a corrupted result isn't reforge-able) — putrefaction
    // results set true (the omen corrupts), vaal gambles "any" (their outputs mix both)
    corrupted: leg.corrupted === "any" ? undefined : (leg.corrupted ?? false),
    online: true,
    stats: filters,
  };
  return { query, unresolved };
}

/**
 * Listing price → Divine. Rates come from the league rate ladder (cx → ninja → scout), so a
 * poe2scout outage no longer aborts a craft scan. Small currencies (alch, aug, regal… — exactly
 * what junk base listings are priced in) fall back to the ninja exchange value of that item, as
 * do exalt/chaos when no rate source answers. NaN when nothing knows the currency (dropped).
 */
export function listingDiv(
  amount: number,
  currency: string,
  rates: ExchangeRates | null,
  currencyDiv: ReadonlyMap<string, number>,
): number {
  if (currency === "divine") return amount;
  if (rates && (currency === "exalted" || currency === "exalt")) return amount / rates.exaltPerDivine;
  if (rates && currency === "chaos") return amount / rates.chaosPerDivine;
  const unit = currencyDiv.get(currency === "exalt" ? "exalted" : currency);
  return unit != null ? amount * unit : NaN;
}

/** Shared per-scan context for pricing legs. */
export interface LegContext {
  idx: StatIndex;
  rates: ExchangeRates | null;
  cred: TradeCred;
  currencyDiv: ReadonlyMap<string, number>;
}

/** Up to LEG_SAMPLE cheapest priced listings for a query: 1 search + ≤4 fetches. */
async function sampleListings(
  query: TradeQuery,
  cred: TradeCred,
): Promise<{ total: number; listings: Listing[]; searchUrl: string }> {
  const search = await createSearch(query, "asc", cred);
  const ids = (search.result ?? []).slice(0, LEG_SAMPLE);
  const listings: Listing[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    listings.push(...(await fetchListings(ids.slice(i, i + 10), search.id, cred)));
  }
  return { total: search.total ?? listings.length, listings, searchUrl: tradeSearchPageUrl(getDefaultLeague(), search.id) };
}

/** A leg the market itself failed to price (too few usable asks) — a real finding about the
 *  market. Any OTHER error from a leg (transport, 429, a rate governor giving up) is transient. */
export class LegFloorError extends Error {}

/** Price one leg at `pctl` of its floor-passing asks. Throws (→ "leg-failed", naming the leg)
 *  when fewer than MIN_LEG_SAMPLES asks clear the floor, so a junk price never reaches EV. */
export async function priceLeg(leg: RecipeLegSpec, pctl: number, ctx: LegContext): Promise<LegReport> {
  const { query, unresolved } = legToQuery(leg, ctx.idx);
  const { total, listings, searchUrl } = await sampleListings(query, ctx.cred);
  const priced = listings.filter((l) => l.price && l.online);
  const divs = priced.map((l) => listingDiv(l.price!.amount, l.price!.currency, ctx.rates, ctx.currencyDiv));
  const { value, kept, dropped, floorDiv } = floorValue(divs, pctl, legFloorDiv(leg, ctx.rates));
  if (kept < MIN_LEG_SAMPLES) {
    throw new LegFloorError(
      `${leg.label}: only ${kept} ask(s) at or above the ${floorDiv.toFixed(3)} Div floor (need ${MIN_LEG_SAMPLES}); ` +
        `${total} listed, ${listings.length} sampled, ${dropped} below the floor — leg not priced`,
    );
  }
  return {
    priceDiv: value,
    samples: kept,
    total,
    searchUrl,
    outliersDropped: dropped,
    unresolvedStats: unresolved,
    icon: priced.find((l) => l.icon)?.icon ?? null, // real item art for the recipe card
    floorDiv,
    percentile: pctl,
    sampled: listings.length,
    method: "floor-percentile",
    band: null,
    relaxed: false,
    unrated: 0,
  };
}

/**
 * Pure: price a recipe's materials from the snapshot map. A material with neither a live snapshot
 * nor a manualPriceDiv fallback is reported in `missing` so the caller can fail loud (status
 * "missing-materials") instead of silently pricing it at zero.
 */
export function priceMaterials(
  recipe: CraftRecipe,
  prices: Map<string, MaterialPrice>,
): { lines: MaterialReportLine[]; missing: string[] } {
  const lines: MaterialReportLine[] = [];
  const missing: string[] = [];
  for (const m of recipe.materials) {
    const p = prices.get(m.material.id);
    let unitDiv: number | null = null;
    let source: "ninja" | "manual" = "ninja";
    let ageMin: number | null = null;
    if (p) {
      unitDiv = p.priceDiv;
      ageMin = p.ageMin;
    } else if (m.manualPriceDiv != null) {
      unitDiv = m.manualPriceDiv;
      source = "manual";
    } else {
      missing.push(m.material.id);
    }
    lines.push({
      id: m.material.id,
      label: m.material.label,
      qty: m.qtyPerAttempt,
      unitDiv,
      totalDiv: unitDiv != null ? unitDiv * m.qtyPerAttempt : null,
      source,
      ageMin,
    });
  }
  return { lines, missing };
}

export interface LegFailure {
  error: string;
  transient: boolean; // transport / rate-limit, not a verdict about the market
}

/** Price one leg with `price`, turning a failure into a classified LegFailure instead of an
 *  exception. Only LegFloorError is a market verdict; everything else is transient. */
export async function tryLeg(price: () => Promise<LegReport>): Promise<LegReport | LegFailure> {
  try {
    return await price();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), transient: !(e instanceof LegFloorError) };
  }
}

export const isFailure = (x: LegReport | LegFailure): x is LegFailure => "error" in x;
