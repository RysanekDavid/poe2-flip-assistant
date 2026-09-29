import type { PricedItem } from "../../api/types";
import type { BossRow, FarmBoardRow, MechanicRow } from "../../lib/farmContract";
import type { BossView, TierResult } from "../../lib/tools/bossEvContract";
import type { FarmRank } from "../farmAdvisor";
import { breakEvenHeadline, weakest } from "../tools/bossEv/headline";

/*
 * "What to farm now", pure: the mechanic heat ranking (farmAdvisor.rankFarms, unchanged — the Coach
 * drift test pins its constants) composed with the pinnacle-boss evaluation. Mechanics lead in heat
 * order; bosses follow by net per kill, and a boss whose entry is partly unpriced sorts after every
 * fully priced one — its net is only an upper bound, it must not outrank a real number.
 */

export type MechanicInput = FarmRank & { icon: string | null };

/** Art per mechanic: the icon of its top driver as the latest snapshot lists it. */
export function mechanicIcons(ranks: readonly FarmRank[], items: readonly PricedItem[]): Map<string, string | null> {
  const iconByName = new Map<string, string>();
  for (const it of items) if (it.icon) iconByName.set(it.itemName, it.icon);
  return new Map(ranks.map((r) => [r.category, r.drivers.map((d) => iconByName.get(d.item)).find((i) => i != null) ?? null]));
}

// The board is the same for every viewer; farmSpeed.applySpeeds fills these in per viewer.
const NO_SPEED = { yourMinutes: null, divPerHour: null, divPerHourBound: null } as const;

function mechanicRow(m: MechanicInput): MechanicRow {
  return { kind: "mechanic", ...m, ...NO_SPEED, yourDivPerRun: null };
}

/** The tier a row summarises: the first, which is the only one every current boss has. */
export function defaultTier(boss: BossView): TierResult {
  const tier = boss.tiers[0];
  if (!tier) throw new Error(`boss ${boss.id} has no tiers`);
  return tier;
}

function netBoundOf(entryComplete: boolean, uncounted: number): BossRow["netBound"] {
  if (entryComplete) return uncounted > 0 ? "lower" : "exact";
  return uncounted > 0 ? "unknown" : "upper";
}

function bossRow(boss: BossView, exPerDiv: number): BossRow {
  const t = defaultTier(boss);
  const carrying = t.loot.filter((l) => (l.evDiv ?? 0) > 0).map((l) => l.confidence);
  const uncountedDrops = t.loot.filter((l) => l.evDiv == null).length;
  return {
    kind: "boss",
    id: boss.id,
    name: boss.name,
    mechanic: boss.mechanic,
    icon: boss.icon,
    tierId: t.tierId,
    entryDiv: t.entryDiv,
    entryComplete: t.entryComplete,
    entry: t.entryLines.map((l) => ({ name: l.name, qty: l.qty, icon: l.icon, costDiv: l.costDiv, route: l.route })),
    entryVolume: t.entryVolume,
    floorDiv: t.floorDiv,
    chaseDiv: t.chaseDiv,
    netDiv: t.netDiv,
    netBound: netBoundOf(t.entryComplete, uncountedDrops),
    uncountedDrops,
    chaseOneIn: t.chaseOneIn,
    pLosingRun: t.pLosingRun,
    losingRunUnknownRates: t.losingRunUnknownRates,
    headline: breakEvenHeadline(t, exPerDiv),
    confidence: weakest(carrying),
    unpriced: t.unpriced,
    unpricedLineage: t.unpricedLineage,
    unknownRate: t.unknownRate.length,
    ...NO_SPEED,
  };
}

/**
 * 0 — a net we can stand behind: exact, or a lower bound that is already ≥ 0;
 * 1 — "rates unknown": a negative lower bound, the loss is NOT certain (unrated drops may cover it);
 * 2 — entry partly unpriced: the net is an upper bound or unknown.
 */
export function netGroup(r: BossRow): 0 | 1 | 2 {
  if (r.netBound === "exact" || (r.netBound === "lower" && r.netDiv >= 0)) return 0;
  return r.netBound === "lower" ? 1 : 2;
}

const byNet = (a: BossRow, b: BossRow): number => netGroup(a) - netGroup(b) || b.netDiv - a.netDiv;

/** Mechanics (already heat-ordered by rankFarms) first, then bosses by net per kill (see netGroup). */
export function buildFarmBoard(mechanics: readonly MechanicInput[], bosses: readonly BossView[], exPerDiv: number): FarmBoardRow[] {
  return [...mechanics.map(mechanicRow), ...bosses.map((b) => bossRow(b, exPerDiv)).sort(byNet)];
}

export const isMechanicRow = (r: FarmBoardRow): r is MechanicRow => r.kind === "mechanic";
export const isBossRow = (r: FarmBoardRow): r is BossRow => r.kind === "boss";
