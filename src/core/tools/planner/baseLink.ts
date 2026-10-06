import type { StatOption } from "../../../api/tradeMeta";
import { tradeSearchUrl, type StatFilter } from "../../../lib/tradeLink";
import type { BaseLinkRequest, BaseLinkResponse } from "../../../lib/tools/craftPlannerContractStart";
import { buildStatIndex, type StatIndex } from "../../statResolver";
import type { CraftCatalog } from "../craftmoves/catalog";
import { resolveTier, tierTemplate } from "../modpool/bookSignal";

/**
 * The trade search for a base the player buys carrying wanted mods: the base type, rarity, item
 * level, and each carried mod at its minimum tier's lowest roll — a pool slot as "at least one of
 * its candidates". A fractured carried mod searches trade2's fractured twin of the stat (the same
 * stat in the "fractured" group), so the listing must have it fractured. Mods the trade catalog
 * has no stat for are reported, never dropped silently. Pure: the route passes the cached
 * /api/trade2/data stats (no search is run, no search budget spent).
 */

export interface StatCatalogs {
  explicit: StatIndex;
  fractured: StatIndex;
}

export function statCatalogs(stats: readonly StatOption[], flaggedStats: readonly StatOption[]): StatCatalogs {
  return { explicit: buildStatIndex([...stats]), fractured: buildStatIndex(flaggedStats.filter((s) => s.group === "fractured")) };
}

function filterFor(cat: CraftCatalog, idx: StatCatalogs, modId: string, fractured: boolean): { filter: StatFilter | null; text: string } {
  const mod = cat.mods[modId];
  if (!mod) throw new Error(`base link: unknown modifier id "${modId}"`);
  const t = tierTemplate(mod.text);
  const hit = resolveTier(t, fractured ? idx.fractured : idx.explicit);
  // the fractured twin carries the explicit stat's hash: only a fractured-group id is a fractured search
  const ok = hit && (!fractured || hit.statId.startsWith("fractured."));
  return { filter: ok ? { id: hit.statId, ...(t.minRoll != null ? { min: t.minRoll } : {}) } : null, text: t.line };
}

export function buildBaseLink(cat: CraftCatalog, idx: StatCatalogs, league: string, req: BaseLinkRequest): BaseLinkResponse {
  const unmatched: string[] = [];
  const stats: StatFilter[] = [];
  const anyOf: Array<{ filters: StatFilter[]; min: number }> = [];
  for (const c of req.carried) {
    const got = c.modIds.map((id) => filterFor(cat, idx, id, c.fractured));
    unmatched.push(...got.filter((g) => !g.filter).map((g) => `${c.fractured ? "fractured " : ""}${g.text}`));
    const filters = got.flatMap((g) => (g.filter ? [g.filter] : []));
    if (c.modIds.length === 1) stats.push(...filters);
    else if (filters.length > 0) anyOf.push({ filters, min: 1 });
  }
  const url = tradeSearchUrl(league, { type: req.base, rarity: req.rarity === "Magic" ? "magic" : "rare", ilvlMin: req.ilvl, stats, anyOf });
  return { url, unmatched };
}
