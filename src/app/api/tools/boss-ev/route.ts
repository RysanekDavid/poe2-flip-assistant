import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { leagueForUser } from "../../../../core/leagueUsers";
import { resolveRates } from "../../../../core/rates";
import { evaluateBosses } from "../../../../core/tools/bossEv/ev";
import { loadPriceInputs, priceLookup, referencedNinjaIds } from "../../../../core/tools/bossEv/pricing";
import { parseBossLoot, patchWarning } from "../../../../core/tools/bossEv/schema";
import { latestFetchedAt } from "../../../../db/marketQueries";
import type { BossEvResponse } from "../../../../lib/tools/bossEvContract";
import { patchCoverageSchema } from "../../../../sources/patchNotes/contracts";
import bossLootRaw from "../../../../data/poe2/bosses/boss-loot.json";
import patchCoverageRaw from "../../../../data/poe2/patch-coverage.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Parsed at module load: a malformed curated file must break the route loudly, not price nothing.
const BOSS_LOOT = parseBossLoot(bossLootRaw);
const NINJA_IDS = referencedNinjaIds(BOSS_LOOT);
const COVERAGE_PATCH = patchCoverageSchema.parse(patchCoverageRaw).game_data_patch;

/**
 * GET /api/tools/boss-ev → per pinnacle boss: entry cost (buy vs craft), break-even drop rate for
 * the chase drops, and EV over the priced, rate-sourced part of the loot table. Read-only.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const league = leagueForUser(user.id);
  const nowMs = Date.now();
  const inputs = loadPriceInputs(league, NINJA_IDS, nowMs);
  const resolved = resolveRates(league, nowMs);
  const body: BossEvResponse = {
    computedLeague: league,
    dataAsOf: BOSS_LOOT.dataAsOf,
    patch: BOSS_LOOT.patch,
    patchWarning: patchWarning(BOSS_LOOT.patch, COVERAGE_PATCH, nowMs),
    rates: resolved ? { ...resolved.rates, source: resolved.source, fetchedAt: resolved.fetchedAt } : null,
    pricesFetchedAt: latestFetchedAt(league),
    scoutAgeHours: inputs.scoutAgeHours,
    bosses: evaluateBosses(BOSS_LOOT, priceLookup(inputs)),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
