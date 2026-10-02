import type { AffixSide } from "../craftmoves/catalog";
import { band, failuresOf, useOf } from "./expectation";
import { AUG_TIERS, makeMove, mat, once, S, sideOmen, step, targetText, TRANSMUTE_FOR_AUG, usableTier, type MoveSpec } from "./methodKit";
import { addOdds, exact } from "./odds";
import { anyJunkCount, canonical, isJunk, isMet, junk, openOf, otherSide, present, removable, SIDES, targetAffix, withAffixes } from "./state";
import { startJunkRare } from "./methodsJewel";
import type { Method, Move, PlanCtx, PlanState } from "./types";

/**
 * Acquire and shape the base: the two allowed starts (a clean Normal base, or a rare with a
 * FRACTURED non-target "anchor" — owner rule: never buy a base that already carries a target), the
 * magic Annul+Aug loop, Regal, throwaway mods and junk strips.
 */

const EMPTY: PlanState = { rarity: "Normal", affixes: [], quality: 0, catalyst: null };

function finishedCap(ctx: PlanCtx, side: AffixSide): number {
  if (ctx.base.jewel) return 2;
  return 3 + (side === "prefix" ? ctx.base.allowance.p : ctx.base.allowance.s);
}

function startNormal(ctx: PlanCtx): Move | null {
  return makeMove(ctx, {
    methodId: "acquire-normal",
    title: "Base",
    next: EMPTY,
    steps: [step({ do: `Buy a Normal ${ctx.base.name}, item level ${ctx.base.ilvl}+.`, why: "A clean base: nothing on it to work around." })],
    uses: [],
    odds: exact(1, "buying a base is not a gamble"),
    grade: "vp",
    checks: [],
  });
}

/** Rare with a FRACTURED non-target mod on a side the targets leave room on, stripped to it + one mod. */
function startAnchored(ctx: PlanCtx, side: AffixSide): Move | null {
  const wanted = ctx.targets.filter((t) => t.side === side).length;
  if (ctx.targets.some((t) => t.fractured) || wanted >= finishedCap(ctx, side)) return null;
  const anchor = junk(side, "fractured");
  const bought = canonical({ rarity: "Rare", affixes: [anchor, junk("any"), junk("any"), junk("any")], quality: 0, catalyst: null });
  const next = canonical({ rarity: "Rare", affixes: [anchor, junk("any")], quality: 0, catalyst: null });
  return makeMove(ctx, {
    methodId: `acquire-anchored-${side}`,
    title: "Anchored base",
    next,
    steps: [
      step({
        do: `Buy a rare ${ctx.base.name}, item level ${ctx.base.ilvl}+, with a FRACTURED ${side} that is not a tier of any mod you want (${ctx.targets.map((t) => targetText(t.text)).join("; ")}), and no crafted or desecrated mod.`,
        why: `The fractured mod can't be removed (${S.kb2}), so every later removal lands on the loose mods — and it fills a ${side} slot you don't need.`,
      }),
      step({
        do: "Orb of Annulment until only the fractured mod and one other mod remain.",
        why: `Each Annulment removes a random mod; the fractured one is immune (${S.kb2}).`,
        mats: [mat("annul")],
        check: `The fractured ${side} plus exactly one loose mod.`,
      }),
    ],
    // a fractured rare has 4–6 mods (the Fracturing Orb needs 4): 2–4 Annulments, 3 expected
    uses: [useOf(mat("annul"), band(3, 2, 4))],
    odds: exact(1, "each Annulment removes a loose mod (the fractured one is immune)"),
    grade: "vp",
    checks: [{ state: bought, rules: ["annul"] }],
  });
}

/** The search's start edges. */
export function startMoves(ctx: PlanCtx): Move[] {
  return [startNormal(ctx), ...SIDES.map((side) => startAnchored(ctx, side)), startJunkRare(ctx)].filter((m): m is Move => m != null);
}

