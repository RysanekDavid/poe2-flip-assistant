import type { AffixSide } from "../craftmoves/catalog";
import type { ChainNode } from "./expectation";
import type { MaterialKey } from "../../craftMaterials";
import { mat, sideOmen } from "./methodKit";
import { addLevelOutcomes, addOdds } from "./odds";
import { isJunk, junk, openOf, removable, SIDES, stateKey, targetAffix, withAffixes } from "./state";
import type { PlanAffix, PlanCtx, PlanState, ResolvedTarget } from "./types";

/**
 * The whittle loop's retry chain. Every attempt is Omen of Whittling + Chaos Orb: the Chaos removes
 * the LOWEST-LEVEL removable mod (ties: each tied mod equally likely — owner-tested that every tied
 * mod "may be removed"; the even split is our assumption), then adds one random mod on a side with
 * room. The loop starts with the landed targets plus ONE throwaway; a throwaway that rolls at or
 * above a kept mod's level makes the next Whittle take that mod, which the loop must then win back.
 *
 * Node = (mask of chain targets missing, the throwaways on the item). A throwaway is kept as its side
 * and its level BUCKET relative to the known levels (below the lowest, equal to one, between two,
 * above all) — the only thing the removal rule reads. A Chaos removes one mod and adds one, so the
 * throwaways always number exactly the missing chain targets; the chain ends when none is missing.
 * Kept targets are assumed at their minimum tier's level (a better tier only sits higher — safer).
 */

/** Past this many nodes the chain is not offered (it means kept mods keep getting whittled away). */
export const MAX_WHITTLE_NODES = 300;

export interface WhittleScope {
  target: ResolvedTarget;
  /** Removable natural targets on the item plus the one the loop is for (bit i = chain[i]). */
  chain: readonly ResolvedTarget[];
  /** Removable targets the loop could NOT win back (essence / desecrated writes). */
  fixed: ReadonlyArray<{ level: number; side: AffixSide }>;
  /** Sorted distinct levels of every chain target and fixed mod: the bucket boundaries. */
  levels: readonly number[];
  /** The item without the chain targets and without the throwaway. */
  rest: readonly PlanAffix[];
  junkSide: AffixSide;
  missing0: number;
}

/** The loop can't be modelled here (a write it can't win back would go, or the chain is too large). */
export class WhittleOutOfScopeError extends Error {
  constructor(reason: string) {
    super(`whittle loop out of scope: ${reason}`);
    this.name = "WhittleOutOfScopeError";
  }
}

const isChainTarget = (ctx: PlanCtx, a: PlanAffix): boolean => a.target != null && a.kind === "explicit" && !a.unrevealed && ctx.targets[a.target]!.source === "natural";

/** Null unless the item is rare, its removable mods are kept targets + exactly one plain throwaway, and t can land after it goes. */
export function whittleScope(state: PlanState, ctx: PlanCtx, t: ResolvedTarget): WhittleScope | null {
  if (state.rarity !== "Rare" || t.source !== "natural" || state.affixes.some((a) => a.target === t.idx || a.side === "any")) return null;
  const loose = removable(state);
  const junks = loose.filter(isJunk);
  const kept = loose.filter((a) => !isJunk(a));
  const j = junks[0];
  if (junks.length !== 1 || !j || j.kind !== "explicit" || j.special != null || j.unrevealed || j.side === "any") return null;
  // an unrevealed mod is level 1 (always whittled first) and specials have no level we know
  if (kept.length === 0 || kept.some((a) => a.unrevealed || a.special != null)) return null;
  const chainKept = kept.filter((a) => isChainTarget(ctx, a));
  const chain = [...chainKept.map((a) => ctx.targets[a.target!]!), t];
  const fixed = kept.filter((a) => !isChainTarget(ctx, a)).map((a) => ({ level: ctx.targets[a.target!]!.level, side: ctx.targets[a.target!]!.side }));
  const rest = state.affixes.filter((a) => a !== j && !chainKept.includes(a));
  const after = withAffixes(state, [...rest, ...chainKept]);
  if (openOf(ctx, after, t.side) < 1) return null;
  // t's own level too: once it lands, a later Whittle compares it like any kept mod
  const levels = [...new Set([...chain.map((c) => c.level), ...fixed.map((f) => f.level)])].sort((a, b) => a - b);
  return { target: t, chain, fixed, levels, rest, junkSide: j.side, missing0: 1 << (chain.length - 1) };
}

