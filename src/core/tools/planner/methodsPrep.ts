import type { AffixSide } from "../craftmoves/catalog";
import { band, failuresOf, useOf } from "./expectation";
import { AUG_TIERS, makeMove, mat, once, sideOmen, step, targetText, TRANSMUTE_FOR_AUG, usableTier, type MoveSpec } from "./methodKit";
import { sources } from "./sources";
import { addOdds, exact } from "./odds";
import { aimable, anyJunkCount, isJunk, isMet, junk, modOf, openOf, otherSide, present, removable, SIDES, withAffixes, withLanded } from "./state";
import type { Method, Move, PlanCtx, PlanState, ResolvedTarget } from "./types";

/**
 * Shape the base (the starts live in methodsStart.ts): the magic Annul+Aug loop, Regal, the
 * two-throwaway rare, throwaway mods, junk strips and the fracture.
 */

/** Normal → magic → Annulment + Augmentation until the target: magic items hold one mod per side. */
function magicLoop(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Normal" || ctx.base.allowance.p !== 0 || ctx.base.allowance.s !== 0) return [];
  const out: Move[] = [];
  for (const t of ctx.targets) {
    if (t.source !== "natural" || !aimable(ctx, state, t)) continue;
    for (const aug of AUG_TIERS.filter((a) => usableTier(ctx, a))) {
      const trans = TRANSMUTE_FOR_AUG[aug.rule]!;
      const odds = addOdds(ctx, state, { sides: SIDES, floor: aug.floor, catalyst: null, quality: 0, junkAfter: 0 }, [t.idx]);
      if ((odds.p.get(t.idx) ?? 0) <= 0) continue;
      const e = odds.estimate(t.idx);
      const magicOne: PlanState = { rarity: "Magic", affixes: [junk("any")], quality: 0, catalyst: null };
      const magicNone: PlanState = { rarity: "Magic", affixes: [], quality: 0, catalyst: null };
      const move = makeMove(ctx, {
        methodId: `magic-loop-${aug.rule}`,
        title: `${targetText(t.text)} on a magic base`,
        next: withLanded(ctx, state, t.idx, "explicit", { rarity: "Magic" }),
        steps: [
          step({ do: `${trans.label} on the Normal base.`, why: "Normal → magic with one random mod.", mats: [mat(trans.key)] }),
          step({
            do: `Orb of Annulment + ${aug.label} until ${targetText(t.text)}.`,
            why: `Annulment removes the magic item's only mod, the Augmentation adds a new one${aug.floor ? `; the ${aug.floor} floor keeps lower tiers out` : ""}.`,
            sources: sources("kb-currency"),
            mats: [mat("annul"), mat(aug.key)],
            check: `Magic, ${targetText(t.text)} (or a better tier) and nothing else.`,
          }),
        ],
        uses: [once(mat(trans.key)), useOf(mat("annul"), failuresOf(e)), useOf(mat(aug.key), failuresOf(e))],
        odds: e,
        grade: "vp",
        checks: [
          { state, rules: [trans.rule] },
          { state: magicOne, rules: ["annul"] },
          { state: magicNone, rules: [aug.rule] },
        ],
      });
      if (move) out.push(move);
    }
  }
  return out;
}

/** Magic with one mod and the other side open: a plain Augmentation fills it with a throwaway. */
function magicFiller(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Magic" || state.affixes.length !== 1 || state.affixes[0]!.side === "any") return [];
  const side = otherSide(state.affixes[0]!.side as AffixSide);
  const move = makeMove(ctx, {
    methodId: "magic-aug-filler",
    title: "Second magic mod",
    next: withAffixes(state, [...state.affixes, junk(side)]),
    steps: [step({ do: `Orb of Augmentation → any ${side}.`, why: `A magic item holds one prefix + one suffix; the only open slot is the ${side}, so the new mod lands there.`, mats: [mat("aug")], sources: sources("kb-currency") })],
    uses: [once(mat("aug"))],
    odds: exact(1, `only the ${side} slot is open`),
    grade: "vp",
    checks: [{ state, rules: ["aug"] }],
  });
  return move ? [move] : [];
}

