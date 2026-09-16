import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { getMaterialPrices } from "../../../../db/craftQueries";
import { getActiveLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";
import { ALL_MATERIALS } from "../../../../core/craftMaterials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/craft/materials → curated craft materials joined to their latest ninja price. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const league = getActiveLeague();
  const prices = getMaterialPrices(league, ALL_MATERIALS.map((m) => m.id));
  const materials = ALL_MATERIALS.map((m) => {
    const p = prices.get(m.id);
    return {
      id: m.id,
      label: m.label,
      group: m.group,
      icon: p?.icon ?? null,
      priceDiv: p?.priceDiv ?? null,
      change7d: p?.change7d ?? null,
      spark7d: p?.spark7d ?? null,
      ageMin: p?.ageMin ?? null,
    };
  });

  const resolved = resolveRates(league);
  return NextResponse.json({
    materials,
    exaltPerDivine: resolved?.rates.exaltPerDivine ?? null,
    ratesSource: resolved?.source ?? null,
    ratesFetchedAt: resolved?.fetchedAt ?? null,
  });
}
