import type { AffixSide } from "../craftmoves/catalog";
import { CATALYSTS, matchesCatalyst, QUALITY_PER_CATALYST, type CatalystInfo } from "./catalystTags";
import type { ChainNode } from "./expectation";
import { mat, sideOmen, type CurrencyTier } from "./methodKit";
import { addOdds } from "./odds";
import { anyJunkCount, isJunk, junk, landAffix, openOf, otherSide, present, removable, stateKey, targetAffix, withAffixes } from "./state";
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

// plain explicit junk only: stateAt re-creates the side's junk, so a desecrated blocker or a Contempt
// mod there would lose its identity (and the chain's Annulment could take it)
const okOnSide = (ctx: PlanCtx, a: PlanAffix): boolean =>
  isJunk(a) ? a.kind === "explicit" && a.special == null && !a.unrevealed : ctx.targets[a.target!]!.source === "natural" && a.kind === "explicit";

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
export function stateAt(ctx: PlanCtx, state: PlanState, scope: SlamScope, mask: number, j: number): PlanState {
  const keep = state.affixes.filter((a) => a.side !== scope.side || a.kind === "fractured" || (a.target != null && !scope.chain.some((t) => t.idx === a.target)));
  const placed = scope.chain.filter((_, i) => !((mask >> i) & 1));
  // a target already on the item keeps the pool candidate it holds; one the chain lands takes the
  // first candidate still possible (landAffix), so the chain and the search agree on the item
  const kept = placed.flatMap((t) => {
    const a = present(state, t.idx);
    return a ? [targetAffix(scope.side, t.idx, "explicit", a.alt)] : [];
  });
  let item = withAffixes(state, [...keep, ...kept]);
  for (const t of placed) if (!present(state, t.idx)) item = withAffixes(item, [...item.affixes, landAffix(ctx, item, t.idx, "explicit")]);
  return withAffixes(item, [...item.affixes, ...Array.from({ length: j }, () => junk(scope.side))]);
}

export interface Aim {
  p: Map<number, number>;
  /** The same odds at the low / high end of the Catalysing multiplier band (= p without a catalyst). */
  pLow: Map<number, number>;
  pHigh: Map<number, number>;
  catalyst: CatalystInfo | null;
  est: Estimate;
}

/**
 * The odds a chain at band scale `scale` multiplies: the prior (1) reads the point multiplier, the
 * cheap end (2) the community model's high one, the dear end (½) the creators' low one, so the
 * quantity band spans both the ×½…×2 prior band and the sources' disagreement on the multiplier.
 */
export function aimOddsAt(aim: Aim, scale: number): ReadonlyMap<number, number> {
  if (scale > 1) return aim.pHigh;
  if (scale < 1) return aim.pLow;
  return aim.p;
}

/**
 * The catalyst for this slam: the one that makes ANY missing target most likely (a Reaver Catalyst
 * favours every "to Attacks" flat at once, where an element catalyst favours one), ties to table
 * order. The headline odds are the best single target's under it (ties: lowest index).
 */
