import type { AffixSide } from "../craftmoves/catalog";
import { catalystFor, QUALITY_PER_CATALYST, type CatalystInfo } from "./catalystTags";
import type { ChainNode } from "./expectation";
import { mat, sideOmen, type CurrencyTier } from "./methodKit";
import { addOdds } from "./odds";
import { anyJunkCount, isJunk, junk, openOf, otherSide, present, removable, targetAffix, withAffixes } from "./state";
import type { Estimate, PlanAffix, PlanCtx, PlanState, ResolvedTarget } from "./types";

/**
 * The slam-fill retry chain for one side. Node (mask, j): `mask` = which chain targets are missing,
 * `j` = junk mods on the side (j0 at the start). At j = j0 the node slams (Exalt); a miss adds a
 * junk mod and the next node annuls it (a steered Annulment picks uniformly among the side's
 * removable mods — the junk OR a placed target, which then goes back to missing). Terminal: nothing
 * missing. Every non-target slot starts full, so the chain always ends with the starting junk.
 */

export interface SlamScope {
  side: AffixSide;
  /** Every natural target of the side the chain may place or lose. */
  chain: readonly ResolvedTarget[];
  missing0: number;
  j0: number;
  steerExalt: boolean;
  steerAnnul: boolean;
}

export interface SlamVariant {
  tier: CurrencyTier;
  catalysing: boolean;
}

export const bits = (mask: number, n: number): number[] => [...Array(n).keys()].filter((i) => (mask >> i) & 1);

const okOnSide = (ctx: PlanCtx, a: PlanAffix): boolean => isJunk(a) || (ctx.targets[a.target!]!.source === "natural" && a.kind === "explicit");

/** Null unless the side's removable mods are all junk or natural targets and its open slots = its missing targets. */
export function slamScope(state: PlanState, ctx: PlanCtx, side: AffixSide): SlamScope | null {
  if (state.rarity !== "Rare" || anyJunkCount(state) > 0) return null;
  const onSide = removable(state).filter((a) => a.side === side);
  if (!onSide.every((a) => okOnSide(ctx, a))) return null;
  const chain = ctx.targets.filter((t) => {
    const a = present(state, t.idx);
    return t.source === "natural" && t.side === side && (!a || onSide.includes(a));
  });
  let missing0 = 0;
  chain.forEach((t, i) => {
    if (!present(state, t.idx)) missing0 |= 1 << i;
  });
  const missing = bits(missing0, chain.length).length;
  if (missing === 0 || openOf(ctx, state, side) !== missing) return null;
  const other = otherSide(side);
  return {
    side,
    chain,
    missing0,
    j0: onSide.filter(isJunk).length,
    steerExalt: openOf(ctx, state, other) > 0,
    steerAnnul: removable(state).some((a) => a.side === other),
  };
}

/** The item at chain node (mask, j). */
export function stateAt(state: PlanState, scope: SlamScope, mask: number, j: number): PlanState {
  const keep = state.affixes.filter((a) => a.side !== scope.side || a.kind === "fractured" || (a.target != null && !scope.chain.some((t) => t.idx === a.target)));
  const placed = scope.chain.filter((_, i) => !((mask >> i) & 1)).map((t) => targetAffix(scope.side, t.idx, "explicit"));
  return withAffixes(state, [...keep, ...placed, ...Array.from({ length: j }, () => junk(scope.side))]);
}

interface Aim {
  p: Map<number, number>;
  catalyst: CatalystInfo | null;
  est: Estimate;
}

/** Aim at the missing target with the best odds under its own catalyst (ties: lowest index). */
function aimOf(ctx: PlanCtx, scope: SlamScope, mask: number, j: number, v: SlamVariant, at: PlanState): Aim {
  const idx = bits(mask, scope.chain.length).map((i) => scope.chain[i]!.idx);
  const quality = ctx.base.qualityCap ?? 0;
  // the side's junk (fractured anchor included) blocks one family of unknown identity each
  const junkAfter = at.affixes.filter((a) => a.side === scope.side && isJunk(a) && a.kind !== "desecrated").length;
  let best: { aim: Aim; p: number } | null = null;
  for (const id of idx) {
    const catalyst = v.catalysing ? catalystFor(ctx.targets[id]!.tags) : null;
    if (v.catalysing && !catalyst) continue;
    const odds = addOdds(ctx, at, { sides: [scope.side], floor: v.tier.floor, catalyst, quality, junkAfter }, idx);
    const p = odds.p.get(id) ?? 0;
    if (p > 0 && (!best || p > best.p)) best = { aim: { p: odds.p, catalyst, est: odds.estimate(id) }, p };
  }
  if (!best) throw new NoAimError();
  return best.aim;
}

