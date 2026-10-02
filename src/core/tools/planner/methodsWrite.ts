import type { CraftMaterial, MaterialKey } from "../../craftMaterials";
import type { AffixSide } from "../craftmoves/catalog";
import { attemptsOf, failuresOf, scaleBand, useOf } from "./expectation";
import { makeMove, mat, once, S, sideOmen, step, targetText } from "./methodKit";
import { exact, revealOdds } from "./odds";
import { anyJunkCount, craftedSlotUsed, hasKind, isJunk, junk, openOf, otherSide, present, removable, removableOn, SIDES, targetAffix, withAffixes, without } from "./state";
import type { EssenceWrite, Method, Move, PlanAffix, PlanCtx, PlanState, ResolvedTarget } from "./types";

/**
 * Deterministic writes: Greater essences (magic → rare + guaranteed mod), Perfect/Corrupted essences
 * steered by Crystallisation, and desecration (bone + Necromancy + faction omen, reveal with Echoes,
 * Omen of Light retry). Owner rule (theory-gaps T3, in game 2026-10-02): a Greater essence whose
 * family is already on the item fails ("already has a mod of this type") — never planned then.
 */

export const essenceMat = (w: Pick<EssenceWrite, "essenceId" | "label">): CraftMaterial => ({ id: w.essenceId, label: w.label, group: "essence" });

function familyOnItem(ctx: PlanCtx, state: PlanState, t: ResolvedTarget): boolean {
  return state.affixes.some((a) => a.target != null && ctx.targets[a.target]!.family === t.family);
}