function aimOf(ctx: PlanCtx, scope: SlamScope, mask: number, v: SlamVariant, at: PlanState): Aim {
  const idx = bits(mask, scope.chain.length).map((i) => scope.chain[i]!.idx);
  const quality = ctx.base.qualityCap ?? 0;
  // the side's junk (fractured anchor included) blocks one family of unknown identity each
  const junkAfter = at.affixes.filter((a) => a.side === scope.side && isJunk(a) && a.kind !== "desecrated").length;
  const options = v.catalysing ? CATALYSTS.filter((c) => idx.some((id) => matchesCatalyst(c, ctx.targets[id]!.tags))) : [null];
  let best: { aim: Aim; progress: number } | null = null;
  for (const catalyst of options) {
    const odds = addOdds(ctx, at, { sides: [scope.side], floor: v.tier.floor, catalyst, quality, junkAfter }, idx);
    const progress = idx.reduce((sum, id) => sum + (odds.p.get(id) ?? 0), 0);
    const top = idx.reduce<number | null>((b, id) => ((odds.p.get(id) ?? 0) > (b == null ? 0 : odds.p.get(b)!) ? id : b), null);
    if (top != null && (!best || progress > best.progress)) best = { aim: { p: odds.p, pLow: odds.pLow, pHigh: odds.pHigh, catalyst, est: odds.estimate(top) }, progress };
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

/**
 * Aims by missing mask, shared by one variant's point / cheap / dear chains and its search bound
 * (edgeBounds.ts): a slam node only exists at j = j0, and an aim carries the odds of every band end
 * (aimOddsAt picks one by scale), so it does not depend on the scale it is read at.
 */
export type AimCache = Map<number, Aim>;

// one search meets the same chain node item from many parents (an item one slam further along has
// a subset of this item's nodes); an aim reads only that item, the side, the missing targets and the
// variant (the Catalysing priors are fixed per ctx, and every band end is in the one Aim) — null = no
// missing target is reachable (NoAimError)
const AIMS = new WeakMap<PlanCtx, Map<string, Aim | null>>();

/** The aim of the slam node at `mask` (j = j0); throws NoAimError when no missing target can roll. */
export function aimAt(state: PlanState, ctx: PlanCtx, scope: SlamScope, v: SlamVariant, mask: number, aims: AimCache): Aim {
  const local = aims.get(mask);
  if (local) return local;
  const at = stateAt(ctx, state, scope, mask, scope.j0);
  let byKey = AIMS.get(ctx);
  if (!byKey) AIMS.set(ctx, (byKey = new Map()));
  const idx = bits(mask, scope.chain.length).map((i) => scope.chain[i]!.idx);
  const key = `${stateKey(at)}#${scope.side}#${idx.join(",")}#${v.tier.rule}#${v.catalysing}`;
  let aim = byKey.get(key);
  if (aim === undefined) {
    aim = tryAim(ctx, scope, mask, v, at);
    byKey.set(key, aim);
  }
  if (!aim) throw new NoAimError();
  aims.set(mask, aim);
  return aim;
}

function tryAim(ctx: PlanCtx, scope: SlamScope, mask: number, v: SlamVariant, at: PlanState): Aim | null {
  try {
    return aimOf(ctx, scope, mask, v, at);
  } catch (e: unknown) {
    if (e instanceof NoAimError) return null;
    throw e;
  }
}

/** `scale` multiplies every hit probability (of the band end aimOddsAt picks): 1 = the prior, 2 / 0.5 = the cheap / dear end. */
function slamNode(state: PlanState, ctx: PlanCtx, scope: SlamScope, v: SlamVariant, mask: number, scale: number, aims: AimCache): { node: ChainNode; aim: Aim } {
  const j = scope.j0;
  const aim = aimAt(state, ctx, scope, v, mask, aims);
  const missing = bits(mask, scope.chain.length);
  const odds = aimOddsAt(aim, scale);
  const raw = missing.map((i) => Math.min(1, (odds.get(scope.chain[i]!.idx) ?? 0) * scale));
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
  /** Some Annulment in the chain can remove a target that already landed (progress can be undone). */
  undoes: boolean;
}

export function buildChain(state: PlanState, ctx: PlanCtx, scope: SlamScope, v: SlamVariant, scale: number, aims: AimCache = new Map()): Chain {
  const nodes: ChainNode[] = [];
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [[scope.missing0, scope.j0]];
  const catalysts: CatalystInfo[] = [];
  let first: Aim | null = null;
  let annuls = false;
  let undoes = false;
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
      const built = slamNode(state, ctx, scope, v, mask, scale, aims);
      first ??= built.aim;
      if (built.aim.catalyst && !catalysts.includes(built.aim.catalyst)) catalysts.push(built.aim.catalyst);
      nodes.push(built.node);
    } else {
      annuls = true;
      const node = annulNode(scope, mask, j);
      // an edge back to a node with more missing targets = the Annulment took a landed one
      undoes ||= node.edges.some((e) => parseId(e.to)[0] !== mask);
      nodes.push(node);
    }
    for (const e of nodes[nodes.length - 1]!.edges) queue.push(parseId(e.to));
  }
  if (!first) throw new Error("planner bug: slam chain never slams");
  return { nodes, first, catalysts, annuls, undoes };
}