/** No missing target is reachable with this variant (e.g. catalysing with no matching catalyst). */
export class NoAimError extends Error {
  constructor() {
    super("no reachable target for this slam variant");
    this.name = "NoAimError";
  }
}

const nodeId = (mask: number, j: number): string => `${mask}:${j}`;
const parseId = (id: string): [number, number] => {
  const [m, j] = id.split(":").map(Number);
  return [m!, j!];
};

function slamCost(ctx: PlanCtx, scope: SlamScope, v: SlamVariant, catalyst: CatalystInfo | null): Record<string, number> {
  const cost: Record<string, number> = { [mat(v.tier.key).id]: 1 };
  if (scope.steerExalt) cost[mat(sideOmen(scope.side, "Exaltation").key).id] = 1;
  if (v.catalysing && catalyst) {
    cost[mat("omenCatalysingExaltation").id] = 1;
    cost[catalyst.mat.id] = (ctx.base.qualityCap ?? 0) / QUALITY_PER_CATALYST;
  }
  return cost;
}

/** `scale` multiplies every hit probability: 1 = the prior, 2 / 0.5 = the cheap / dear end of the band. */
function slamNode(state: PlanState, ctx: PlanCtx, scope: SlamScope, v: SlamVariant, mask: number, j: number, scale: number): { node: ChainNode; aim: Aim } {
  const aim = aimOf(ctx, scope, mask, j, v, stateAt(state, scope, mask, j));
  const missing = bits(mask, scope.chain.length);
  const raw = missing.map((i) => Math.min(1, (aim.p.get(scope.chain[i]!.idx) ?? 0) * scale));
  const total = raw.reduce((a, b) => a + b, 0);
  const norm = total > 1 ? 1 / total : 1;
  const edges: ChainNode["edges"] = [];
  missing.forEach((i, k) => {
    if (raw[k]! > 0) edges.push({ to: nodeId(mask & ~(1 << i), j), p: raw[k]! * norm });
  });
  const hit = Math.min(1, total);
  if (hit < 1) edges.push({ to: nodeId(mask, j + 1), p: 1 - hit });
  return { node: { id: nodeId(mask, j), terminal: false, cost: slamCost(ctx, scope, v, aim.catalyst), edges }, aim };
}

function annulNode(scope: SlamScope, mask: number, j: number): ChainNode {
  const placed = scope.chain.map((_, i) => i).filter((i) => !((mask >> i) & 1));
  const n = j + placed.length;
  const edges: ChainNode["edges"] = placed.map((i) => ({ to: nodeId(mask | (1 << i), j), p: 1 / n }));
  if (j > 0) edges.push({ to: nodeId(mask, j - 1), p: j / n });
  const cost: Record<string, number> = { [mat("annul").id]: 1 };
  if (scope.steerAnnul) cost[mat(sideOmen(scope.side, "Annulment").key).id] = 1;
  return { id: nodeId(mask, j), terminal: false, cost, edges };
}

export interface Chain {
  nodes: ChainNode[];
  /** The aim and odds of the very first slam (the macro's headline odds). */
  first: Aim;
  catalysts: CatalystInfo[];
  annuls: boolean;
}

export function buildChain(state: PlanState, ctx: PlanCtx, scope: SlamScope, v: SlamVariant, scale: number): Chain {
  const nodes: ChainNode[] = [];
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [[scope.missing0, scope.j0]];
  const catalysts: CatalystInfo[] = [];
  let first: Aim | null = null;
  let annuls = false;
  while (queue.length > 0) {
    const [mask, j] = queue.shift()!;
    const id = nodeId(mask, j);
    if (seen.has(id)) continue;
    seen.add(id);
    if (mask === 0) {
      nodes.push({ id, terminal: true, cost: {}, edges: [] });
      continue;
    }
    // a miss is annulled at once: while it waits, every slam that lands puts one more good mod in
    // the Annulment's way (and slamming only at j = j0 keeps the end state deterministic)
    if (j === scope.j0) {
      const built = slamNode(state, ctx, scope, v, mask, j, scale);
      first ??= built.aim;
      if (built.aim.catalyst && !catalysts.includes(built.aim.catalyst)) catalysts.push(built.aim.catalyst);
      nodes.push(built.node);
    } else {
      annuls = true;
      nodes.push(annulNode(scope, mask, j));
    }
    for (const e of nodes[nodes.length - 1]!.edges) queue.push(parseId(e.to));
  }
  if (!first) throw new Error("planner bug: slam chain never slams");
  return { nodes, first, catalysts, annuls };
}
