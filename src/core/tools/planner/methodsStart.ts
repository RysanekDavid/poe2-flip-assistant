import type { AffixSide } from "../craftmoves/catalog";
import { band, useOf } from "./expectation";
import { makeMove, mat, step, targetText } from "./methodKit";
import { startJunkRare } from "./methodsJewel";
import { exact } from "./odds";
import { sources } from "./sources";
import { canonical, junk, landAffix, SIDES } from "./state";
import type { BoughtStart, Move, PlanAffix, PlanCtx, PlanState, ResolvedTarget } from "./types";

/**
 * The search's start edges. A clean start is a Normal base, or a rare with a FRACTURED non-target
 * "anchor". A bought start is only planned when the player asks for it (owner rule 2026-10-06: never
 * assume a purchase silently): a rare carrying one wanted mod FRACTURED (the creators' high route),
 * or a magic base carrying one or two wanted mods. The base's price is the player's — the bill counts
 * only the work after it.
 */

const EMPTY: PlanState = { rarity: "Normal", affixes: [], quality: 0, catalyst: null };

function finishedCap(ctx: PlanCtx, side: AffixSide): number {
  if (ctx.base.jewel) return 2;
  return 3 + (side === "prefix" ? ctx.base.allowance.p : ctx.base.allowance.s);
}

/** "a; b" over the distinct wanted mods (pool slots share one text). */
const wantedText = (ctx: PlanCtx): string => [...new Set(ctx.targets.map((t) => targetText(t.text)))].join("; ");

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

const annulDown = (what: string) =>
  step({
    do: "Orb of Annulment until only the fractured mod and one other mod remain.",
    why: "Each Annulment removes a random mod; the fractured one is immune.",
    sources: sources("kb-fracture"),
    mats: [mat("annul")],
    check: `${what} plus exactly one loose mod.`,
  });

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
        do: `Buy a rare ${ctx.base.name}, item level ${ctx.base.ilvl}+, with a FRACTURED ${side} that is not a tier of any mod you want (${wantedText(ctx)}), and no crafted or desecrated mod.`,
        why: `The fractured mod can't be removed, so every later removal lands on the loose mods — and it fills a ${side} slot you don't need.`,
        sources: sources("kb-fracture"),
      }),
      annulDown(`The fractured ${side}`),
    ],
    // a fractured rare has 4–6 mods (the Fracturing Orb needs 4): 2–4 Annulments, 3 expected
    uses: [useOf(mat("annul"), band(3, 2, 4))],
    odds: exact(1, "each Annulment removes a loose mod (the fractured one is immune)"),
    grade: "vp",
    checks: [{ state: bought, rules: ["annul"] }],
  });
}

const PRICE_WHY = "You chose to buy this base; its price is yours to enter (the plan adds it to the total), the bill counts only the work after it.";

/** A rare carrying ONE wanted mod fractured, stripped to it + one loose mod (the creators' bought route). */
function boughtRare(ctx: PlanCtx, t: ResolvedTarget): Move | null {
  if (t.source !== "natural") return null;
  const carried = { ...landAffix(ctx, EMPTY, t.idx, "fractured") };
  const bought = canonical({ rarity: "Rare", affixes: [carried, junk("any"), junk("any"), junk("any")], quality: 0, catalyst: null });
  const next = canonical({ rarity: "Rare", affixes: [carried, junk("any")], quality: 0, catalyst: null });
  // a purchase names the exact minimum tiers: "one of these, this roll or better"
  const text = t.alts.length > 0 ? `one of these (this tier or better): ${t.alts.map((a) => targetText(a.text)).join("; ")}` : targetText(t.text);
  const start: BoughtStart = { rarity: "Rare", carried: [{ ref: t.idx, fractured: true }] };
  return makeMove(ctx, {
    methodId: "acquire-bought-rare",
    title: "Bought base",
    next,
    steps: [
      step({ do: `Buy a rare ${ctx.base.name}, item level ${ctx.base.ilvl}+, with FRACTURED ${text}, and no crafted or desecrated mod.`, why: `The fractured mod you want can't be removed or rolled away, so every later step works around it. ${PRICE_WHY}`, sources: sources("kb-fracture", "creators") }),
      annulDown(t.alts.length > 0 ? "The fractured pool mod" : `The fractured ${text}`),
    ],
    uses: [useOf(mat("annul"), band(3, 2, 4))],
    odds: exact(1, "each Annulment removes a loose mod (the fractured one is immune)"),
    grade: "vp",
    checks: [{ state: bought, rules: ["annul"] }],
    bought: start,
  });
}

