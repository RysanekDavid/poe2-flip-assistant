import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";
import { getCraftMargins, getMarginHistory, requestCraftRefresh, getMaterialPrices } from "../../../../db/craftQueries";
import { ALL_MATERIALS } from "../../../../core/craftMaterials";
import { getDefaultLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";
import { RECIPES, RecipeMarginReportSchema, type RecipeMarginReport } from "../../../../core/craftRecipes";
import { config } from "../../../../config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Static (non-priced) recipe metadata the breakdown UI needs alongside the live report. */
function recipeMeta(key: string) {
  const r = RECIPES.find((x) => x.key === key);
  if (!r) return null;
  return {
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

/** Validate a persisted report against the current schema — a row written by an older code
 *  version (different shape) is rejected (→ null) rather than blindly cast. */
function parseReport(key: string, json: string): RecipeMarginReport | null {
  const parsed = RecipeMarginReportSchema.safeParse(JSON.parse(json));
  if (!parsed.success) {
    console.warn(`[craft-margin] stale report for ${key} failed schema — ignoring: ${parsed.error.issues[0]?.message}`);
    return null;
  }
  return parsed.data;
}

/** GET /api/craft/margins → stored reports + static recipe meta + EV-history sparkline. */
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
    return {
      ...recipeMeta(r.key)!,
      key: r.key,
      report: row ? parseReport(r.key, row.report_json) : null,
      scannedAt: row?.scanned_at ?? null,
      evHistory: getMarginHistory(league, r.key).map((h) => h.ev_div),
    };
  });

  const resolved = resolveRates(league);
  // Item art for every registered material — chips/checklists render the actual item icons.
  const icons: Record<string, string> = {};
  for (const [id, p] of getMaterialPrices(league, ALL_MATERIALS.map((m) => m.id))) {
    if (p.icon) icons[id] = p.icon;
  }
  return NextResponse.json({
    enabled: config.craftMargin.enabled,
    computedLeague: league,
    intervalMin: config.craftMargin.intervalMin,
    canRefresh: user.role === "owner" && cred != null,
    exaltPerDivine: resolved?.rates.exaltPerDivine ?? null,
    ratesSource: resolved?.source ?? null,
    ratesFetchedAt: resolved?.fetchedAt ?? null,
    icons,
    recipes,
  });
}

/**
 * POST /api/craft/margins → QUEUE a full refresh (owner only). The web process must not call
 * trade2 itself — it shares the account+IP rate budget with the poller's hunt/autosnipe traffic,
 * so an inline 20-call sweep here would 429 the poller. Instead we set a flag the poller consumes
 * within ~20s under its own limiter. Returns immediately.
 */
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "owner only" }, { status: 403 });
  requestCraftRefresh();
  return NextResponse.json({ queued: true }, { status: 202 });
}
