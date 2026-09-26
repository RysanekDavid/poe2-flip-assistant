import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "../../../../auth/session";
import {
  addCraftAttempt,
  closeCraftAttempt,
  deleteCraftAttempt,
  listCraftAttempts,
  craftPnlByRecipe,
  getCraftMargins,
  getMaterialPrices,
} from "../../../../db/craftQueries";
import { RECIPES } from "../../../../core/craftRecipes";
import { parseStoredReport, actionableReport } from "../../../../core/craftReports";
import { priceMaterials } from "../../../../core/craftMargin";
import { prefillCosts } from "../../../../core/craftPrefill";
import { getDefaultLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECIPE_KEYS = RECIPES.map((r) => r.key) as [string, ...string[]];
const divAmount = z.number().finite().nonnegative().max(1_000_000);
const attemptId = z.number().int().positive();

const PostBody = z.object({
  recipeKey: z.enum(RECIPE_KEYS),
  prefill: z.boolean().optional(),
  baseCostDiv: divAmount.optional(),
  matsCostDiv: divAmount.optional(),
  note: z.string().max(500).nullish(),
});
const PatchBody = z.object({
  id: attemptId,
  outcome: z.enum(["hit", "brick"]),
  soldDiv: divAmount.nullish(),
});
const DeleteBody = z.object({ id: attemptId });

/** Parse a JSON body against a schema; a malformed body is a 400, never a silent default. */
async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "body must be JSON" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return { error: NextResponse.json({ error: msg }, { status: 400 }) };
  }
  return { data: parsed.data };
}

/** Recipe hero art (the crafted item) from the stored margin reports, for the attempt rows. */
function recipeIcons(league: string): Record<string, string> {
  const icons: Record<string, string> = {};
  for (const row of getCraftMargins(league)) {
    const report = parseStoredReport(row.recipe_key, row.report_json);
    const icon = report?.result?.icon ?? report?.base?.icon ?? null;
    if (icon) icons[row.recipe_key] = icon;
  }
  return icons;
}

/** GET /api/craft/attempts → the caller's attempt log + per-recipe P&L aggregates. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Margin reports exist for the app default league only (one shared POESESSID scans them).
  const league = getDefaultLeague();
  return NextResponse.json({
    attempts: listCraftAttempts(user.id),
    byRecipe: craftPnlByRecipe(user.id),
    labels: Object.fromEntries(RECIPES.map((r) => [r.key, r.label])),
    hitRates: Object.fromEntries(RECIPES.map((r) => [r.key, r.hitRate])),
    icons: recipeIcons(league),
    computedLeague: league,
    exaltPerDivine: resolveRates(league)?.rates.exaltPerDivine ?? null,
  });
}

/**
 * POST /api/craft/attempts → log a new attempt. Explicit baseCostDiv/matsCostDiv win. With
 * `prefill: true` the base comes ONLY from a base leg that cleared the ask floor and the materials
 * from today's snapshot prices; when either is unknown the request is refused (409 + `needs`) so
 * the UI asks the user instead of recording a junk-floor cost.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await parseBody(req, PostBody);
  if ("error" in body) return body.error;
  const b = body.data;
  if (!b.prefill && (b.baseCostDiv == null || b.matsCostDiv == null)) {
    return NextResponse.json({ error: "baseCostDiv and matsCostDiv are required without prefill" }, { status: 400 });
  }

  const league = getDefaultLeague();
  const recipe = RECIPES.find((r) => r.key === b.recipeKey)!;
  const { lines, missing } = priceMaterials(recipe, getMaterialPrices(league, recipe.materials.map((m) => m.material.id)));
  const totalDiv = lines.reduce((s, l) => s + (l.totalDiv ?? 0), 0);
  const costs = prefillCosts(actionableReport(league, recipe.key), b, { totalDiv, missing });
  if (!costs.ok) return NextResponse.json({ error: costs.error, needs: costs.needs }, { status: 409 });

  const id = addCraftAttempt(user.id, { recipeKey: b.recipeKey, ...costs, note: b.note ?? null });
  return NextResponse.json({ id, baseCostDiv: costs.baseCostDiv, matsCostDiv: costs.matsCostDiv });
}

/** PATCH /api/craft/attempts → close an attempt (outcome hit/brick + realized sale in Div). */
export async function PATCH(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await parseBody(req, PatchBody);
  if ("error" in body) return body.error;
  closeCraftAttempt(user.id, body.data.id, body.data.outcome, body.data.soldDiv ?? null);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/craft/attempts → remove a logged attempt. */
export async function DELETE(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await parseBody(req, DeleteBody);
  if ("error" in body) return body.error;
  deleteCraftAttempt(user.id, body.data.id);
  return NextResponse.json({ ok: true });
}
