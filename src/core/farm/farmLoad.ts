import { latestFetchedAt, latestSnapshots } from "../../db/marketQueries";
import type { FarmResponse } from "../../lib/farmContract";
import { patchCoverageSchema } from "../../sources/patchNotes/contracts";
import { rankFarms } from "../farmAdvisor";
import { resolveRates } from "../rates";
import { evaluateBosses } from "../tools/bossEv/ev";
import { loadPriceInputs, priceLookup, referencedNinjaIds } from "../tools/bossEv/pricing";
import { parseBossArt } from "../tools/bossEv/art";
import { loadBossLoot } from "../tools/bossEv/curated";
import { patchWarning } from "../tools/bossEv/schema";
import { buildFarmBoard, isBossRow, isMechanicRow, mechanicIcons } from "./farmBoard";
import bossArtRaw from "../../data/poe2/bosses/boss-art.json";
import patchCoverageRaw from "../../data/poe2/patch-coverage.json";

// Parsed at module load: a malformed curated file must break every caller loudly, not price nothing.
const BOSS_LOOT = loadBossLoot();
const BOSS_ART = parseBossArt(bossArtRaw);
const NINJA_IDS = referencedNinjaIds(BOSS_LOOT);
const COVERAGE_PATCH = patchCoverageSchema.parse(patchCoverageRaw).game_data_patch;

/** The farm board as every viewer of `league` sees it (nothing in it is per user). */
export type FarmBoardLoad = FarmResponse;

/**
 * "What to farm now" for one league at `nowMs`: mechanic baskets by 7d heat (rankFarms) and pinnacle
 * bosses by net per kill, plus each boss's full evaluation. Read-only; shared by GET /api/farm and
 * anything else that summarises the board (the Discord live board), so both rank identically.
 */
export function loadFarmBoard(league: string, nowMs: number): FarmBoardLoad {
  const snapshots = latestSnapshots(league);
  const ranks = rankFarms(snapshots);
  const icons = mechanicIcons(ranks, snapshots);
  const inputs = loadPriceInputs(league, NINJA_IDS, nowMs, snapshots);
  const resolved = resolveRates(league, nowMs);
  const details = evaluateBosses(BOSS_LOOT, priceLookup(inputs), BOSS_ART);
  const rows = buildFarmBoard(
    ranks.map((r) => ({ ...r, icon: icons.get(r.category) ?? null })),
    details,
    resolved?.rates.exaltPerDivine ?? 0,
  );
  return {
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
}