/** A magic base carrying the wanted mods (one per side) and nothing else. */
function boughtMagic(ctx: PlanCtx, ts: readonly ResolvedTarget[]): Move | null {
  if (ts.some((t) => t.source !== "natural") || new Set(ts.map((t) => t.side)).size !== ts.length) return null;
  if (ctx.base.allowance.p !== 0 || ctx.base.allowance.s !== 0) return null;
  const affixes: PlanAffix[] = [];
  for (const t of ts) affixes.push(landAffix(ctx, { ...EMPTY, rarity: "Magic", affixes }, t.idx, "explicit"));
  const text = ts.map((t) => targetText(t.text)).join(" and ");
  return makeMove(ctx, {
    methodId: "acquire-bought-magic",
    title: "Bought base",
    next: canonical({ rarity: "Magic", affixes, quality: 0, catalyst: null }),
    steps: [step({ do: `Buy a magic ${ctx.base.name}, item level ${ctx.base.ilvl}+, with ${text} and no other mod.`, why: `A magic base that already rolled the mod${ts.length > 1 ? "s" : ""} you want. ${PRICE_WHY}`, sources: sources("creators") })],
    uses: [],
    odds: exact(1, "buying a base is not a gamble"),
    grade: "vp",
    checks: [],
    bought: { rarity: "Magic", carried: ts.map((t) => ({ ref: t.idx, fractured: false })) },
  });
}

/**
 * The planner's own pick: one start per wanted mod (a pool once) bought fractured; the search keeps
 * the cheapest. While another target must end up fractured, buying this one fractured would take
 * the item's only fracture, so it is no candidate.
 */
function boughtAuto(ctx: PlanCtx): Move[] {
  const otherFractured = (t: ResolvedTarget) => ctx.targets.some((x) => x.fractured && x.idx !== t.idx);
  const firsts = ctx.targets.filter((t) => (t.group == null || ctx.groups[t.group]!.slots[0] === t.idx) && !otherFractured(t));
  return firsts.map((t) => boughtRare(ctx, t)).filter((m): m is Move => m != null);
}

function boughtStarts(ctx: PlanCtx, carried: ReadonlyArray<{ ref: number; fractured: boolean }> | null): Move[] {
  if (carried == null) return boughtAuto(ctx);
  const ts = carried.map((c) => ctx.targets[c.ref]!);
  const move = carried.some((c) => c.fractured) ? boughtRare(ctx, ts[0]!) : boughtMagic(ctx, ts);
  return move ? [move] : [];
}

/** Why a bought start the player described can't be planned (empty = fine). */
export function startIssues(ctx: Pick<PlanCtx, "targets" | "base" | "start">): string[] {
  if (ctx.start.kind !== "bought" || ctx.start.carried == null) return [];
  const carried = ctx.start.carried;
  const ts = carried.map((c) => ctx.targets[c.ref]);
  if (ts.some((t) => t == null)) return ["the bought base carries a mod that isn't one of your targets"];
  const out: string[] = [];
  if (new Set(carried.map((c) => c.ref)).size !== carried.length) out.push("the same mod is carried twice");
  for (const t of ts) if (t!.source !== "natural") out.push(`"${targetText(t!.text)}" doesn't roll from currency — buy a base with an ordinary mod`);
  if (carried.some((c) => c.fractured) && carried.length > 1) out.push("a bought base with a fractured mod carries that one wanted mod here (the others are crafted on it)");
  if (!carried.some((c) => c.fractured)) {
    if (new Set(ts.map((t) => t!.side)).size !== ts.length) out.push("a magic base holds one prefix and one suffix");
    if (ctx.base.allowance.p !== 0 || ctx.base.allowance.s !== 0) out.push(`a magic ${ctx.base.name} isn't planned (its prefix/suffix allowance on magic items is unverified) — buy it fractured`);
  }
  const fr = carried.find((c) => c.fractured);
  if (fr && ctx.targets.some((x) => x.fractured && x.idx !== fr.ref)) out.push("another mod must end up fractured, and an item takes one fracture ever");
  return out;
}

export function startMoves(ctx: PlanCtx): Move[] {
  if (ctx.start.kind === "bought") return boughtStarts(ctx, ctx.start.carried);
  return [startNormal(ctx), ...SIDES.map((side) => startAnchored(ctx, side)), startJunkRare(ctx)].filter((m): m is Move => m != null);
}
