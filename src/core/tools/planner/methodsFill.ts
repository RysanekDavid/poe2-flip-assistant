import type { AffixSide } from "../craftmoves/catalog";
import { QUALITY_PER_CATALYST_NOTE } from "./catalystTags";
import { attemptsOf, solveChain, useOf } from "./expectation";
import { aimsText, EXALT_TIERS, makeMove, mat, sideOmen, step, targetText, usableTier } from "./methodKit";
import { sources, type SourceId } from "./sources";
import { addOdds, catalysingMultiplier } from "./odds";
import { buildChain, NoAimError, slamScope, stateAt, type AimCache, type Chain, type SlamScope, type SlamVariant } from "./slamChain";
import { aimable, isJunk, openOf, present, removable, SIDES, targetAffix, withAffixes, withLanded, without } from "./state";
import type { LazyEdge, MaterialUse, Method, Move, PlanAffix, PlanCtx, PlanState, StepText } from "./types";
import { whittleEdges } from "./methodsWhittle";
import { slamBound } from "./edgeBounds";

/**
 * Random adds: the Chaos loop (every removable mod a throwaway → every Chaos swaps one) and the
 * side slam-fill (Exalt until the side's targets land; a steered Annulment fixes a miss — solved as
 * an absorbing chain in slamChain.ts because that Annulment can also take a good mod).
 */

/** Junk that stays on the item while the add rolls: each blocks one family of unknown identity. */
function junkBlocking(state: PlanState, sides: readonly AffixSide[]): number {
  return state.affixes.filter((a) => isJunk(a) && a.kind !== "desecrated" && (a.side === "any" ? sides.length === 2 : sides.includes(a.side))).length;
}

/**
 * The loose mods a Chaos loop may roll over: every removable mod is junk. Two or more must be plain
 * throwaways on one side (or all of unknown side) so the item after any removal is the same
 * abstract item — mixed sides would change which side the new mod can land on.
 */
function chaosLoose(state: PlanState): PlanAffix[] | null {
  const loose = removable(state);
  if (state.rarity !== "Rare" || loose.length === 0 || !loose.every(isJunk)) return null;
  if (loose.length === 1) return loose;
  const plain = loose.every((a) => a.kind === "explicit" && a.special == null && !a.unrevealed);
  return plain && new Set(loose.map((a) => a.side)).size === 1 ? loose : null;
}

function chaosLoop(state: PlanState, ctx: PlanCtx): Move[] {
  const loose = chaosLoose(state);
  if (!loose) return [];
  // each Chaos removes one throwaway: the rest stay and block a family each (junkBlocking counts them)
  const after = withAffixes(state, without(state, loose[0]!));
  const fractured = state.affixes.some((a) => a.kind === "fractured");
  const immune = fractured ? "; the fractured mod is immune" : "";
  const why =
    loose.length === 1
      ? `A Chaos Orb removes one random mod and adds one. The loose mod is the only removable one${immune} — each Chaos swaps exactly it and rolls a fresh mod.`
      : `A Chaos Orb removes one random mod and adds one. Every loose mod is a throwaway${immune} — each Chaos swaps one and rolls a fresh mod.`;
  const out: Move[] = [];
  for (const t of ctx.targets) {
    if (t.source !== "natural" || !aimable(ctx, state, t) || openOf(ctx, after, t.side) < 1) continue;
    const sides = SIDES.filter((s) => openOf(ctx, after, s) > 0);
    const odds = addOdds(ctx, after, { sides, floor: null, catalyst: null, quality: 0, junkAfter: junkBlocking(after, sides) }, [t.idx]);
    if ((odds.p.get(t.idx) ?? 0) <= 0) continue;
    const e = odds.estimate(t.idx);
    const move = makeMove(ctx, {
      methodId: "chaos-loop",
      title: targetText(t.text),
      next: withLanded(ctx, after, t.idx, "explicit"),
      steps: [
        step({
          do: `Chaos Orb until ${targetText(t.text)}.`,
          why,
          sources: sources("kb-currency", ...(fractured ? (["kb-fracture"] as SourceId[]) : [])),
          mats: [mat("chaos")],
          check: `${targetText(t.text)} (or a better tier) is on the item.`,
        }),
      ],
      uses: [useOf(mat("chaos"), attemptsOf(e))],
      odds: e,
      grade: "vp",
      adds: true,
      checks: [{ state, rules: ["chaos"] }],
    });
    if (move) out.push(move);
  }
  return out;
}

/**
 * Side-steered Chaos loop: the side's only removable mod is a throwaway and the other side is full,
 * so Erasure + Chaos removes exactly it and the new mod can only land on this side (KB §1, §4).
 */
