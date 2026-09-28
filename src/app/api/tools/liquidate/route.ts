import { NextResponse } from "next/server";
import { fetchDemand } from "../../../../api/scoutClient";
import { fetchTradeMeta } from "../../../../api/tradeMeta";
import type { PricedItem } from "../../../../api/types";
import { getCurrentUser } from "../../../../auth/session";
import { config } from "../../../../config/env";
import { loadCxMarketView } from "../../../../core/cx/cxItemMarkets";
import { getDefaultLeague } from "../../../../core/leagueState";
import { leagueForUser } from "../../../../core/leagueUsers";
import { resolveRates } from "../../../../core/rates";
import { bundleText } from "../../../../core/tools/liquidate/bundle";
import { planLiquidation, type ScoutListing } from "../../../../core/tools/liquidate/plan";
import { itemValuesAgeHours, latestFetchedAt, latestSnapshots, searchItems, uniqueValueMap } from "../../../../db/marketQueries";
import {
  liquidateRequestSchema,
  type LiquidateResponse,
  type LiquidateSuggestion,
} from "../../../../lib/tools/liquidateContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * poe2scout live-listing counts for the entries that are not exchange items. poe2scout is only
 * read for the app default league; any other league gets no competition, said out loud.
 */
async function loadCompetition(
  league: string,
  keys: readonly string[],
): Promise<{ map: Map<string, ScoutListing>; warning: string | null }> {
  const map = new Map<string, ScoutListing>();
  if (keys.length === 0) return { map, warning: null };
  const defaultLeague = getDefaultLeague();
  if (league !== defaultLeague) {
    return { map, warning: `listing competition is only read for ${defaultLeague} — not shown for ${league}` };
  }
  try {
    const wanted = new Set(keys);
    for (const d of (await fetchDemand()).items) {
      const key = d.name.toLowerCase();
      if (!wanted.has(key) || map.has(key)) continue;
      map.set(key, { competition: { listed: d.quantity, sellThrough: d.sellThrough, samples: d.samples }, icon: d.icon });
    }
    return { map, warning: null };
  } catch (e: unknown) {
    console.warn(`[tools/liquidate] poe2scout competition failed: ${errText(e)}`);
    return { map, warning: `listing competition unavailable (poe2scout: ${errText(e)})` };
  }
}

const byLowerName = (prices: readonly PricedItem[]): Map<string, PricedItem> =>
  new Map(prices.map((p) => [p.itemName.toLowerCase(), p]));

/**
 * POST /api/tools/liquidate { items: [{ name, qty, manualDiv? }] } → per-item exchange-vs-trade
 * plan, totals and copy-paste text, priced in the caller's league. Read-only: spends no trade2
 * request and never lists, whispers or buys anything.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Unparseable JSON becomes null and fails the schema below as a 400, not a 500.
  const parsed = liquidateRequestSchema.safeParse(await req.json().catch((): null => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  const league = leagueForUser(user.id);
  const resolved = resolveRates(league);
  if (!resolved) {
    return NextResponse.json({ error: `no exchange rates available for ${league} — cannot price a liquidation` }, { status: 409 });
  }
  const prices = latestSnapshots(league);
  const ninjaByName = byLowerName(prices);
  const cxView = loadCxMarketView(league, prices);
  const nonExchange = parsed.data.items.map((i) => i.name.trim().toLowerCase()).filter((k) => !ninjaByName.has(k));
  const competition = await loadCompetition(league, nonExchange);
  const plan = planLiquidation(parsed.data.items, {
    rates: resolved.rates,
    ninjaByName,
    cxByItemId: cxView?.byItemId ?? new Map(),
    uniqueDiv: uniqueValueMap(league),
    competition: competition.map,
    params: { goldPerExalt: config.cx.goldPerExalt, flowSharePct: config.cx.flowSharePct, maxGridStepPct: config.cx.maxGridStepPct },
  });
  const warnings: string[] = [];
  if (cxView == null) warnings.push(`no fresh exchange history for ${league} — exchange rows use poe.ninja mids and have no time to sell`);
  if (competition.warning) warnings.push(competition.warning);
  const body: LiquidateResponse = {
    provenance: {
      league,
      rates: resolved.rates,
      ratesSource: resolved.source,
      ratesFetchedAt: resolved.fetchedAt,
      ninjaFetchedAt: latestFetchedAt(league),
      cxHour: cxView?.newestHour ?? null,
      scoutAgeHours: itemValuesAgeHours(league),
    },
    currencyIcons: {
      DIVINE: ninjaByName.get("divine orb")?.icon ?? null,
      EXALT: ninjaByName.get("exalted orb")?.icon ?? null,
      CHAOS: ninjaByName.get("chaos orb")?.icon ?? null,
    },
    plan,
    bundle: bundleText(plan, resolved.rates),
    warnings,
  };
  return NextResponse.json(body);
}

const SUGGEST_LIMIT = 12;

/** Unique names from the trade site's static item list (24h cache) — a failure is reported, not hidden. */
async function uniqueSuggestions(q: string): Promise<{ items: LiquidateSuggestion[]; warning: string | null }> {
  try {
    const needle = q.toLowerCase();
    const items = (await fetchTradeMeta()).uniques
      .filter((u) => u.name.toLowerCase().includes(needle))
      .slice(0, SUGGEST_LIMIT)
      .map((u): LiquidateSuggestion => ({ name: u.name, kind: "unique", icon: null }));
    return { items, warning: null };
  } catch (e: unknown) {
    console.warn(`[tools/liquidate] unique names unavailable: ${errText(e)}`);
    return { items: [], warning: `unique names unavailable (${errText(e)})` };
  }
}

/** GET /api/tools/liquidate?q=rune → exchange items (caller's league) + unique names for the entry autocomplete. */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ items: [], warning: null });
  const league = leagueForUser(user.id);
  const icons = new Map(latestSnapshots(league).map((p) => [p.itemId, p.icon]));
  const exchange = searchItems(league, q, SUGGEST_LIMIT).map(
    (i): LiquidateSuggestion => ({ name: i.itemName, kind: "exchange", icon: icons.get(i.itemId) ?? null }),
  );
  const uniques = await uniqueSuggestions(q);
  return NextResponse.json({ items: [...exchange, ...uniques.items], warning: uniques.warning });
}