/** Normal → magic → Annulment + Augmentation until the target: magic items hold one mod per side. */
function magicLoop(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Normal" || ctx.base.allowance.p !== 0 || ctx.base.allowance.s !== 0) return [];
  const out: Move[] = [];
  for (const t of ctx.targets) {
    if (t.source !== "natural" || present(state, t.idx)) continue;
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
        next: withAffixes(state, [targetAffix(t.side, t.idx, "explicit")], { rarity: "Magic" }),
        steps: [
          step({ do: `${trans.label} on the Normal base.`, why: "Normal → magic with one random mod.", mats: [mat(trans.key)] }),
          step({
            do: `Orb of Annulment + ${aug.label} until ${targetText(t.text)}.`,
            why: `Annulment removes the magic item's only mod, the Augmentation adds a new one (${S.kb1})${aug.floor ? `; the ${aug.floor} floor keeps lower tiers out` : ""}.`,
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
    steps: [step({ do: `Orb of Augmentation → any ${side}.`, why: `A magic item holds one prefix + one suffix; the only open slot is the ${side}, so the new mod lands there (${S.kb1}).`, mats: [mat("aug")] })],
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
      steps: [step({ do: `${steer ? `${mat(omen.key).label} + ` : ""}Exalted Orb → any ${side} (a throwaway).`, why: steer ? `The omen makes the Exalt add a ${side} (${S.kb4}).` : `Only a ${side} slot is open.`, mats })],
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
    steps: [step({ do: "Orb of Annulment until only the fractured mod remains.", why: `Every removable mod is a throwaway and the fractured one is immune (${S.kb2}).`, mats: [mat("annul")], check: "Only the fractured mod is left." })],
    uses: [useOf(mat("annul"), band(loose.length))],
    odds: exact(1, "every removable mod is a throwaway"),
    grade: "vp",
    checks: [{ state, rules: ["annul"] }],
  });
  return move ? [move] : [];
}

/** Fracture with ≥4 mods: P = 1/(mods − desecrated) (KB §2; uniform pick assumed, owner rule). */
function fracture(state: PlanState, ctx: PlanCtx): Move[] {
  if (state.rarity !== "Rare" || state.affixes.some((a) => a.kind === "fractured") || state.affixes.length < 4) return [];
  const out: Move[] = [];
  const eligible = state.affixes.filter((a) => a.kind !== "desecrated").length;
  for (const t of ctx.targets) {
    const a = present(state, t.idx);
    if (!t.fractured || !a || a.unrevealed || isMet(ctx, state, t.idx) || (a.kind !== "explicit" && a.kind !== "crafted")) continue;
    const p = 1 / eligible;
    const facts = [
      ...(a.kind === "crafted" ? ["a crafted mod can be fractured — creator footage only (KB §2, single-source)"] : []),
      ...(state.affixes.some((x) => x.unrevealed) ? ["an UNREVEALED desecrated blocker counting toward the 4 is creator-demonstrated (KB §2)"] : []),
    ];
    const next = withAffixes(state, state.affixes.map((x) => (x === a ? { ...x, kind: "fractured" as const, special: x.kind === "crafted" ? ("fractured-crafted" as const) : x.special } : x)));
    const spec: MoveSpec = {
      methodId: "fracture",
      title: `Fracture ${targetText(t.text)}`,
      next,
      steps: [
        step({
          do: "Fracturing Orb.",
          why: `Locks one random mod for good; desecrated mods count toward the 4 but can't be picked (${S.kb2}) — 1 in ${eligible} lands ${targetText(t.text)}.`,
          mats: [mat("fracturing")],
          check: `${targetText(t.text)} is FRACTURED.`,
          onFail: "Wrong mod fractured → one fracture per item, ever: start over on a new base (sell this one as it is).",
          retry: "start",
        }),
      ],
      uses: [once(mat("fracturing"))],
      odds: exact(p, `P = 1/${eligible} — ${state.affixes.length} mods, ${state.affixes.length - eligible} desecrated can't be fractured (${S.kb2}; uniform pick assumed)`, { mods: state.affixes.length, eligible }),
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
  { id: "strip-junk", order: 20, moves: stripJunk },
  { id: "plant-junk", order: 40, moves: plantJunk },
  { id: "fracture", order: 80, moves: fracture },
];
