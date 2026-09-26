import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";
import { getCraftMargins, getMarginHistory, requestCraftRefresh, getMaterialPrices } from "../../../../db/craftQueries";
import { ALL_MATERIALS } from "../../../../core/craftMaterials";
import { getDefaultLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";
import { RECIPES, type CraftRecipe } from "../../../../core/craftRecipes";
import { parseStoredReport } from "../../../../core/craftReports";
import { rankGate } from "../../../../core/craftValuation";
import { config } from "../../../../config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Static (non-priced) recipe metadata the breakdown UI needs alongside the live report. */
function recipeMeta(r: CraftRecipe) {
  return {
    key: r.key,
    label: r.label,
    domain: r.domain,
    heroIcon: r.heroIcon ?? null,
    source: r.source,
    guide: r.guide,
    hitRate: r.hitRate,
    baseSpec: { label: r.base.label, note: r.base.note },
    resultSpec: { label: r.result.label, note: r.result.note },
    materialSpecs: r.materials.map((m) => ({
      id: m.material.id,
      label: m.material.label,
      group: m.material.group,
      qty: m.qtyPerAttempt,
      note: m.note ?? null,
    })),
  };
}

/** Item art for every registered material — chips/checklists render the actual item icons. */
function materialIcons(league: string): Record<string, string> {
  const icons: Record<string, string> = {};
  for (const [id, p] of getMaterialPrices(league, ALL_MATERIALS.map((m) => m.id))) {
    if (p.icon) icons[id] = p.icon;
  }
  return icons;
}

/** GET /api/craft/margins → stored reports + static recipe meta + EV-history sparkline + the
 *  confidence gate that decides whether a report may drive a top pick / alert. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cred = await getCallerCred();

  // Craft margins are scanned by the poller under ONE shared POESESSID, so they exist for the
  // app default league only. A user viewing another league still sees them, labelled with the
  // league they were computed for rather than silently reattributed to theirs.
  const league = getDefaultLeague();
  const stored = new Map(getCraftMargins(league).map((r) => [r.recipe_key, r]));
  const recipes = RECIPES.map((r) => {
    const row = stored.get(r.key);
    const report = row ? parseStoredReport(r.key, row.report_json) : null;
    return {
      ...recipeMeta(r),
      report,
      gate: report ? rankGate(report) : { ok: false, reasons: ["not scanned yet"] },
      scannedAt: row?.scanned_at ?? null,
      // a transient trade2 failure since that scan — the report above is the last GOOD one
      lastError: row?.last_error ?? null,
      lastErrorAt: row?.last_error_at ?? null,
      evHistory: getMarginHistory(league, r.key).map((h) => h.ev_div),
    };
  });

  const resolved = resolveRates(league);
  return NextResponse.json({
    enabled: config.craftMargin.enabled,
    computedLeague: league,
    intervalMin: config.craftMargin.intervalMin,
    canRefresh: user.role === "owner" && cred != null,
    exaltPerDivine: resolved?.rates.exaltPerDivine ?? null,
    ratesSource: resolved?.source ?? null,
    ratesFetchedAt: resolved?.fetchedAt ?? null,
    icons: materialIcons(league),
    recipes,
  });
}

/**
 * POST /api/craft/margins → QUEUE a full refresh (owner only). The web process must not call
 * trade2 itself — it shares the account+IP rate budget with the poller's hunt/autosnipe traffic,
 * so an inline sweep here would 429 the poller. Instead we set a flag the poller consumes
 * within ~20s under its own limiter. Returns immediately.
 */
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "owner only" }, { status: 403 });
  requestCraftRefresh();
  return NextResponse.json({ queued: true }, { status: 202 });
}