function erasureLoop(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Rare" || state.affixes.some((a) => a.side === "any")) return [];
  const out: Move[] = [];
  for (const t of ctx.targets) {
    const loose = removable(state).filter((a) => a.side === t.side);
    if (t.source !== "natural" || !aimable(ctx, state, t) || loose.length !== 1 || !isJunk(loose[0]!) || loose[0]!.special) continue;
    if (openOf(ctx, state, t.side === "prefix" ? "suffix" : "prefix") > 0) continue;
    const after = withAffixes(state, without(state, loose[0]!));
    const odds = addOdds(ctx, after, { sides: [t.side], floor: null, catalyst: null, quality: 0, junkAfter: junkBlocking(after, [t.side]) }, [t.idx]);
    if ((odds.p.get(t.idx) ?? 0) <= 0) continue;
    const e = odds.estimate(t.idx);
    const omen = sideOmen(t.side, "Erasure");
    const move = makeMove(ctx, {
      methodId: `erasure-loop-${t.side}`,
      title: targetText(t.text),
      next: withLanded(ctx, after, t.idx, "explicit"),
      steps: [
        step({
          do: `${mat(omen.key).label} + Chaos Orb until ${targetText(t.text)}.`,
          why: `The omen makes the Chaos remove a ${t.side} — the throwaway is the only removable one — and only ${t.side} slots are open, so the new mod lands there too.`,
          sources: sources("kb-omens", "kb-currency"),
          mats: [mat(omen.key), mat("chaos")],
          check: `${targetText(t.text)} (or a better tier) is on the item.`,
        }),
      ],
      uses: [useOf(mat(omen.key), attemptsOf(e)), useOf(mat("chaos"), attemptsOf(e))],
      odds: e,
      grade: "vp",
      adds: true,
      checks: [{ state, rules: [omen.rule] }],
    });
    if (move) out.push(move);
  }
  return out;
}

/** Expected material use of the chain with its band (×2 / ×½ every hit chance). */
function chainUses(state: PlanState, ctx: PlanCtx, scope: SlamScope, v: SlamVariant, point: Chain, aims: AimCache): MaterialUse[] {
  const start = `${scope.missing0}:${scope.j0}`;
  const cheap = buildChain(state, ctx, scope, v, 2, aims);
  const dear = buildChain(state, ctx, scope, v, 0.5, aims);
  const mats = new Map<string, MaterialUse["mat"]>();
  for (const c of [point, cheap, dear]) {
    for (const n of c.nodes) for (const id of Object.keys(n.cost)) mats.set(id, materialById(id, c));
  }
  const ids = [...mats.keys()];
  const [p, lo, hi] = [point, cheap, dear].map((c) => solveChain(c.nodes, start, ids));
  return ids.map((id) => useOf(mats.get(id)!, { point: p![id]!, low: lo![id]!, high: hi![id]! }));
}

function materialById(id: string, chain: Chain): MaterialUse["mat"] {
  const cat = chain.catalysts.find((c) => c.mat.id === id);
  if (cat) return cat.mat;
  const keys = ["exalted", "greaterExalted", "perfectExalted", "annul", "omenCatalysingExaltation", "omenSinistralExaltation", "omenDextralExaltation", "omenSinistralAnnulment", "omenDextralAnnulment"] as const;
  const key = keys.find((k) => mat(k).id === id);
  if (!key) throw new Error(`planner bug: unknown chain material ${id}`);
  return mat(key);
}

function slamSteps(ctx: PlanCtx, scope: SlamScope, v: SlamVariant, chain: Chain): StepText[] {
  const side = scope.side;
  const wanted = aimsText(scope.chain.filter((t, i) => (scope.missing0 >> i) & 1).map((t) => t.text));
  const cap = ctx.base.qualityCap ?? 0;
  const omen = scope.steerExalt ? `${mat(sideOmen(side, "Exaltation").key).label} + ` : "";
  const cata = v.catalysing ? `${mat("omenCatalysingExaltation").label} + ` : "";
  const out: StepText[] = [];
  if (v.catalysing) {
    const which = chain.catalysts.map((c) => c.mat.label).join(" / ");
    out.push(step({
      do: `${which} → quality to ${cap}% (the catalyst of the mod you aim at).`,
      why: `Catalysing Exaltation consumes ALL catalyst quality for a ×${catalysingMultiplier(cap)} bias toward the catalyst's mods — re-catalyse before every slam. ${QUALITY_PER_CATALYST_NOTE}`,
      sources: sources("kb-omens", "kb-catalysts", "creators"),
      mats: chain.catalysts.map((c) => c.mat),
    }));
  }
  out.push(step({
    do: `${omen}${cata}${v.tier.label} → a ${side}, until ${wanted.join(" and ")}.`,
    why: `${scope.steerExalt ? `The omen forces a ${side}` : `Only ${side} slots are open, so the mod lands there`}${v.tier.floor ? `; the ${v.tier.floor} floor keeps lower tiers out` : ""}.`,
    sources: sources(...(scope.steerExalt ? (["kb-omens"] as SourceId[]) : []), ...(v.tier.floor ? (["kb-currency"] as SourceId[]) : [])),
    mats: [...(v.catalysing ? [mat("omenCatalysingExaltation")] : []), ...(scope.steerExalt ? [mat(sideOmen(side, "Exaltation").key)] : []), mat(v.tier.key)],
    check: `${wanted.join(" and ")} on the item.`,
  }));
  if (chain.annuls) {
    const steer = scope.steerAnnul ? `${mat(sideOmen(side, "Annulment").key).label} + ` : "";
    out.push(step({
      do: `A ${side} you don't want → ${steer}Orb of Annulment, then slam again.`,
      why: `The Annulment removes a random ${side}${scope.steerAnnul ? ` (the omen keeps it off the ${side === "prefix" ? "suffixes" : "prefixes"})` : ""} — it can also take a good one; that re-slam is in the cost.`,
      sources: sources(...(scope.steerAnnul ? (["kb-omens"] as SourceId[]) : [])),
      mats: [...(scope.steerAnnul ? [mat(sideOmen(side, "Annulment").key)] : []), mat("annul")],
      onFail: "Back to the slam.",
      retry: "self",
    }));
  }
  return out;
}

