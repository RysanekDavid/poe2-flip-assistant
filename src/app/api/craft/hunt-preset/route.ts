import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { addHunt } from "../../../../db/huntQueries";
import { getCraftMargins } from "../../../../db/craftQueries";
import { getDefaultLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";
import { fetchTradeMeta } from "../../../../api/tradeMeta";
import { buildStatIndex } from "../../../../core/statResolver";
import { legToQuery } from "../../../../core/craftMargin";
import { RECIPES, RecipeMarginReportSchema } from "../../../../core/craftRecipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Buy-cap headroom over the scanned base floor: hunts should also catch slightly-above-floor
// listings of a well-structured base, not only the absolute cheapest garbage.
const CAP_FACTOR = 1.2;

/**
 * POST /api/craft/hunt-preset { recipeKey } → create a ready-made hunt for the recipe's craft
 * base, capped at ~120% of the last scanned base price. Uses only cached/local data (tradeMeta
 * 24h cache + stored margin report) — no trade2 search on the request path.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json()) as { recipeKey?: string };
  const recipe = RECIPES.find((r) => r.key === b.recipeKey);
  if (!recipe) return NextResponse.json({ error: "unknown recipeKey" }, { status: 400 });

  // Hunts and the margin scan both run under the shared owner cred in the app default league;
  // building the preset from another league's floor would cap the hunt at a foreign price.
  const league = getDefaultLeague();
  const row = getCraftMargins(league).find((r) => r.recipe_key === recipe.key);
  const parsed = row ? RecipeMarginReportSchema.safeParse(JSON.parse(row.report_json)) : null;
  const report = parsed?.success ? parsed.data : null;
  if (!report?.base) {
    return NextResponse.json(
      { error: "no scanned base price for this recipe yet — run a margin refresh first" },
      { status: 409 },
    );
  }

  const { stats } = await fetchTradeMeta();
  const { query, unresolved } = legToQuery(recipe.base, buildStatIndex(stats));
  if (unresolved.length > 0) {
    return NextResponse.json({ error: `unresolved base stats: ${unresolved.join("; ")}` }, { status: 409 });
  }

  // Cap in Divine when the floor is ≥1 div, otherwise in Exalted (small bases read better in ex).
  const capDiv = report.base.priceDiv * CAP_FACTOR;
  const rates = resolveRates(league)?.rates ?? null;
  const cap =
    capDiv >= 1 || rates == null
      ? { amount: Math.max(0.1, Math.round(capDiv * 10) / 10), ccy: "divine" }
      : { amount: Math.max(1, Math.ceil(capDiv * rates.exaltPerDivine)), ccy: "exalted" };

  const id = addHunt(user.id, league, {
    label: `base · ${recipe.label}`,
    mode: "CRAFT_BASE",
    item_name: null,
    base_type: recipe.base.type ?? null,
    category: recipe.base.category ?? null,
    ilvl_min: recipe.base.ilvlMin ?? null,
    rarity: recipe.base.rarity ?? null,
    stats_json: query.stats && query.stats.length > 0 ? JSON.stringify(query.stats) : null,
    max_amount: cap.amount,
    max_ccy: cap.ccy,
    target_div: report.result?.priceDiv ?? null,
  });
  return NextResponse.json({ id, cap, computedLeague: league });
}