/** Regal: magic → rare, keeps the mods, adds one random mod (side unknown in advance). */
function regal(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Magic" || state.affixes.length === 0) return [];
  const move = makeMove(ctx, {
    methodId: "regal",
    title: "Make it rare",
    next: withAffixes(state, [...state.affixes, junk("any")], { rarity: "Rare" }),
    steps: [step({ do: "Regal Orb → rare.", why: "Keeps the magic mods and adds one random mod.", mats: [mat("regal")] })],
    uses: [once(mat("regal"))],
    odds: exact(1, "the added mod is a throwaway"),
    grade: "vs",
    checks: [{ state, rules: ["regal"] }],
  });
  return move ? [move] : [];
}

/**
 * Normal → two throwaways: Transmutation + Regal. The cheapest rare whose every mod is loose — the
 * Chaos loop's start when no anchor is bought (the self-fracture route, KB §2).
 */
function transmuteRegal(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Normal" || ctx.base.allowance.p !== 0 || ctx.base.allowance.s !== 0) return [];
  const magic: PlanState = { rarity: "Magic", affixes: [junk("any")], quality: 0, catalyst: null };
  const move = makeMove(ctx, {
    methodId: "transmute-regal",
    title: "Rare with two throwaways",
    next: withAffixes(state, [junk("any"), junk("any")], { rarity: "Rare" }),
    steps: [step({ do: "Orb of Transmutation, then Regal Orb.", why: "Normal → magic with one random mod → rare with a second one; neither mod matters, both are rolled away.", mats: [mat("transmute"), mat("regal")], sources: sources("kb-currency") })],
    uses: [once(mat("transmute")), once(mat("regal"))],
    odds: exact(1, "both mods are throwaways"),
    grade: "vp",
    checks: [
      { state, rules: ["transmute"] },
      { state: magic, rules: ["regal"] },
    ],
  });
  return move ? [move] : [];
}

/** A throwaway mod on a chosen side: side omen + Exalted Orb, or a plain Exalt when only that side is open. */
function plantJunk(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Rare") return [];
  const out: Move[] = [];
  for (const side of SIDES) {
    if (openOf(ctx, state, side) < 1) continue;
    const steer = openOf(ctx, state, otherSide(side)) > 0 || anyJunkCount(state) > 0;
    const omen = sideOmen(side, "Exaltation");
    const mats = steer ? [mat(omen.key), mat("exalted")] : [mat("exalted")];
    const move = makeMove(ctx, {
      methodId: `plant-junk-${side}`,
      title: `Throwaway ${side}`,
      next: withAffixes(state, [...state.affixes, junk(side)]),
      steps: [step({ do: `${steer ? `${mat(omen.key).label} + ` : ""}Exalted Orb → any ${side} (a throwaway).`, why: steer ? `The omen makes the Exalt add a ${side}.` : `Only a ${side} slot is open.`, mats, sources: steer ? sources("kb-omens") : [] })],
      uses: mats.map(once),
      odds: exact(1, `the added mod is a throwaway ${side}`),
      grade: "vp",
      adds: true,
      checks: [{ state, rules: [steer ? omen.rule : "exalt"] }],
    });
    if (move) out.push(move);
  }
  if (openOf(ctx, state, "prefix") > 0 && openOf(ctx, state, "suffix") > 0) out.push(...exaltAnyJunk(state, ctx));
  return out;
}

function exaltAnyJunk(state: PlanState, ctx: PlanCtx): Move[] {
  const move = makeMove(ctx, {
    methodId: "plant-junk-any",
    title: "Extra mod",
    next: withAffixes(state, [...state.affixes, junk("any")]),
    steps: [step({ do: "Exalted Orb → one more mod (any).", why: "Only the mod COUNT matters here.", mats: [mat("exalted")] })],
    uses: [once(mat("exalted"))],
    odds: exact(1, "any added mod will do"),
    grade: "vp",
    adds: true,
    checks: [{ state, rules: ["exalt"] }],
  });
  return move ? [move] : [];
}

