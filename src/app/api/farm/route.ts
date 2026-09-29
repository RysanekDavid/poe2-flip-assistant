import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../auth/session";
import { buildFarmBoard, isBossRow, isMechanicRow, mechanicIcons } from "../../../core/farm/farmBoard";
import { rankFarms } from "../../../core/farmAdvisor";
import { leagueForUser } from "../../../core/leagueUsers";
import { resolveRates } from "../../../core/rates";
import { evaluateBosses } from "../../../core/tools/bossEv/ev";
import { loadPriceInputs, priceLookup, referencedNinjaIds } from "../../../core/tools/bossEv/pricing";
import { parseBossLoot, patchWarning } from "../../../core/tools/bossEv/schema";
import { latestFetchedAt, latestSnapshots } from "../../../db/marketQueries";
import { farmResponseSchema, type FarmResponse } from "../../../lib/farmContract";
import { patchCoverageSchema } from "../../../sources/patchNotes/contracts";
import bossLootRaw from "../../../data/poe2/bosses/boss-loot.json";
import patchCoverageRaw from "../../../data/poe2/patch-coverage.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Parsed at module load: a malformed curated file must break the route loudly, not price nothing.
const BOSS_LOOT = parseBossLoot(bossLootRaw);
const NINJA_IDS = referencedNinjaIds(BOSS_LOOT);
const COVERAGE_PATCH = patchCoverageSchema.parse(patchCoverageRaw).game_data_patch;

/**
 * GET /api/farm → "what to farm now": mechanic baskets by 7d heat (rankFarms) and pinnacle bosses
 * by net per kill (entry buy-vs-craft, floor vs chase, P(losing kill), entry liquidity), plus each
 * boss's full evaluation for the detail panel. Read-only; the viewer's league.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const league = leagueForUser(user.id);
  const nowMs = Date.now();
  const snapshots = latestSnapshots(league);
  const ranks = rankFarms(snapshots);
  const icons = mechanicIcons(ranks, snapshots);
  const inputs = loadPriceInputs(league, NINJA_IDS, nowMs);
  const resolved = resolveRates(league, nowMs);
  const details = evaluateBosses(BOSS_LOOT, priceLookup(inputs));
  const rows = buildFarmBoard(
    ranks.map((r) => ({ ...r, icon: icons.get(r.category) ?? null })),
    details,
    resolved?.rates.exaltPerDivine ?? 0,
  );
  const body: FarmResponse = {
    computedLeague: league,
    mechanics: rows.filter(isMechanicRow),
    bosses: rows.filter(isBossRow),
    details,
    rates: resolved ? { ...resolved.rates, source: resolved.source, fetchedAt: resolved.fetchedAt } : null,
    pricesFetchedAt: latestFetchedAt(league),
    scoutAgeHours: inputs.scoutAgeHours,
    dataAsOf: BOSS_LOOT.dataAsOf,
    patch: BOSS_LOOT.patch,
    patchWarning: patchWarning(BOSS_LOOT.patch, COVERAGE_PATCH, nowMs),
  };
  // validated on the way out: a drift between the engine and the contract fails here, not in the browser
  return NextResponse.json(farmResponseSchema.parse(body), { headers: { "Cache-Control": "no-store" } });
}
