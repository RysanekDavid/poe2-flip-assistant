import { getMaterialPrices } from "../../../db/craftQueries";
import { MATS } from "../../craftMaterials";
import { entityByExchangeId } from "../../entities/load";
import type { PlanRequest, PlanResponse, PlannerCatalog, PlannerPool } from "../../../lib/tools/craftPlannerContract";
import { resolveRates } from "../../rates";
import { comboFor, loadCraftCatalog, type CraftCatalog } from "../craftmoves/catalog";
import { CATALYSTS } from "./catalystTags";
import { essencesFor } from "./essenceOutcomes";
import { BONE } from "./methodsDesecrate";
import { loadCraftMining } from "../../research/craftMining/load";
import { PLANNER_MATERIAL_IDS } from "./materialIds";
import { planCraft, SERVER_PLAN_BUDGET } from "./plan";
import { revealPriorsFrom } from "./revealPriors";
import { factionOf, PLANNER_CLASSES, resolveBase } from "./targets";

/**
 * Server wiring for the planner: the committed craft catalog, live material prices (ninja
 * snapshots) and rates from SQLite. Spends no trade2 budget.
 */

/** Entity-catalog art (always a poecdn URL the CSP allows); null for a material it lacks. */
export const catalogIcon = (materialId: string): string | null => entityByExchangeId(materialId)?.icon_url ?? null;

function livePrices(league: string): { prices: Map<string, number>; icons: Map<string, string> } {
  const prices = new Map<string, number>();
  const icons = new Map<string, string>();
  for (const [id, p] of getMaterialPrices(league, PLANNER_MATERIAL_IDS)) {
    if (Number.isFinite(p.priceDiv) && p.priceDiv > 0) prices.set(id, p.priceDiv);
    if (p.icon) icons.set(id, p.icon);
  }
  return { prices, icons };
}

export function planForLeague(req: PlanRequest, league: string, now: Date): PlanResponse {
  const rates = resolveRates(league, now.getTime());
  const live = livePrices(league);
  // catalog art first: a ninja snapshot icon is only the fallback for a material the catalog lacks
  const iconOf = (id: string): string | null => catalogIcon(id) ?? live.icons.get(id) ?? null;
  const reveal = revealPriorsFrom(loadCraftMining().priors);
  return planCraft(req, { cat: loadCraftCatalog(), prices: live.prices, exaltPerDivine: rates?.rates.exaltPerDivine ?? null, league, now, iconOf, budget: SERVER_PLAN_BUDGET, reveal });
}

export function plannerCatalog(cat: CraftCatalog = loadCraftCatalog()): PlannerCatalog {
  const classes = PLANNER_CLASSES.map((itemClass) => ({
    itemClass,
    bases: Object.entries(cat.bases)
      .filter(([name, b]) => b.itemClass === itemClass && comboFor(cat, itemClass, name) != null)
      .map(([name]) => {
        const { base } = resolveBase(cat, itemClass, name, 100);
        const jewel = base.jewel;
        return { name, implicits: [...base.implicits], caps: jewel ? { p: 2, s: 2 } : { p: 3 + base.allowance.p, s: 3 + base.allowance.s }, qualityCap: base.qualityCap };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
  return { kind: "catalog", classes, catalysts: CATALYSTS.map((c) => ({ id: c.mat.id, label: c.mat.label, icon: catalogIcon(c.mat.id) })) };
}

const tiersOf = (cat: CraftCatalog, tiers: Record<string, number>) =>
  Object.entries(tiers)
    .sort((a, b) => a[1] - b[1])
    .map(([modId, level]) => ({ modId, level, text: cat.mods[modId]?.text ?? modId }));

/** What a base can carry: natural families per side, desecrated families, essence-only mods. */
export function plannerPool(itemClass: PlanRequest["itemClass"], baseName: string, cat: CraftCatalog = loadCraftCatalog()): PlannerPool {
  const { combo } = resolveBase(cat, itemClass, baseName, 100);
  const essences = essencesFor(itemClass);
  const natural = (["prefix", "suffix"] as const).flatMap((side) =>
    Object.entries(combo[side]).map(([family, tiers]) => ({
      family,
      side,
      source: "natural" as const,
      faction: null,
      tiers: tiersOf(cat, tiers),
      essences: essences.filter((e) => cat.mods[e.modId]?.family === family && !cat.mods[e.modId]?.craftedOnly).map((e) => ({ id: e.essenceId, label: e.label, modId: e.modId, icon: catalogIcon(e.essenceId) })),
    })),
  );
  const desecrated = Object.entries(combo.desecrated).map(([family, tiers]) => {
    const first = cat.mods[Object.keys(tiers)[0]!]!;
    return { family, side: first.side, source: "desecrated" as const, faction: factionOf(first.tags), tiers: tiersOf(cat, tiers), essences: [] };
  });
  const crafted = essences
    .filter((e) => cat.mods[e.modId]?.craftedOnly)
    .map((e) => {
      const mod = cat.mods[e.modId]!;
      return { family: mod.family, side: mod.side, source: "essence" as const, faction: null, tiers: [{ modId: e.modId, level: mod.level, text: mod.text }], essences: [{ id: e.essenceId, label: e.label, modId: e.modId, icon: catalogIcon(e.essenceId) }] };
    });
  const boneKey = BONE[itemClass];
  if (!boneKey) throw new Error(`planner: no desecration bone for ${itemClass}`);
  const bone = MATS[boneKey];
  return {
    kind: "pool",
    itemClass,
    base: baseName,
    families: [...natural, ...crafted, ...desecrated],
    bone: { id: bone.id, label: bone.label, icon: catalogIcon(bone.id) },
    patch: { data: cat.gameDataPatch, repoe: cat.repoeVersion },
  };
}