/** Even = strictly between known levels (0 = below all), odd = equal to levels[(b − 1) / 2]. */
export function bucketOf(levels: readonly number[], level: number): number {
  for (let k = 0; k < levels.length; k++) {
    if (level < levels[k]!) return 2 * k;
    if (level === levels[k]) return 2 * k + 1;
  }
  return 2 * levels.length;
}

type JunkCode = string;
const code = (side: AffixSide, bucket: number): JunkCode => `${side[0]}${bucket}`;
const sideOfCode = (c: JunkCode): AffixSide => (c[0] === "p" ? "prefix" : "suffix");
const bucketOfCode = (c: JunkCode): number => Number(c.slice(1));
// throwaway lists are kept sorted, so a node's id is a plain join (it is computed a lot)
const nodeId = (mask: number, junks: readonly JunkCode[]): string => `${mask}|${junks.join(",")}`;
const withJunk = (junks: readonly JunkCode[], c: JunkCode): JunkCode[] => [...junks, c].sort();

/** The item at node (mask, junks). */
export function whittleStateAt(base: PlanState, scope: WhittleScope, mask: number, junks: readonly JunkCode[]): PlanState {
  const landed = scope.chain.filter((_, i) => !((mask >> i) & 1)).map((c) => targetAffix(c.side, c.idx, "explicit"));
  return withAffixes(base, [...scope.rest, ...landed, ...junks.map((c) => junk(sideOfCode(c)))]);
}

/** One Chaos add, before the band: prior hit chance per missing chain index, and the throwaway mix (shares sum to 1). */
export interface AddShape {
  hits: Map<number, number>;
  junk: Map<JunkCode, number>;
}

// one search meets the same item under many loops (≈10 lookups per distinct shape on the owner's
// ring); the shape depends only on the item, the chain (its hits are keyed by chain position), the
// missing mask and the level buckets
const SHAPES = new WeakMap<PlanCtx, Map<string, AddShape>>();

/** addShape, remembered for the lifetime of the planner context. */
export function cachedAddShape(ctx: PlanCtx, scope: WhittleScope, item: PlanState, mask: number): AddShape {
  let byKey = SHAPES.get(ctx);
  if (!byKey) SHAPES.set(ctx, (byKey = new Map()));
  const key = `${stateKey(item)}#${scope.chain.map((c) => c.idx).join(",")}#${mask}#${scope.levels.join(",")}`;
  let shape = byKey.get(key);
  if (!shape) byKey.set(key, (shape = addShape(ctx, scope, item, mask)));
  return shape;
}

/** The add on `item` under the same pool and prior as every other Chaos add (addOdds). */
export function addShape(ctx: PlanCtx, scope: WhittleScope, item: PlanState, mask: number): AddShape {
  const sides = SIDES.filter((s) => openOf(ctx, item, s) > 0);
  const missing = scope.chain.map((c, i) => ({ c, i })).filter(({ i }) => (mask >> i) & 1);
  const junkAfter = item.affixes.filter((a) => isJunk(a) && a.side !== "any" && sides.includes(a.side)).length;
  const odds = addOdds(ctx, item, { sides, floor: null, catalyst: null, quality: 0, junkAfter }, missing.map(({ c }) => c.idx));
  const hits = new Map(missing.filter(({ c }) => (odds.p.get(c.idx) ?? 0) > 0).map(({ c, i }) => [i, odds.p.get(c.idx)!] as const));
  const outcomes = addLevelOutcomes(ctx, item, sides).filter((o) => !missing.some(({ c }) => c.side === o.side && c.family === o.family && o.level >= c.level));
  const junkTotal = outcomes.reduce((a, o) => a + o.p, 0);
  const junk = new Map<JunkCode, number>();
  for (const o of outcomes) {
    const c = code(o.side, bucketOf(scope.levels, o.level));
    junk.set(c, (junk.get(c) ?? 0) + o.p / junkTotal);
  }
  return { hits, junk };
}

