import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import {
  addCraftAttempt,
  closeCraftAttempt,
  deleteCraftAttempt,
  listCraftAttempts,
  craftPnlByRecipe,
  getCraftMargins,
} from "../../../../db/craftQueries";
import { RECIPES, RecipeMarginReportSchema } from "../../../../core/craftRecipes";
import { getActiveLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/craft/attempts → the caller's attempt log + per-recipe P&L aggregates. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const labels = Object.fromEntries(RECIPES.map((r) => [r.key, r.label]));
  const hitRates = Object.fromEntries(RECIPES.map((r) => [r.key, r.hitRate]));
  // Recipe hero art (the crafted item) from the stored margin reports, for the attempt rows.
  const league = getActiveLeague();
  const icons: Record<string, string> = {};
  for (const row of getCraftMargins(league)) {
    const parsed = RecipeMarginReportSchema.safeParse(JSON.parse(row.report_json));
    const icon = parsed.success ? (parsed.data.result?.icon ?? parsed.data.base?.icon ?? null) : null;
    if (icon) icons[row.recipe_key] = icon;
  }
  return NextResponse.json({
    attempts: listCraftAttempts(user.id),
    byRecipe: craftPnlByRecipe(user.id),
    labels,
    hitRates,
    icons,
    exaltPerDivine: resolveRates(league)?.rates.exaltPerDivine ?? null,
  });
}

/**
 * POST /api/craft/attempts → log a new attempt. With `prefill: true` the base + materials costs
 * are copied from the recipe's latest margin report (what the market says an attempt costs NOW);
 * explicit baseCostDiv/matsCostDiv override.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json()) as {
    recipeKey?: string;
    prefill?: boolean;
    baseCostDiv?: number;
    matsCostDiv?: number;
    note?: string;
  };
  if (!b.recipeKey || !RECIPES.some((r) => r.key === b.recipeKey)) {
    return NextResponse.json({ error: "unknown recipeKey" }, { status: 400 });
  }

  let baseCostDiv = b.baseCostDiv != null ? Number(b.baseCostDiv) : null;
  let matsCostDiv = b.matsCostDiv != null ? Number(b.matsCostDiv) : null;
  if (b.prefill && (baseCostDiv == null || matsCostDiv == null)) {
    const row = getCraftMargins(getActiveLeague()).find((r) => r.recipe_key === b.recipeKey);
    const parsed = row ? RecipeMarginReportSchema.safeParse(JSON.parse(row.report_json)) : null;
    if (parsed?.success) {
      baseCostDiv = baseCostDiv ?? parsed.data.base?.priceDiv ?? 0;
      matsCostDiv = matsCostDiv ?? parsed.data.materialsDiv;
    }
  }
  const id = addCraftAttempt(user.id, {
    recipeKey: b.recipeKey,
    baseCostDiv: baseCostDiv ?? 0,
    matsCostDiv: matsCostDiv ?? 0,
    note: b.note ?? null,
  });
  return NextResponse.json({ id, baseCostDiv: baseCostDiv ?? 0, matsCostDiv: matsCostDiv ?? 0 });
}

/** PATCH /api/craft/attempts → close an attempt (outcome hit/brick + realized sale in Div). */
export async function PATCH(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json()) as { id?: number; outcome?: string; soldDiv?: number | null };
  if (b.id == null) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (b.outcome !== "hit" && b.outcome !== "brick") {
    return NextResponse.json({ error: "outcome must be 'hit' or 'brick'" }, { status: 400 });
  }
  closeCraftAttempt(user.id, Number(b.id), b.outcome, b.soldDiv != null ? Number(b.soldDiv) : null);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/craft/attempts → remove a logged attempt. */
export async function DELETE(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json()) as { id?: number };
  if (b.id == null) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteCraftAttempt(user.id, Number(b.id));
  return NextResponse.json({ ok: true });
}
