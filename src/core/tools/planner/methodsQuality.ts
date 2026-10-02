import type { AffixSide } from "../craftmoves/catalog";
import { catalystById, QUALITY_PER_CATALYST, QUALITY_PER_CATALYST_NOTE } from "./catalystTags";
import { band, useOf } from "./expectation";
import { BREACH_ESSENCE_ID, ESSENCE_OUTCOMES } from "./essenceOutcomes";
import { makeMove, mat, once, sideOmen, step } from "./methodKit";
import { sources } from "./sources";
import { essenceMat, junkRemoval } from "./methodsWrite";
import { exact } from "./odds";
import { craftedSlotUsed, junk, openOf, removable, SIDES, withAffixes, without } from "./state";
import type { Method, Move, PlanCtx, PlanState } from "./types";

/**
 * Finished-item catalyst quality (an optional goal). Plain catalysts reach the base cap (20% +
 * "Maximum Quality" implicits: Breach Ring 40%, Refined Breach Ring 45%). The Breach path goes 20%
 * higher: Essence of the Breach writes "+20% to Maximum Quality", catalysts fill it, then the
 * essence mod is stripped and the quality STAYS (creator-demonstrated CZepweLtKwA 12:30–13:05;
 * owner trade check T12 2026-10-02: 60% Breach Rings common). Catalysing Exaltation would consume
 * it, so the search only keeps it when no catalysed slam follows.
 */

const BREACH_FACT = "keeping the quality after stripping the Essence of the Breach mod is creator-demonstrated (CZepweLtKwA 12:30–13:05) + owner trade check T12";

function catalystUnits(pct: number): number {
  return pct / QUALITY_PER_CATALYST;
}

function catalyseFinish(state: PlanState, ctx: PlanCtx): Move[] {
  const goal = ctx.quality;
  const cap = ctx.base.qualityCap;
  if (!goal || cap == null || goal.pct > cap || state.rarity === "Normal") return [];
  if (state.catalyst === goal.catalyst && state.quality >= goal.pct) return [];
  const c = catalystById(goal.catalyst);
  const from = state.catalyst === goal.catalyst ? state.quality : 0;
  const move = makeMove(ctx, {
    methodId: "catalyse-finish",
    title: "Quality",
    next: { ...state, quality: goal.pct, catalyst: goal.catalyst },
    steps: [step({ do: `${c.mat.label} → quality to ${goal.pct}%.`, why: `Quality raises the magnitude of matching mods; a different catalyst type wipes the old quality. ${QUALITY_PER_CATALYST_NOTE}`, mats: [c.mat], sources: sources("kb-catalysts", "creators") })],
    uses: [useOf(c.mat, band(catalystUnits(goal.pct - from)))],
    odds: exact(1, "catalysts always add quality"),
    costBasis: "estimate",
    grade: "vp",
    checks: [{ state: { ...state, quality: 0, catalyst: null }, rules: ["catalyst"] }],
  });
  return move ? [move] : [];
}

function breachQuality(state: PlanState, ctx: PlanCtx): Move[] {
  const goal = ctx.quality;
  const cap = ctx.base.qualityCap;
  const row = ESSENCE_OUTCOMES.find((r) => r.essenceId === BREACH_ESSENCE_ID && r.itemClass === ctx.base.itemClass);
  if (!goal || cap == null || !row || goal.pct <= cap || state.rarity !== "Rare" || craftedSlotUsed(state)) return [];
  if (state.catalyst === goal.catalyst && state.quality >= goal.pct) return [];
  const out: Move[] = [];
  for (const steer of [null, ...SIDES] as const) {
    const move = breachMove(state, ctx, steer, cap + 20);
    if (move) out.push(move);
  }
  return out;
}

function breachMove(state: PlanState, ctx: PlanCtx, steer: AffixSide | null, top: number): Move | null {
  const goal = ctx.quality!;
  const gone = junkRemoval(state, steer);
  if (!gone) return null;
  const after = withAffixes(state, without(state, gone));
  if (openOf(ctx, after, "prefix") < 1) return null;
  const written = withAffixes(after, [...after.affixes, junk("prefix", "crafted", "breach-quality")], { quality: 0, catalyst: null });
  const loose = removable(written);
  const onlyPrefix = loose.filter((a) => a.side === "prefix").length === 1;
  if (!onlyPrefix && loose.length !== 1) return null;
  const strip = loose.length === 1 ? null : sideOmen("prefix", "Annulment");
  const c = catalystById(goal.catalyst);
  const essence = essenceMat({ essenceId: BREACH_ESSENCE_ID, label: "Essence of the Breach" });
  const crystal = steer ? sideOmen(steer, "Crystallisation") : null;
  const first = [...(crystal ? [mat(crystal.key)] : []), essence];
  const last = [...(strip ? [mat(strip.key)] : []), mat("annul")];
  return makeMove(ctx, {
    methodId: `breach-quality${steer ? `:${steer}` : ""}`,
    title: `Quality to ${top}%`,
    next: { ...after, quality: top, catalyst: goal.catalyst },
    steps: [
      step({ do: `${first.map((m) => m.label).join(" + ")} → "+20% to Maximum Quality".`, why: `It removes the throwaway (the only removable mod${steer ? ` on that side` : ""}) and writes the quality mod into the crafted slot (poe2db Essence_of_the_Breach).`, mats: first }),
      step({ do: `${c.mat.label} → quality to ${top}%.`, why: `Cap ${ctx.base.qualityCap}% + the essence's 20%. ${QUALITY_PER_CATALYST_NOTE}`, mats: [c.mat], sources: sources("kb-catalysts", "creators") }),
      step({ do: `${last.map((m) => m.label).join(" + ")} → removes the "+20% to Maximum Quality" mod.`, why: "The quality stays above the cap; the crafted slot is free again.", mats: last, check: `${top}% quality, no "+20% to Maximum Quality" mod.` }),
    ],
    uses: [...first.map(once), useOf(c.mat, band(catalystUnits(top))), ...last.map(once)],
    odds: exact(1, "every removal hits the only candidate"),
    costBasis: "estimate",
    grade: "ss",
    facts: [BREACH_FACT],
    checks: [
      { state, rules: [crystal ? crystal.rule : "essence-perfect"] },
      { state: written, rules: ["catalyst"] },
      { state: { ...written, quality: top, catalyst: goal.catalyst }, rules: [strip ? strip.rule : "annul"] },
    ],
  });
}

export const QUALITY_METHODS: readonly Method[] = [
  { id: "breach-quality", order: 25, moves: breachQuality },
  { id: "catalyse-finish", order: 90, moves: catalyseFinish },
];
