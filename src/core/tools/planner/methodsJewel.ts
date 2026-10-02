import type { AffixSide } from "../craftmoves/catalog";
import { band, useOf } from "./expectation";
import { makeMove, mat, once, sideOmen, step } from "./methodKit";
import { sources, type SourceId } from "./sources";
import { junkRemoval } from "./methodsWrite";
import { estimate, exact } from "./odds";
import { canonical, craftedSlotUsed, isJunk, junk, otherSide, removable, removableOn, sideCount, SIDES, withAffixes, without } from "./state";
import type { AffixSpecial, Method, Move, PlanCtx, PlanState } from "./types";

/**
 * The over-cap basic-jewel route (KB §6): Potent Liquid Contempt writes "+1 <side> Modifier allowed"
 * into a slot of the OTHER side, the grown side is filled to 3, then the crafted mod is stripped and
 * the 3rd mod stays. Owner-tested 2026-10-01 (theory-gaps T5, 6/6, + creators ~8/8): a liquid
 * removes a mod from the side its crafted mod lands on. Which of the two mods lands is ~50/50 (an
 * estimate from creator counts): the wrong one costs a good slot, so the plan restarts on a new base.
 * Strips use plain or steered Annulment and are generic (any class).
 */

export const contemptSpecial = (grow: AffixSide): AffixSpecial => (grow === "suffix" ? "contempt-suffix" : "contempt-prefix");
const word = (side: AffixSide): string => (side === "prefix" ? "Prefix" : "Suffix");

/** A rare basic jewel to start the over-cap route from: two throwaway prefixes + two throwaway suffixes. */
export function startJunkRare(ctx: PlanCtx): Move | null {
  if (!ctx.base.jewel || ctx.base.timeLost || !SIDES.some((s) => ctx.targets.filter((t) => t.side === s).length > 2)) return null;
  return makeMove(ctx, {
    methodId: "acquire-rare-junk",
    title: "Base",
    next: canonical({ rarity: "Rare", affixes: [junk("prefix"), junk("prefix"), junk("suffix"), junk("suffix")], quality: 0, catalyst: null }),
    steps: [step({ do: `Buy a rare ${ctx.base.name}, item level ${ctx.base.ilvl}+, with 2 prefixes + 2 suffixes you don't need — nothing fractured, crafted or desecrated.`, why: "Contempt needs a throwaway on the side it removes from; the cheapest full jewel is the base." })],
    uses: [],
    odds: exact(1, "buying a base is not a gamble"),
    grade: "vp",
    checks: [],
  });
}

function contempt(state: PlanState, ctx: PlanCtx): Move[] {
  if (!ctx.base.jewel || ctx.base.timeLost || state.rarity !== "Rare" || craftedSlotUsed(state)) return [];
  const out: Move[] = [];
  for (const grow of SIDES) {
    const host = otherSide(grow);
    if (ctx.targets.filter((t) => t.side === grow).length <= 2) continue;
    const gone = junkRemoval(state, host);
    const growLoose = removableOn(state, grow);
    if (!gone || growLoose.length === 0) continue;
    const p = 0.5;
    const move = makeMove(ctx, {
      methodId: `contempt-${grow}`,
      title: `+1 ${grow} slot`,
      next: withAffixes(state, [...without(state, gone), junk(host, "crafted", contemptSpecial(grow))]),
      steps: [
        step({
          do: `Potent Liquid Contempt → "+1 ${word(grow)} Modifier allowed" (it sits in a ${host} slot).`,
          why: `A liquid removes a mod from the side its crafted mod lands on (6 of 6 in our own test, and in creator videos) — your ${host}s are throwaways.`,
          sources: sources("kb-liquids", "owner-test-2026-10-01", "creators"),
          mats: [mat("potentLiquidContempt")],
          check: `"+1 ${word(grow)} Modifier allowed" on the item.`,
          onFail: `"+1 ${word(host)} Modifier allowed" instead (it took a ${grow}) → start over on a new base.`,
          retry: "start",
        }),
      ],
      uses: [once(mat("potentLiquidContempt"))],
      odds: estimate(p, "which Contempt mod lands is about 50/50 — counted from creator videos, no published weight", { "possible Contempt mods": 2 }),
      restartP: p,
      grade: "vs",
      checks: [{ state, rules: ["liquid-potent-contempt"] }],
    });
    if (move) out.push(move);
  }
  return out;
}

/** Strip the Contempt mod when it is the only removable mod of its side: the over-cap 3rd mod stays. */
function stripContempt(state: PlanState, ctx: PlanCtx): Move[] {
  const out: Move[] = [];
  for (const a of state.affixes) {
    if (a.special !== "contempt-prefix" && a.special !== "contempt-suffix") continue;
    const host = a.side as AffixSide;
    const grow = otherSide(host);
    if (removableOn(state, host).length !== 1 || sideCount(state, grow) <= 2) continue;
    const steer = removable(state).length > 1 ? sideOmen(host, "Annulment") : null;
    const mats = [...(steer ? [mat(steer.key)] : []), mat("annul")];
    const move = makeMove(ctx, {
      methodId: "strip-contempt",
      title: "Strip the +1 mod",
      next: withAffixes(state, without(state, a)),
      steps: [step({ do: `${mats.map((m) => m.label).join(" + ")} → removes "+1 ${word(grow)} Modifier allowed".`, why: `It is the only removable ${host}${steer ? ` and the omen keeps the Annulment on the ${host}s` : ""}; the 3rd ${grow} stays.`, mats, sources: sources("kb-liquids", ...(steer ? (["kb-omens"] as SourceId[]) : [])), check: `3 ${grow}es, no "+1 … allowed" mod.` })],
      uses: mats.map(once),
      odds: exact(1, `the only removable ${host}`),
      grade: "ss",
      facts: ["The over-cap 3rd mod surviving the strip is shown in creator videos, not confirmed by game data."],
      checks: [{ state, rules: [steer ? steer.rule : "annul"] }],
    });
    if (move) out.push(move);
  }
  return out;
}

/** Steered Annulment until a side holds no throwaway (every removable mod there is plain junk). */
function stripSide(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Rare" || state.affixes.some((a) => a.side === "any")) return [];
  const out: Move[] = [];
  for (const side of SIDES) {
    const loose = removableOn(state, side);
    const others = removable(state).length - loose.length;
    if (loose.length === 0 || others === 0 || !loose.every((a) => isJunk(a) && a.special == null)) continue;
    const omen = sideOmen(side, "Annulment");
    const move = makeMove(ctx, {
      methodId: `strip-${side}`,
      title: `Clear the ${side}es`,
      next: withAffixes(state, state.affixes.filter((a) => !loose.includes(a))),
      steps: [step({ do: `${mat(omen.key).label} + Orb of Annulment until no throwaway ${side} remains.`, why: `Every removable ${side} is a throwaway and the omen keeps the Annulment off the ${otherSide(side)}es.`, mats: [mat(omen.key), mat("annul")], sources: sources("kb-omens") })],
      uses: [useOf(mat(omen.key), band(loose.length)), useOf(mat("annul"), band(loose.length))],
      odds: exact(1, `every removable ${side} is a throwaway`),
      grade: "vp",
      checks: [{ state, rules: [omen.rule] }],
    });
    if (move) out.push(move);
  }
  return out;
}

export const JEWEL_METHODS: readonly Method[] = [
  { id: "strip-side", order: 21, moves: stripSide },
  { id: "contempt", order: 45, moves: contempt },
  { id: "strip-contempt", order: 65, moves: stripContempt },
];