/** The add's probabilities with every hit chance ×scale (clamped); the throwaways take what is left. */
export function scaledAdd(shape: AddShape, scale: number): AddShape {
  const raw = [...shape.hits].map(([i, p]) => [i, Math.min(1, p * scale)] as const);
  const total = raw.reduce((a, [, p]) => a + p, 0);
  // hits fill the whole add when the pool holds nothing else (or the band pushes them past 1)
  const norm = total > 1 || (shape.junk.size === 0 && total > 0) ? 1 / total : 1;
  const junkMass = 1 - total * norm;
  const junk = new Map<JunkCode, number>();
  if (junkMass > 1e-12) for (const [c, share] of shape.junk) junk.set(c, junkMass * share);
  return { hits: new Map(raw.map(([i, p]) => [i, p * norm])), junk };
}

type Removal = { p: number; mask: number; junks: JunkCode[]; undo: boolean };

/** Whittling's removal at a node: the lowest bucket goes; every mod tied there is equally likely. Null = a fixed mod could go. */
function whittleRemovals(scope: WhittleScope, mask: number, junks: readonly JunkCode[]): Removal[] | null {
  const kept = scope.chain.map((c, i) => ({ i, b: bucketOf(scope.levels, c.level) })).filter(({ i }) => !((mask >> i) & 1));
  const fixedB = scope.fixed.map((f) => bucketOf(scope.levels, f.level));
  const low = Math.min(...kept.map((k) => k.b), ...fixedB, ...junks.map(bucketOfCode));
  if (fixedB.includes(low)) return null;
  const tiedKept = kept.filter((k) => k.b === low);
  const tiedJunk = junks.map((c, k) => ({ c, k })).filter(({ c }) => bucketOfCode(c) === low);
  const n = tiedKept.length + tiedJunk.length;
  return [
    ...tiedKept.map((k) => ({ p: 1 / n, mask: mask | (1 << k.i), junks: [...junks], undo: true })),
    ...tiedJunk.map(({ k }) => ({ p: 1 / n, mask, junks: junks.filter((_, x) => x !== k), undo: false })),
  ];
}

/** A side whose removable mods are all throwaways: Erasure + Chaos there removes one of them, never a kept mod. */
function exactErasureSide(scope: WhittleScope, mask: number, junks: readonly JunkCode[]): AffixSide | null {
  for (const side of SIDES) {
    if (!junks.some((c) => sideOfCode(c) === side)) continue;
    const keptHere = scope.chain.some((c, i) => !((mask >> i) & 1) && c.side === side) || scope.fixed.some((f) => f.side === side);
    if (!keptHere) return side;
  }
  return null;
}

function erasureRemovals(side: AffixSide, mask: number, junks: readonly JunkCode[]): Removal[] {
  const on = junks.map((c, k) => ({ c, k })).filter(({ c }) => sideOfCode(c) === side);
  return on.map(({ k }) => ({ p: 1 / on.length, mask, junks: junks.filter((_, x) => x !== k), undo: false }));
}

const noDearer = (ctx: PlanCtx, a: MaterialKey, b: MaterialKey): boolean => {
  const pa = ctx.priceOf(mat(a).id);
  const pb = ctx.priceOf(mat(b).id);
  return pa != null && (pb == null || pa <= pb);
};

export type WhittleAction = { kind: "whittle" } | { kind: "erasure"; side: AffixSide };

/**
 * What a player holding both omens clicks: Erasure + Chaos when it can only take a throwaway and it
 * is no dearer, or when the Whittle preview would put a kept mod at risk; Whittling otherwise. That
 * Erasure also clears a throwaway that rolled ABOVE every kept mod, which Whittling never would.
 */