function slamMove(state: PlanState, ctx: PlanCtx, scope: SlamScope, v: SlamVariant, aims: AimCache): Move | null {
  let chain: Chain;
  try {
    chain = buildChain(state, ctx, scope, v, 1, aims);
  } catch (e: unknown) {
    if (e instanceof NoAimError) return null;
    throw e;
  }
  const start = stateAt(ctx, state, scope, scope.missing0, scope.j0);
  const quality = ctx.base.qualityCap ?? 0;
  const firstRule = scope.steerExalt ? sideOmen(scope.side, "Exaltation").rule : v.tier.rule;
  const checks = [{ state: start, rules: [firstRule, v.tier.rule] }];
  if (v.catalysing) {
    checks.push({ state: { ...start, quality: 0, catalyst: null }, rules: ["catalyst"] });
    checks.push({ state: { ...start, quality, catalyst: chain.first.catalyst?.mat.id ?? null }, rules: ["omen-catalysing-exaltation"] });
  }
  if (chain.annuls) {
    const full = stateAt(ctx, state, scope, scope.missing0, scope.j0 + countBits(scope.missing0));
    checks.push({ state: full, rules: [scope.steerAnnul ? sideOmen(scope.side, "Annulment").rule : "annul"] });
  }
  return makeMove(ctx, {
    methodId: slamId(scope, v),
    title: `${scope.side === "prefix" ? "Prefix" : "Suffix"} slams`,
    next: slamNext(state, ctx, scope, v),
    steps: slamSteps(ctx, scope, v, chain),
    uses: chainUses(state, ctx, scope, v, chain, aims),
    odds: chain.first.est,
    grade: "vp",
    adds: true,
    facts: v.catalysing ? ["Which mods a catalyst favours is our reading of the catalyst's text.", QUALITY_PER_CATALYST_NOTE] : [],
    checks,
    undoRisk: chain.undoes,
  });
}

const countBits = (mask: number): number => mask.toString(2).replace(/0/g, "").length;

const slamId = (scope: SlamScope, v: SlamVariant): string => `slam-${scope.side}-${v.tier.rule}${v.catalysing ? "-catalysing" : ""}`;

/** Every chain target landed; Catalysing Exaltation consumes ALL catalyst quality (KB §4): a quality goal must come after. */
function slamNext(state: PlanState, ctx: PlanCtx, scope: SlamScope, v: SlamVariant): PlanState {
  const done = stateAt(ctx, state, scope, 0, scope.j0);
  return v.catalysing ? { ...done, quality: 0, catalyst: null } : done;
}

/** One edge per side × usable Exalt tier × catalysing; the variant's chain is built only on demand. */
function slamEdges(state: PlanState, ctx: PlanCtx): LazyEdge[] {
  const out: LazyEdge[] = [];
  for (const side of SIDES) {
    const scope = slamScope(state, ctx, side);
    if (!scope) continue;
    for (const tier of EXALT_TIERS.filter((t) => usableTier(ctx, t))) {
      for (const catalysing of [false, true]) {
        if (catalysing && (ctx.base.qualityCap == null || scope.steerExalt)) continue;
        const v = { tier, catalysing };
        // the bound and the build share the variant's aims: a built edge pays for them once
        const aims: AimCache = new Map();
        out.push({ methodId: slamId(scope, v), next: slamNext(state, ctx, scope, v), bound: slamBound(state, ctx, scope, v, aims), build: () => slamMove(state, ctx, scope, v, aims) });
      }
    }
  }
  return out;
}

const built = (edges: (state: PlanState, ctx: PlanCtx) => LazyEdge[]) => (state: PlanState, ctx: PlanCtx): Move[] =>
  edges(state, ctx).flatMap((e) => e.build() ?? []);

export const FILL_METHODS: readonly Method[] = [
  { id: "chaos-loop", order: 30, moves: chaosLoop },
  { id: "erasure-loop", order: 31, moves: erasureLoop },
  { id: "whittle-loop", order: 32, moves: built(whittleEdges), lazy: whittleEdges },
  { id: "slam-fill", order: 70, moves: built(slamEdges), lazy: slamEdges },
];
