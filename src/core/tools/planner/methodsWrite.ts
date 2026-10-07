import { ALL_MATERIALS, type CraftMaterial } from "../../craftMaterials";
import type { AffixSide } from "../craftmoves/catalog";
import { CRYSTALLISATION_ALLOY_FACT } from "./alloyOutcomes";
import { makeMove, mat, once, sideOmen, step, targetText } from "./methodKit";
import { linkSource, sources, type SourceId, type SourceRef } from "./sources";
import { exact } from "./odds";
import { aimable, anyJunkCount, craftedSlotUsed, eligibleAlts, isJunk, modOf, openOf, removable, removableOn, SIDES, targetAffix, withAffixes, without } from "./state";
import type { EssenceWrite, Method, Move, PlanAffix, PlanCtx, PlanState, ResolvedTarget } from "./types";

/**
 * Deterministic writes: Greater essences (magic → rare + guaranteed mod), and Perfect/Corrupted
 * essences and alloys (rare: remove a random mod, write the crafted one) steered by Crystallisation. Owner rule (theory-gaps T3, in game 2026-10-02): a Greater
 * essence whose family is already on the item fails ("already has a mod of this type") — never
 * planned then. A pool slot is written by the essence of any candidate still possible.
 */

export const essenceMat = (w: Pick<EssenceWrite, "essenceId" | "label">): CraftMaterial => ({ id: w.essenceId, label: w.label, group: "essence" });

function familyOnItem(ctx: PlanCtx, state: PlanState, m: ResolvedTarget): boolean {
  return state.affixes.some((a) => a.target != null && modOf(ctx, a).family === m.family);
}

/** One essence write a missing target (or pool slot) can take: the concrete mod and, for a slot, its candidate. */
interface Write {
  t: ResolvedTarget;
  mod: ResolvedTarget;
  alt: number | null;
}

function writes(ctx: PlanCtx, state: PlanState): Write[] {
  return ctx.targets.flatMap((t): Write[] => {
    if (!aimable(ctx, state, t)) return [];
    if (t.alts.length === 0) return familyOnItem(ctx, state, t) ? [] : [{ t, mod: t, alt: null }];
    return eligibleAlts(ctx, state, t.idx).flatMap((alt) => (familyOnItem(ctx, state, t.alts[alt]!) ? [] : [{ t, mod: t.alts[alt]!, alt }]));
  });
}

function essenceGreater(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Magic" || craftedSlotUsed(state)) return [];
  const rare: PlanState = { ...state, rarity: "Rare" };
  const out: Move[] = [];
  for (const { t, mod, alt } of writes(ctx, state)) {
    if (openOf(ctx, rare, t.side) < 1) continue;
    for (const w of mod.essences.filter((e) => e.tier === "greater")) {
      const move = makeMove(ctx, {
        methodId: `essence-greater:${w.essenceId}`,
        title: `${targetText(mod.text)} by essence`,
        next: withAffixes(rare, [...state.affixes, targetAffix(t.side, t.idx, "crafted", alt)]),
        steps: [
          step({
            do: `${w.label} → rare with ${targetText(ctxModText(ctx, w.modId))}.`,
            why: `Upgrades the magic item to rare, keeps its mods and writes the essence's guaranteed mod into the one crafted slot. A magic mod of the same family makes it fail ("already has a mod of this type", not consumed) — Annul that mod first.`,
            sources: essenceSources(w, false),
            mats: [essenceMat(w)],
            check: `Rare, ${targetText(ctxModText(ctx, w.modId))} present.`,
          }),
        ],
        uses: [once(essenceMat(w))],
        odds: exact(1, "an essence write is guaranteed"),
        grade: "vp",
        checks: [{ state, rules: ["essence-greater"] }],
      });
      if (move) out.push(move);
    }
  }
  return out;
}

const ctxModText = (ctx: PlanCtx, modId: string): string => ctx.cat.mods[modId]?.text ?? modId;

/** The one mod an essence (or a steered one) will remove — only when every candidate is the same kind of junk. */
export function junkRemoval(state: PlanState, steer: AffixSide | null): PlanAffix | null {
  if (steer && anyJunkCount(state) > 0) return null;
  const pool = steer ? removableOn(state, steer) : removable(state);
  const first = pool[0];
  if (!first || !pool.every((a) => isJunk(a) && a.side === first.side && a.kind === first.kind && a.special === first.special)) return null;
  return first;
}