/** Every removable mod is junk: Annulment until only the protected ones (fractured) and targets remain. */
function stripJunk(state: PlanState, ctx: PlanCtx): Move[] {
  const loose = removable(state);
  if (state.rarity !== "Rare" || loose.length === 0 || !loose.every(isJunk)) return [];
  const keep = state.affixes.filter((a) => a.kind === "fractured");
  if (keep.length === 0) return [];
  const move = makeMove(ctx, {
    methodId: "strip-junk",
    title: "Strip to the fractured mod",
    next: withAffixes(state, keep),
    steps: [step({ do: "Orb of Annulment until only the fractured mod remains.", why: "Every removable mod is a throwaway and the fractured one is immune.", mats: [mat("annul")], check: "Only the fractured mod is left.", sources: sources("kb-fracture") })],
    uses: [useOf(mat("annul"), band(loose.length))],
    odds: exact(1, "every removable mod is a throwaway"),
    grade: "vp",
    checks: [{ state, rules: ["annul"] }],
  });
  return move ? [move] : [];
}

/**
 * Which present targets a Fracturing Orb may aim at. A target the player wants fractured is the only
 * aim while it is pending (one fracture per item, ever). Otherwise any landed natural target may be
 * fractured to protect it — the creators' self-fracture (KB §2) — but only while another natural
 * target is still missing: fracturing the last one protects nothing.
 */
function fractureAims(state: PlanState, ctx: PlanCtx): ResolvedTarget[] {
  if (ctx.targets.some((t) => t.fractured)) return ctx.targets.filter((t) => t.fractured && !isMet(ctx, state, t.idx));
  const unmet = (t: ResolvedTarget) => ctx.targets.some((x) => x.idx !== t.idx && x.source === "natural" && !isMet(ctx, state, x.idx));
  return ctx.targets.filter(unmet);
}

/** Fracture with ≥4 mods: P = 1/(mods − desecrated) (KB §2; uniform pick assumed, owner rule). */
function fracture(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Rare" || state.affixes.some((a) => a.kind === "fractured") || state.affixes.length < 4) return [];
  const out: Move[] = [];
  const eligible = state.affixes.filter((a) => a.kind !== "desecrated").length;
  for (const t of fractureAims(state, ctx)) {
    const a = present(state, t.idx);
    if (!a || a.unrevealed || (a.kind !== "explicit" && a.kind !== "crafted")) continue;
    // a pool slot names the candidate that landed, not "any of: …"
    const label = targetText(modOf(ctx, a).text);
    const p = 1 / eligible;
    const facts = [
      ...(a.kind === "crafted" ? ["A crafted mod can be fractured — seen in one creator video only."] : []),
      ...(state.affixes.some((x) => x.unrevealed) ? ["An unrevealed desecrated mod counting toward the 4 is shown in creator videos, not confirmed by game data."] : []),
    ];
    const next = withAffixes(state, state.affixes.map((x) => (x === a ? { ...x, kind: "fractured" as const, special: x.kind === "crafted" ? ("fractured-crafted" as const) : x.special } : x)));
    const spec: MoveSpec = {
      methodId: "fracture",
      title: `Fracture ${label}`,
      next,
      steps: [
        step({
          do: "Fracturing Orb.",
          why: `Locks one random mod for good; desecrated mods count toward the 4 but can't be picked — 1 in ${eligible} lands ${label}.`,
          sources: sources("kb-fracture"),
          mats: [mat("fracturing")],
          check: `${label} is FRACTURED.`,
          onFail: "Wrong mod fractured → one fracture per item, ever: start over on a new base (sell this one as it is).",
          retry: "start",
        }),
      ],
      uses: [once(mat("fracturing"))],
      odds: exact(p, `P = 1/${eligible} — ${state.affixes.length} mods, ${state.affixes.length - eligible} desecrated can't be fractured; each other mod equally likely`, { "mods on the item": state.affixes.length, "mods it can lock": eligible }),
      restartP: p,
      grade: facts.length > 0 ? "ss" : "vs",
      facts,
      checks: [{ state, rules: ["fracture"] }],
    };
    const move = makeMove(ctx, spec);
    if (move) out.push(move);
  }
  return out;
}

export const PREP_METHODS: readonly Method[] = [
  { id: "magic-loop", order: 10, moves: magicLoop },
  { id: "magic-aug-filler", order: 11, moves: magicFiller },
  { id: "regal", order: 12, moves: regal },
  { id: "transmute-regal", order: 13, moves: transmuteRegal },
  { id: "strip-junk", order: 20, moves: stripJunk },
  { id: "plant-junk", order: 40, moves: plantJunk },
  { id: "fracture", order: 80, moves: fracture },
];
