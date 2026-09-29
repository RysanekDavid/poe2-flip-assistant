import type { TradeCred } from "../../../api/tradeClient";
import { config } from "../../../config/env";
import { observedByBaseRef } from "../../../db/marketQueries";
import { freshModValues, modValueMapKey } from "../../../db/modValueQueries";
import type { ModPoolCatalog, ModPoolQuery, ModPoolResponse, ModValueRequest, ModValueResponse } from "../../../lib/tools/modPoolContract";
import { resolveRates } from "../../rates";
import type { StatIndex } from "../../statResolver";
import { loadCraftCatalog } from "../craftmoves/catalog";
import type { ObsLookup } from "./bookSignal";
import { cachedLiveValue, fetchLiveValue, freshAfter, type LiveTarget } from "./liveValue";
import { assemblePool, familyTier, poolClasses, statOfTier } from "./pool";
import { loadStatIndex } from "./statIndex";

/**
 * Server wiring for the mod pool: catalog, cached trade2 stat catalog, price book, shared live
 * cache, rates. The pool read spends no trade2 search; only valueFamily may, and only on a miss.
 */

export function loadPoolCatalog(): ModPoolCatalog {
  return { kind: "catalog", classes: poolClasses(loadCraftCatalog()) };
}

/** One book read per distinct ref per pool: sibling res rows and the baseline must not re-query. */
export function memoObs(read: ObsLookup): ObsLookup {
  const memo = new Map<string | null, number[]>();
  return (ref) => {
    const hit = memo.get(ref);
    if (hit) return hit;
    const prices = read(ref);
    memo.set(ref, prices);
    return prices;
  };
}

/**
 * The stat catalog, or the reason it is down. The gates stand on their own, so an outage is
 * returned beside them (a clear bookError the panel shows) instead of failing the whole pool.
 */
async function statIndexOrError(nowMs: number): Promise<{ idx: StatIndex | null; error: string | null }> {
  try {
    return { idx: await loadStatIndex(nowMs), error: null };
  } catch (e: unknown) {
    return { idx: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function loadModPool(sel: ModPoolQuery, league: string, nowMs: number): Promise<ModPoolResponse> {
  const cat = loadCraftCatalog();
  const { idx, error } = await statIndexOrError(nowMs);
  const cached = freshModValues(league, sel.base, freshAfter(nowMs));
  return assemblePool(cat, sel, {
    league,
    idx,
    bookError: error,
    obs: memoObs((ref) => observedByBaseRef(league, sel.base, ref)),
    live: (statId, minRoll) => cached.get(modValueMapKey(statId, minRoll)) ?? null,
    cacheHours: config.modPool.cacheHours,
    exaltPerDivine: resolveRates(league, nowMs)?.rates.exaltPerDivine ?? null,
    patch: { data: cat.gameDataPatch, repoe: cat.repoeVersion },
  });
}

export type FamilyValueLookup = { kind: "hit"; response: ModValueResponse } | { kind: "miss"; target: LiveTarget };

const hitOf = (req: ModValueRequest, target: LiveTarget, nowMs: number): FamilyValueLookup | null => {
  const live = cachedLiveValue(target, nowMs);
  return live ? { kind: "hit", response: { family: req.family, side: req.side, live, cached: true } } : null;
};

/**
 * Cache first, trade2 catalog second. The tier (roll + level) comes from the craft catalog alone, so
 * with the row's statId a cache hit answers even while trade2 /data is down. A miss resolves the stat
 * on the server — the client's statId only ever reads, never writes the shared cache. Throws
 * UnknownBaseError / ModNotSearchableError / StatCatalogUnavailableError.
 */
export async function lookupFamilyValue(req: ModValueRequest, league: string, nowMs: number): Promise<FamilyValueLookup> {
  const cat = loadCraftCatalog();
  // rarity only picks which currency floors the gates show; the searched tier does not depend on it
  const tier = familyTier(cat, { itemClass: req.itemClass, base: req.base, ilvl: req.ilvl, rarity: "Rare" }, req.family, req.side);
  const at = (statId: string): LiveTarget => ({ league, baseType: req.base, statId, minRoll: tier.minRoll, tierLevel: tier.tierLevel });
  const early = req.statId ? hitOf(req, at(req.statId), nowMs) : null;
  if (early) return early;
  const target = at(statOfTier(tier, await loadStatIndex(nowMs)));
  return hitOf(req, target, nowMs) ?? { kind: "miss", target };
}

export async function valueFamily(req: ModValueRequest, target: LiveTarget, cred: TradeCred, nowMs: number): Promise<ModValueResponse> {
  const live = await fetchLiveValue(target, cred, nowMs);
  return { family: req.family, side: req.side, live, cached: false };
}