function essenceGreater(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Magic" || craftedSlotUsed(state)) return [];
  const rare: PlanState = { ...state, rarity: "Rare" };
  const out: Move[] = [];
  for (const t of ctx.targets) {
    if (present(state, t.idx) || familyOnItem(ctx, state, t) || openOf(ctx, rare, t.side) < 1) continue;
    for (const w of t.essences.filter((e) => e.tier === "greater")) {
      const move = makeMove(ctx, {
        methodId: `essence-greater:${w.essenceId}`,
        title: `${targetText(t.text)} by essence`,
        next: withAffixes(rare, [...state.affixes, targetAffix(t.side, t.idx, "crafted")]),
        steps: [
          step({
            do: `${w.label} → rare with ${targetText(ctxModText(ctx, w.modId))}.`,
            why: `Upgrades the magic item to rare, keeps its mods and writes the essence's guaranteed mod into the one crafted slot (${S.kb7}; ${w.source}). A magic mod of the same family makes it fail ("already has a mod of this type", not consumed) — Annul that mod first.`,
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

function essencePerfect(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Rare" || craftedSlotUsed(state)) return [];
  const out: Move[] = [];
  for (const t of ctx.targets) {
    if (present(state, t.idx) || familyOnItem(ctx, state, t)) continue;
    for (const w of t.essences.filter((e) => e.tier !== "greater")) {
      for (const steer of [null, ...SIDES] as const) {
        const move = perfectMove(state, ctx, t, w, steer);
        if (move) out.push(move);
      }
    }
  }
  return out;
}

function perfectMove(state: PlanState, ctx: PlanCtx, t: ResolvedTarget, w: EssenceWrite, steer: AffixSide | null): Move | null {
  const gone = junkRemoval(state, steer);
  if (!gone) return null;
  const after = withAffixes(state, without(state, gone));
  if (openOf(ctx, after, t.side) < 1) return null;
  const omen = steer ? sideOmen(steer, "Crystallisation") : null;
  const mats = [...(omen ? [mat(omen.key)] : []), essenceMat(w)];
  const where = steer ? `${steer}` : "";
  return makeMove(ctx, {
    methodId: `essence-perfect:${w.essenceId}${steer ? `:${steer}` : ""}`,
    title: `${targetText(t.text)} by essence`,
    next: withAffixes(after, [...after.affixes, targetAffix(t.side, t.idx, "crafted")]),
    steps: [
      step({
        do: `${omen ? `${mat(omen.key).label} + ` : ""}${w.label} → ${targetText(t.text)}.`,
        why: `The essence removes a random ${where ? `${where} ` : ""}mod — the only removable one${where ? ` on that side` : ""} is a throwaway, so nothing you want goes — then writes its guaranteed mod into the crafted slot (${S.kb7}; ${steer ? `${S.kb4}; ` : ""}${w.source}).${omen ? " A Crystallisation omen is consumed by ANY essence (single-source) — activate it right before this one." : ""}`,
        mats,
        check: `${targetText(t.text)} present; the throwaway is gone.`,
      }),
    ],
    uses: mats.map(once),
    odds: exact(1, `the removal hits the only removable ${where || "mod"} (a throwaway); the write is guaranteed`),
    grade: "vp",
    checks: [{ state, rules: [omen ? omen.rule : "essence-perfect"] }],
  });
}

const BONE: Record<string, MaterialKey> = { Rings: "preservedCollarbone", Amulets: "preservedCollarbone", Belts: "preservedCollarbone", Jewels: "preservedCranium" };
const TIME_LOST_DESECRATION = "desecrating a Time-Lost jewel: no source names Time-Lost jewels (KB §6)";

interface Desecration {
  bone: CraftMaterial;
  omen: { key: MaterialKey; rule: string } | null;
  coreUnknown: boolean;
}

/**
 * Always side-steered: which side an unsteered bone picks when only one side is open is not in the
 * KB, and on a FULL side it removes a random mod there (KB §5) — Necromancy makes it certain.
 */
function desecration(ctx: PlanCtx, state: PlanState, side: AffixSide): Desecration | null {
  const key = BONE[ctx.base.itemClass];
  if (!key || state.rarity !== "Rare" || hasKind(state, "desecrated") || openOf(ctx, state, side) < 1) return null;
  return { bone: mat(key), omen: sideOmen(side, "Necromancy"), coreUnknown: ctx.base.timeLost };
}

function desecrate(state: PlanState, ctx: PlanCtx): Move[] {
  const out: Move[] = [];
  for (const t of ctx.targets) {
    if (t.source !== "desecrated" || present(state, t.idx)) continue;
    const d = desecration(ctx, state, t.side);
    if (!d) continue;
    const liege = t.faction === "amanamu" && ctx.base.itemClass !== "Jewels";
    const move = desecrateMove(state, ctx, t, d, liege);
    if (move) out.push(move);
  }
  return out;
}

function desecrateMove(state: PlanState, ctx: PlanCtx, t: ResolvedTarget, d: Desecration, liege: boolean): Move | null {
  const odds = revealOdds(ctx, state, t, liege);
  const e = odds.withEchoes;
  const slam = [...(d.omen ? [mat(d.omen.key)] : []), ...(liege ? [mat("omenTheLiege")] : []), d.bone];
  const unrevealed = withAffixes(state, [...state.affixes, { ...targetAffix(t.side, t.idx, "desecrated"), unrevealed: true }]);
  const revealedJunk = withAffixes(state, [...state.affixes, junk(t.side, "desecrated")]);
  const facts = [
    ...(ctx.base.itemClass === "Belts" && liege ? ["Omen of the Liege on belts: creator footage only (KB §4, single-source)"] : []),
    ...(d.coreUnknown ? [TIME_LOST_DESECRATION] : []),
  ];
  return makeMove(ctx, {
    methodId: `desecrate${liege ? "-liege" : ""}`,
    title: `Desecrated ${targetText(t.text)}`,
    next: withAffixes(state, [...state.affixes, targetAffix(t.side, t.idx, "desecrated")]),
    steps: [
      step({
        do: `${slam.map((m) => m.label).join(" + ")} on the open ${t.side}, then reveal at the Well of Souls.`,
        why: `${d.omen ? `Necromancy puts the desecrated mod on the ${t.side} (${S.kb4}); ` : ""}${liege ? `the Liege forces an Amanamu mod (${S.kb4}); ` : ""}an open slot means nothing is removed (${S.kb5}).`,
        mats: slam,
        pick: [targetText(t.text)],
      }),
      step({
        do: "Not offered → Omen of Abyssal Echoes rerolls the three options once.",
        why: `One reroll, not a guarantee (${S.kb4}). Keep the Well open: re-opening it may consume the omen (forum 3861139, single-source).`,
        mats: [mat("omenAbyssalEchoes")],
        pick: [targetText(t.text)],
      }),
      step({
        do: "Still not offered → pick any, then Omen of Light + Orb of Annulment strips only the desecrated mod.",
        why: "Light makes the Annulment remove only desecrated mods — the slot is free for a new bone.",
        mats: [mat("omenLight"), mat("annul")],
        onFail: "Back to the bone.",
        retry: "self",
        check: `${targetText(t.text)} revealed on the item.`,
      }),
    ],
    uses: [
      ...slam.map((m) => useOf(m, attemptsOf(e))),
      useOf(mat("omenAbyssalEchoes"), scaleBand(attemptsOf(e), 1 - odds.first)),
      useOf(mat("omenLight"), failuresOf(e)),
      useOf(mat("annul"), failuresOf(e)),
    ],
    odds: e,
    grade: "vp",
    adds: true,
    coreUnknown: d.coreUnknown,
    facts,
    checks: [
      { state, rules: ["bone-preserved", ...(d.omen ? [d.omen.rule] : []), ...(liege ? ["omen-liege"] : [])] },
      { state: unrevealed, rules: ["omen-abyssal-echoes"] },
      { state: revealedJunk, rules: ["omen-light"] },
    ],
  });
}

/** An UNREVEALED desecrated throwaway: counts toward the Fracturing Orb's 4 mods, can't be fractured (KB §2). */
function blocker(state: PlanState, ctx: PlanCtx): Move[] {
  const pending = ctx.targets.some((t) => t.fractured && !hasKind(state, "fractured"));
  if (!pending || ctx.targets.some((t) => t.source === "desecrated")) return [];
  const out: Move[] = [];
  for (const side of SIDES) {
    const d = desecration(ctx, state, side);
    if (!d) continue;
    const mats = [...(d.omen ? [mat(d.omen.key)] : []), d.bone];
    const move = makeMove(ctx, {
      methodId: `blocker-${side}`,
      title: "Fracture blocker",
      next: withAffixes(state, [...state.affixes, { ...junk(side, "desecrated"), unrevealed: true }]),
      steps: [step({ do: `${mats.map((m) => m.label).join(" + ")} → a desecrated ${side}; leave it UNREVEALED.`, why: `It counts toward the Fracturing Orb's 4 mods but can't be fractured, so the fracture odds improve (${S.kb2}).`, mats })],
      uses: mats.map(once),
      odds: exact(1, "any desecrated mod blocks"),
      grade: "ss",
      adds: true,
      coreUnknown: d.coreUnknown,
      facts: ["an UNREVEALED desecrated mod counting toward the 4 is creator-demonstrated (KB §2)"],
      checks: [{ state, rules: ["bone-preserved", ...(d.omen ? [d.omen.rule] : [])] }],
    });
    if (move) out.push(move);
  }
  return out;
}

export const WRITE_METHODS: readonly Method[] = [
  { id: "essence-greater", order: 15, moves: essenceGreater },
  { id: "essence-perfect", order: 50, moves: essencePerfect },
  { id: "desecrate", order: 60, moves: desecrate },
  { id: "blocker", order: 75, moves: blocker },
];