/** Remove-then-write on a rare: Perfect/special essences, or (alloys) the Verisium alloys. */
function rareWrites(alloys: boolean) {
  return (state: PlanState, ctx: PlanCtx): Move[] => {
    if (state.rarity !== "Rare" || craftedSlotUsed(state)) return [];
    const out: Move[] = [];
    for (const wr of writes(ctx, state)) {
      for (const w of wr.mod.essences.filter((e) => e.tier !== "greater" && (e.tier === "alloy") === alloys)) {
        for (const steer of [null, ...SIDES] as const) {
          const move = perfectMove(state, ctx, wr, w, steer);
          if (move) out.push(move);
        }
      }
    }
    return out;
  };
}

/** An alloy is currency on the exchange, not an essence: its material row comes from MATS. */
function writeMat(w: EssenceWrite): CraftMaterial {
  if (w.tier !== "alloy") return essenceMat(w);
  const m = ALL_MATERIALS.find((x) => x.id === w.essenceId);
  if (!m) throw new Error(`planner: alloy ${w.essenceId} has no craftMaterials entry`);
  return m;
}

function perfectWhy(alloy: boolean, where: string, steered: boolean): string {
  const removal = `The ${alloy ? "alloy" : "essence"} removes a random ${where ? `${where} ` : ""}mod — the only removable one${where ? ` on that side` : ""} is a throwaway, so nothing you want goes — then writes its guaranteed mod into the crafted slot.`;
  if (alloy) return `${removal} An item that already has a crafted mod refuses it ("This item already has a crafted mod").${steered ? " Activate the Crystallisation omen right before the alloy — any essence used in between consumes it." : ""}`;
  return `${removal}${steered ? " A Crystallisation omen is used up by ANY essence (one source says so) — activate it right before this one." : ""}`;
}

function perfectMove(state: PlanState, ctx: PlanCtx, wr: Write, w: EssenceWrite, steer: AffixSide | null): Move | null {
  const { t, alt } = wr;
  const label = targetText(wr.mod.text);
  const gone = junkRemoval(state, steer);
  if (!gone) return null;
  const after = withAffixes(state, without(state, gone));
  if (openOf(ctx, after, t.side) < 1) return null;
  const alloy = w.tier === "alloy";
  const omen = steer ? sideOmen(steer, "Crystallisation") : null;
  const mats = [...(omen ? [mat(omen.key)] : []), writeMat(w)];
  const where = steer ? `${steer}` : "";
  // the omen's text names Perfect/Corrupted Essences only: steering an alloy rests on creator footage
  const creatorOnly = alloy && omen != null;
  return makeMove(ctx, {
    methodId: `${alloy ? "alloy" : "essence-perfect"}:${w.essenceId}${steer ? `:${steer}` : ""}`,
    title: `${label} by ${alloy ? "alloy" : "essence"}`,
    next: withAffixes(after, [...after.affixes, targetAffix(t.side, t.idx, "crafted", alt)]),
    steps: [
      step({
        do: `${omen ? `${mat(omen.key).label} + ` : ""}${w.label} → ${label}.`,
        why: perfectWhy(alloy, where, omen != null),
        sources: essenceSources(w, steer != null),
        mats,
        check: `${label} present; the throwaway is gone.`,
      }),
    ],
    uses: mats.map(once),
    odds: exact(1, `the removal hits the only removable ${where || "mod"} (a throwaway); the write is guaranteed`),
    grade: creatorOnly ? "ss" : "vp",
    facts: creatorOnly ? [CRYSTALLISATION_ALLOY_FACT.text] : [],
    checks: [{ state, rules: [omen ? omen.rule : alloy ? "alloy" : "essence-perfect"] }],
  });
}

/** The essence's poe2db page, the essence rules, and the omen rules when an omen steers it. */
function essenceSources(w: EssenceWrite, steered: boolean): SourceRef[] {
  const omen: SourceId[] = steered ? (w.tier === "alloy" ? ["kb-omens", "creators", "forum"] : ["kb-omens"]) : [];
  return [...sources("kb-essences", ...omen), linkSource(`poe2db — ${w.label}`, w.source)];
}

export const WRITE_METHODS: readonly Method[] = [
  { id: "essence-greater", order: 15, moves: essenceGreater },
  { id: "essence-perfect", order: 50, moves: rareWrites(false) },
  // its own method so craft:eval and the creator-footage vocabulary can name an alloy step
  { id: "alloy", order: 51, moves: rareWrites(true) },
];