function actionAt(ctx: PlanCtx, scope: WhittleScope, mask: number, junks: readonly JunkCode[]): { action: WhittleAction; rs: Removal[] } {
  const side = exactErasureSide(scope, mask, junks);
  const whittled = whittleRemovals(scope, mask, junks);
  if (side && (!whittled || whittled.some((r) => r.undo) || noDearer(ctx, sideOmen(side, "Erasure").key, "omenWhittling"))) {
    return { action: { kind: "erasure", side }, rs: erasureRemovals(side, mask, junks) };
  }
  if (!whittled) throw new WhittleOutOfScopeError("a mod the loop can't win back would be whittled");
  return { action: { kind: "whittle" }, rs: whittled };
}


interface GraphStep {
  /** P(this removal) at the node. */
  p: number;
  mask: number;
  junks: JunkCode[];
  shape: AddShape;
  /** Node id a hit on chain index i / a throwaway with code c leads to. */
  hitTo: Map<number, string>;
  junkTo: Map<JunkCode, string>;
}

interface GraphNode {
  id: string;
  /** Throwaways on the item (the solver's elimination order). */
  depth: number;
  terminal: boolean;
  cost: Record<string, number>;
  steps: GraphStep[];
}

/** The chain's item states and clicks, built once; chainAt prices them for one end of the band. */
export interface WhittleGraph {
  nodes: GraphNode[];
  start: ChainNode;
  /** Some Whittle in the chain can take a target that already landed. */
  undoes: boolean;
  /** Some Whittle is a tie between a kept target and other mods (the even-split assumption matters). */
  ties: boolean;
  whittles: boolean;
  /** Erasure assists by side, each with an item it is clicked on (for the legality check). */
  erasures: Map<AffixSide, PlanState>;
}

type ShapeOf = (mask: number, junks: readonly JunkCode[]) => AddShape;

function attemptNode(ctx: PlanCtx, scope: WhittleScope, mask: number, junks: JunkCode[], shapeOf: ShapeOf): { node: GraphNode; action: WhittleAction; undoes: boolean } {
  const { action, rs } = actionAt(ctx, scope, mask, junks);
  const omen = action.kind === "whittle" ? mat("omenWhittling") : mat(sideOmen(action.side, "Erasure").key);
  const steps = rs.map((r): GraphStep => {
    const shape = shapeOf(r.mask, r.junks);
    const hitTo = new Map([...shape.hits.keys()].map((i) => [i, nodeId(r.mask & ~(1 << i), r.junks)] as const));
    const junkTo = new Map([...shape.junk.keys()].map((c) => [c, nodeId(r.mask, withJunk(r.junks, c))] as const));
    return { p: r.p, mask: r.mask, junks: r.junks, shape, hitTo, junkTo };
  });
  const node = { id: nodeId(mask, junks), depth: junks.length, terminal: false, cost: { [omen.id]: 1, [mat("chaos").id]: 1 }, steps };
  return { node, action, undoes: rs.some((r) => r.undo) };
}

type Pending = { id: string; mask: number; junks: JunkCode[] };

/** Every state an add can lead to (hits and throwaways alike, whatever the band). */
function successors(s: GraphStep): Pending[] {
  return [
    ...[...s.hitTo].map(([i, id]) => ({ id, mask: s.mask & ~(1 << i), junks: s.junks })),
    ...[...s.junkTo].map(([c, id]) => ({ id, mask: s.mask, junks: withJunk(s.junks, c) })),
  ];
}

/** The throwaway already on the item: its level is unknown, so it is drawn like any Chaos add on its side. */
function startNode(scope: WhittleScope, shapeOf: ShapeOf): ChainNode {
  const onSide = [...shapeOf(scope.missing0, []).junk].filter(([c]) => sideOfCode(c) === scope.junkSide);
  const total = onSide.reduce((a, [, p]) => a + p, 0);
  if (total <= 0) throw new WhittleOutOfScopeError("no throwaway can sit on that side");
  return { id: "start", terminal: false, cost: {}, edges: onSide.map(([c, p]) => ({ to: nodeId(scope.missing0, [c]), p: p / total })) };
}

