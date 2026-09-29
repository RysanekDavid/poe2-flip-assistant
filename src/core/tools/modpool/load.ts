import { fetchTradeMeta } from "../../../api/tradeMeta";
import type { TradeCred } from "../../../api/tradeClient";
import { config } from "../../../config/env";
import { observedByBaseRef } from "../../../db/marketQueries";
import { freshModValues, modValueMapKey } from "../../../db/modValueQueries";
import type { ModPoolCatalog, ModPoolQuery, ModPoolResponse, ModValueRequest, ModValueResponse } from "../../../lib/tools/modPoolContract";
import { resolveRates } from "../../rates";
import { buildStatIndex, type StatIndex } from "../../statResolver";
import { loadCraftCatalog } from "../craftmoves/catalog";
import { cachedLiveValue, fetchLiveValue, freshAfter, type LiveTarget } from "./liveValue";
import { assemblePool, liveTargetOf, poolClasses } from "./pool";

/**
 * Server wiring for the mod pool: catalog, cached trade2 stat catalog, price book, shared live
 * cache, rates. The pool read spends no trade2 search; only valueFamily may, and only on a miss.
 */

export function loadPoolCatalog(): ModPoolCatalog {
  return { kind: "catalog", classes: poolClasses(loadCraftCatalog()) };
}

/**
 * The (24 h cached) trade2 stat catalog. When the read fails the gates still stand on their own,
 * so the failure is returned beside them instead of failing the whole pool.
 */
async function statIndex(): Promise<{ idx: StatIndex | null; error: string | null }> {
  try {
    const { stats } = await fetchTradeMeta();
    return { idx: buildStatIndex(stats), error: null };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[mod-pool] trade2 stat catalog unavailable: ${error}`);
    return { idx: null, error };
  }
}

export async function loadModPool(sel: ModPoolQuery, league: string, nowMs: number): Promise<ModPoolResponse> {
  const cat = loadCraftCatalog();
  const { idx, error } = await statIndex();
  const cached = freshModValues(league, sel.base, freshAfter(nowMs));
  return assemblePool(cat, sel, {
    league,
    idx,
    bookError: error,
    obs: (ref) => observedByBaseRef(league, sel.base, ref),
    live: (statId, minRoll) => cached.get(modValueMapKey(statId, minRoll)) ?? null,
    cacheHours: config.modPool.cacheHours,
    exaltPerDivine: resolveRates(league, nowMs)?.rates.exaltPerDivine ?? null,
    patch: { data: cat.gameDataPatch, repoe: cat.repoeVersion },
  });
}

/** The live target of one family; throws UnknownBaseError / ModNotSearchableError / catalog errors. */
export async function liveTargetFor(req: ModValueRequest, league: string): Promise<LiveTarget> {
  const { stats } = await fetchTradeMeta();
  // rarity only picks which currency floors the gates show; the searched tier does not depend on it
  const sel: ModPoolQuery = { itemClass: req.itemClass, base: req.base, ilvl: req.ilvl, rarity: "Rare" };
  const t = liveTargetOf(loadCraftCatalog(), sel, req.family, req.side, buildStatIndex(stats));
  return { league, baseType: req.base, statId: t.statId, minRoll: t.minRoll, ilvl: req.ilvl };
}

/** A shared cache hit, or null — the route checks this before it asks for a credential. */
export function cachedFamilyValue(req: ModValueRequest, target: LiveTarget, nowMs: number): ModValueResponse | null {
  const live = cachedLiveValue(target, nowMs);
  return live ? { family: req.family, side: req.side, live, cached: true } : null;
}

export async function valueFamily(req: ModValueRequest, target: LiveTarget, cred: TradeCred, nowMs: number): Promise<ModValueResponse> {
  const live = await fetchLiveValue(target, cred, nowMs);
  return { family: req.family, side: req.side, live, cached: false };
}
