import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "../../../../auth/session";
import { upsertCraftBaseHunt } from "../../../../db/craftQueries";
import { getDefaultLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";
import { fetchTradeMeta } from "../../../../api/tradeMeta";
import { buildStatIndex } from "../../../../core/statResolver";
import { legToQuery } from "../../../../core/craftMargin";
import { storedReport } from "../../../../core/craftReports";
import { presetCap } from "../../../../core/craftPrefill";
import { RECIPES } from "../../../../core/craftRecipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ recipeKey: z.string().min(1) });

/**
 * POST /api/craft/hunt-preset { recipeKey } → create OR update (one per user × recipe_key × league)
 * the hunt for the recipe's craft base, capped at ~120% of the floor-validated base price. Refuses
 * with a clear 409 when the base leg never cleared the ask floor — a cap derived from a junk
 * floor would scan for garbage forever. Uses only cached/local data (tradeMeta 24h cache +
 * stored margin report) — no trade2 search on the request path.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch((e: unknown) => ({ invalid: String(e) })));
  const recipe = parsed.success ? RECIPES.find((r) => r.key === parsed.data.recipeKey) : undefined;
  if (!recipe) return NextResponse.json({ error: "unknown recipeKey" }, { status: 400 });

  // Hunts and the margin scan both run under the shared owner cred in the app default league;
  // building the preset from another league's price would cap the hunt at a foreign price.
  const league = getDefaultLeague();
  const preset = presetCap(storedReport(league, recipe.key), resolveRates(league)?.rates ?? null);
  if (!preset.ok) return NextResponse.json({ error: preset.error }, { status: 409 });

  const { stats } = await fetchTradeMeta();
  const { query, unresolved } = legToQuery(recipe.base, buildStatIndex(stats));
  if (unresolved.length > 0) {
    return NextResponse.json({ error: `unresolved base stats: ${unresolved.join("; ")}` }, { status: 409 });
  }

  const { id, created } = upsertCraftBaseHunt(user.id, league, recipe.key, {
    label: `base · ${recipe.label}`,
    mode: "CRAFT_BASE",
    item_name: null,
    base_type: recipe.base.type ?? null,
    category: recipe.base.category ?? null,
    ilvl_min: recipe.base.ilvlMin ?? null,
    rarity: recipe.base.rarity ?? null,
    stats_json: query.stats && query.stats.length > 0 ? JSON.stringify(query.stats) : null,
    max_amount: preset.cap.amount,
    max_ccy: preset.cap.ccy,
    target_div: preset.targetDiv,
  });
  return NextResponse.json({ id, created, cap: preset.cap, computedLeague: league });
}
