import type { PricedItem } from "../../api/types";
import type { BossRow, FarmBoardRow, MechanicRow } from "../../lib/farmContract";
import type { BossView, TierResult } from "../../lib/tools/bossEvContract";
import type { FarmRank } from "../farmAdvisor";
import { weakest } from "../tools/bossEv/confidence";
import { breakEvenHeadline } from "../tools/bossEv/headline";

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

function mechanicRow(m: MechanicInput): MechanicRow {
  return { kind: "mechanic", ...m };
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
  // an entry cost the tool cannot price understates the entry exactly like an unpriced line
  const entryFull = t.entryComplete && t.unmodelledEntry == null;
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
    unmodelledEntry: t.unmodelledEntry,
    entryVolume: t.entryVolume,
    floorDiv: t.floorDiv,
    floorDrops: t.floorDrops,
    chaseDiv: t.chaseDiv,
    netDiv: t.netDiv,
    netBound: netBoundOf(entryFull, uncountedDrops),
    uncountedDrops,
    chaseOneIn: t.chaseOneIn,
    pLosingRun: t.pLosingRun,
    losingRunUnknownRates: t.losingRunUnknownRates,
    losingRunConfidence: t.losingRunConfidence,
    headline: breakEvenHeadline(t, exPerDiv),
    confidence: weakest(carrying),
    unpriced: t.unpriced,
    unpricedLineage: t.unpricedLineage,
    unknownRate: t.unknownRate.length,
  };
}

/**
 * 0 — a net we can stand behind: exact, or a lower bound that is already ≥ 0;
 * 1 — "rates unknown": a negative lower bound, the loss is NOT certain (unrated drops may cover it);
 * 2 — entry partly unpriced or not fully modelled: the net is an upper bound or unknown.
 */
export function netGroup(r: BossRow): 0 | 1 | 2 {
  if (r.netBound === "exact" || (r.netBound === "lower" && r.netDiv >= 0)) return 0;
  return r.netBound === "lower" ? 1 : 2;
}

/** Nets within 10% of the band's best are "about the same" — only there does confidence reorder rows. */
export const NET_BAND = 0.1;

const confirmedFirst = (r: BossRow): number => (r.confidence === "confirmed" ? 0 : 1);

const sameBand = (head: BossRow, r: BossRow): boolean => Math.abs(head.netDiv - r.netDiv) <= NET_BAND * Math.max(Math.abs(head.netDiv), Math.abs(r.netDiv));

/**
 * One bound group by net, highest first; within a band of near-equal nets a confirmed row leads a
 * single-source one. Value decides: a confirmed +0.05 never outranks a single-source +40.
 */
export function orderByNet(rows: readonly BossRow[]): BossRow[] {
  const sorted = [...rows].sort((a, b) => b.netDiv - a.netDiv);
  const out: BossRow[] = [];
  let band: BossRow[] = [];
  const flush = (): void => {
    out.push(...band.sort((a, b) => confirmedFirst(a) - confirmedFirst(b) || b.netDiv - a.netDiv));
    band = [];
  };
  for (const r of sorted) {
    if (band.length > 0 && !sameBand(band[0]!, r)) flush();
    band.push(r);
  }
  flush();
  return out;
}

/** Mechanics (already heat-ordered by rankFarms) first, then bosses by bound group (netGroup), then net. */
export function buildFarmBoard(mechanics: readonly MechanicInput[], bosses: readonly BossView[], exPerDiv: number): FarmBoardRow[] {
  const rows = bosses.map((b) => bossRow(b, exPerDiv));
  const groups = ([0, 1, 2] as const).map((g) => orderByNet(rows.filter((r) => netGroup(r) === g)));
  return [...mechanics.map(mechanicRow), ...groups.flat()];
}

export const isMechanicRow = (r: FarmBoardRow): r is MechanicRow => r.kind === "mechanic";
export const isBossRow = (r: FarmBoardRow): r is BossRow => r.kind === "boss";