export function buildWhittleGraph(base: PlanState, ctx: PlanCtx, scope: WhittleScope): WhittleGraph {
  const local = new Map<string, AddShape>();
  const shapeOf: ShapeOf = (mask, junks) => {
    const id = nodeId(mask, junks);
    let shape = local.get(id);
    if (!shape) local.set(id, (shape = cachedAddShape(ctx, scope, whittleStateAt(base, scope, mask, junks), mask)));
    return shape;
  };
  const start = startNode(scope, shapeOf);
  const g: WhittleGraph = { nodes: [], start, undoes: false, ties: false, whittles: false, erasures: new Map() };
  const queue: Pending[] = start.edges.map((e) => ({ id: e.to, mask: scope.missing0, junks: e.to.split("|")[1]!.split(",") }));
  const seen = new Set<string>(queue.map((q) => q.id));
  for (let at = 0; at < queue.length; at++) {
    const { id, mask, junks } = queue[at]!;
    if (seen.size > MAX_WHITTLE_NODES) throw new WhittleOutOfScopeError(`more than ${MAX_WHITTLE_NODES} item states`);
    if (mask === 0) {
      g.nodes.push({ id, depth: 0, terminal: true, cost: {}, steps: [] });
      continue;
    }
    const built = attemptNode(ctx, scope, mask, junks, shapeOf);
    g.undoes ||= built.undoes;
    g.ties ||= built.undoes && built.node.steps.length > 1;
    if (built.action.kind === "whittle") g.whittles = true;
    else if (!g.erasures.has(built.action.side)) g.erasures.set(built.action.side, whittleStateAt(base, scope, mask, junks));
    g.nodes.push(built.node);
    for (const next of built.node.steps.flatMap(successors)) {
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      queue.push(next);
    }
  }
  return g;
}

/** Every node must be able to finish, or the expectation is infinite (solveChain would be singular). */
function assertAbsorbing(nodes: readonly ChainNode[]): void {
  const into = new Map<string, string[]>();
  for (const n of nodes) {
    for (const e of n.edges) {
      if (e.p <= 0) continue;
      const list = into.get(e.to);
      if (list) list.push(n.id);
      else into.set(e.to, [n.id]);
    }
  }
  const done = new Set(nodes.filter((n) => n.terminal).map((n) => n.id));
  const queue = [...done];
  while (queue.length > 0) {
    for (const from of into.get(queue.pop()!) ?? []) {
      if (!done.has(from)) {
        done.add(from);
        queue.push(from);
      }
    }
  }
  if (done.size < nodes.length) throw new WhittleOutOfScopeError("some throwaway can never be whittled away");
}

/** The chain with every hit chance ×scale: 1 = the prior, 2 / 0.5 = the cheap / dear end of the band. */
export function chainAt(g: WhittleGraph, scale: number): ChainNode[] {
  const scaled = new Map<AddShape, AddShape>();
  // eliminate the rare many-throwaway states first and the busy few-throwaway ones last: far less
  // fill-in for the solver than discovery order (same answer, a fraction of the work)
  const ordered = [...g.nodes].sort((x, y) => y.depth - x.depth);
  const nodes: ChainNode[] = ordered.map((n) => {
    const edges: ChainNode["edges"] = [];
    for (const s of n.steps) {
      let add = scaled.get(s.shape);
      if (!add) scaled.set(s.shape, (add = scaledAdd(s.shape, scale)));
      for (const [i, p] of add.hits) edges.push({ to: s.hitTo.get(i)!, p: s.p * p });
      for (const [c, p] of add.junk) edges.push({ to: s.junkTo.get(c)!, p: s.p * p });
    }
    return { id: n.id, terminal: n.terminal, cost: n.cost, edges };
  });
  nodes.push(g.start);
  assertAbsorbing(nodes);
  return nodes;
}
