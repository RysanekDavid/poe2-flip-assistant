import type { AffixSide } from "../craftmoves/catalog";
import type { Affix, ItemState } from "../craftmoves/classify";
import { rolledLines } from "../craftmoves/outcome";
import { evaluateRules, type MoveRule } from "../craftmoves/rules";
import type { PlanAffix, PlanCtx, PlanSide, PlanState, ResolvedTarget } from "./types";

/**
 * Abstract item state: caps, slot counting, the canonical key the search dedups on, and the
 * projection into the rules engine's ItemState so every click a macro makes is checked by the SAME
 * legality oracle the Craft moves tool uses (craftmoves/rules.ts) — one rules engine, one citation.
 */

export const SIDES: readonly AffixSide[] = ["prefix", "suffix"];
export const otherSide = (side: AffixSide): AffixSide => (side === "prefix" ? "suffix" : "prefix");

// Rare Time-Lost jewels cap at 2 + 2: owner-tested 2026-10-02 (theory-gaps T6: trade listings +
// creator qATcKacI83o). The player-facing evidence label lives in targets.ts.

const SIDE_ORDER: Record<PlanSide, number> = { prefix: 0, suffix: 1, any: 2 };
const KIND_ORDER = { fractured: 0, explicit: 1, crafted: 2, desecrated: 3 } as const;

function compareAffix(a: PlanAffix, b: PlanAffix): number {
  return (
    SIDE_ORDER[a.side] - SIDE_ORDER[b.side] ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    (a.target ?? -1) - (b.target ?? -1) ||
    (a.alt ?? -1) - (b.alt ?? -1) ||
    Number(a.unrevealed) - Number(b.unrevealed) ||
    (a.special ?? "").localeCompare(b.special ?? "")
  );
}

export function canonical(state: PlanState): PlanState {
  return { ...state, affixes: [...state.affixes].sort(compareAffix), catalyst: state.quality > 0 ? state.catalyst : null };
}

/** Dedup key: two states with the same key are the same abstract item. */
export function stateKey(state: PlanState): string {
  const mods = state.affixes.map((a) => `${a.side[0]}${a.kind[0]}${a.target ?? "j"}${a.alt != null ? `.${a.alt}` : ""}${a.unrevealed ? "u" : ""}${a.special ? `:${a.special}` : ""}`);
  return `${state.rarity[0]}|q${state.quality}${state.catalyst ? `:${state.catalyst}` : ""}|${mods.join(",")}`;
}

export const junk = (side: PlanSide, kind: PlanAffix["kind"] = "explicit", special: PlanAffix["special"] = null): PlanAffix => ({
  side,
  kind,
  target: null,
  alt: null,
  unrevealed: false,
  special,
});

/** A target affix; a pool slot also needs the candidate that landed (`alt`) — landAffix picks it. */
export const targetAffix = (side: AffixSide, target: number, kind: PlanAffix["kind"], alt: number | null = null): PlanAffix => ({
  side,
  kind,
  target,
  alt,
  unrevealed: false,
  special: null,
});

/** The concrete mod an affix holds: the target itself, or the pool candidate that landed. */
export function modOf(ctx: PlanCtx, a: PlanAffix): ResolvedTarget {
  const t = ctx.targets[a.target!]!;
  if (t.alts.length === 0) return t;
  const m = a.alt == null ? undefined : t.alts[a.alt];
  if (!m) throw new Error(`planner bug: pool slot ${t.idx} holds no candidate`);
  return m;
}

/** Mod groups of every target mod on the item (a mod group holds one mod per item). */
export function presentModGroups(ctx: PlanCtx, state: PlanState): Set<string> {
  return new Set(state.affixes.flatMap((a) => (a.target == null ? [] : modOf(ctx, a).groups)));
}

/**
 * Candidates (alt indices) a pool slot can still land: not already on the item in another slot of
 * the pool, and not blocked by a mod group the item holds. Likeliest first (the alts' order).
 */
export function eligibleAlts(ctx: PlanCtx, state: PlanState, idx: number): number[] {
  const t = ctx.targets[idx]!;
  const taken = new Set(state.affixes.filter((a) => a.target != null && ctx.targets[a.target]!.group === t.group && t.group != null).map((a) => a.alt));
  const blocked = presentModGroups(ctx, state);
  return t.alts.flatMap((m, i) => (taken.has(i) || m.groups.some((g) => blocked.has(g)) ? [] : [i]));
}

/** The concrete mods that count as landing `t`: the target, or a pool slot's still-possible candidates. */
export function acceptedMods(ctx: PlanCtx, state: PlanState, t: ResolvedTarget): ResolvedTarget[] {
  return t.alts.length === 0 ? [t] : eligibleAlts(ctx, state, t.idx).map((a) => t.alts[a]!);
}

/**
 * A missing target a method may aim at now: a single mod, or the FIRST missing slot of a pool with a
 * candidate left (one aim per pool: two missing slots of one pool are the same "any of" roll).
 */
export function aimable(ctx: PlanCtx, state: PlanState, t: ResolvedTarget): boolean {
  if (present(state, t.idx)) return false;
  if (t.group == null) return true;
  const first = ctx.groups[t.group]!.slots.find((s) => !present(state, s));
  return first === t.idx && eligibleAlts(ctx, state, t.idx).length > 0;
}

/** The affix a random add that hits `idx` leaves: a pool slot holds its first still-possible candidate. */
export function landAffix(ctx: PlanCtx, state: PlanState, idx: number, kind: PlanAffix["kind"]): PlanAffix {
  const t = ctx.targets[idx]!;
  if (t.alts.length === 0) return targetAffix(t.side, idx, kind);
  const alt = eligibleAlts(ctx, state, idx)[0];
  if (alt == null) throw new Error(`planner bug: pool slot ${idx} has no candidate left`);
  return targetAffix(t.side, idx, kind, alt);
}

/** Add one landed target to the item (canonical order kept). */
export const withLanded = (ctx: PlanCtx, state: PlanState, idx: number, kind: PlanAffix["kind"], patch: Partial<PlanState> = {}): PlanState =>
  withAffixes(state, [...state.affixes, landAffix(ctx, state, idx, kind)], patch);

export function sideCount(state: PlanState, side: AffixSide): number {
  return state.affixes.filter((a) => a.side === side).length;
}

export const anyJunkCount = (state: PlanState): number => state.affixes.filter((a) => a.side === "any").length;

/**
 * Rarity caps plus the base's signed implicit allowance and Contempt's crafted allowance. Magic
 * items on an allowance base are not planned (KB §3 leaves that cap unverified).
 */
export function capOf(ctx: PlanCtx, state: PlanState): { p: number; s: number } {
  if (state.rarity === "Normal") return { p: 0, s: 0 };
  if (state.rarity === "Magic") return { p: 1, s: 1 };
  if (ctx.base.jewel) {
    const extraP = state.affixes.filter((a) => a.special === "contempt-prefix").length;
    const extraS = state.affixes.filter((a) => a.special === "contempt-suffix").length;
    return { p: 2 + extraP, s: 2 + extraS };
  }
  return { p: 3 + ctx.base.allowance.p, s: 3 + ctx.base.allowance.s };
}

/** A basic jewel holding more mods on a side than its cap (the stripped-Contempt end state, KB §6 b). */
export function isOverCap(ctx: PlanCtx, state: PlanState): boolean {
  if (!ctx.base.jewel || state.rarity !== "Rare") return false;
  const cap = capOf(ctx, state);
  return sideCount(state, "prefix") > cap.p || sideCount(state, "suffix") > cap.s;
}

/** Provably open slots on a side: "any"-side junk is counted against BOTH sides (pessimistic). */
export function openOf(ctx: PlanCtx, state: PlanState, side: AffixSide): number {
  const cap = capOf(ctx, state);
  return Math.max(0, (side === "prefix" ? cap.p : cap.s) - sideCount(state, side) - anyJunkCount(state));
}

export const removable = (state: PlanState): PlanAffix[] => state.affixes.filter((a) => a.kind !== "fractured");
export const removableOn = (state: PlanState, side: AffixSide): PlanAffix[] => removable(state).filter((a) => a.side === side);
export const isJunk = (a: PlanAffix): boolean => a.target == null;

export const hasKind = (state: PlanState, kind: PlanAffix["kind"]): boolean => state.affixes.some((a) => a.kind === kind);
/** A fractured mod that was crafted still holds the crafted slot (theory-gaps round 2 (4)). */
export const craftedSlotUsed = (state: PlanState): boolean => hasKind(state, "crafted") || state.affixes.some((a) => a.special === "fractured-crafted");

export function isMet(ctx: PlanCtx, state: PlanState, idx: number): boolean {
  const t = ctx.targets[idx]!;
  return state.affixes.some((a) => a.target === idx && !a.unrevealed && (!t.fractured || a.kind === "fractured"));
}

export function present(state: PlanState, idx: number): PlanAffix | undefined {
  return state.affixes.find((a) => a.target === idx);
}

export function allMet(ctx: PlanCtx, state: PlanState): boolean {
  if (!ctx.targets.every((t) => isMet(ctx, state, t.idx))) return false;
  const q = ctx.quality;
  return q == null || (state.catalyst === q.catalyst && state.quality >= q.pct);
}

export function withAffixes(state: PlanState, affixes: readonly PlanAffix[], patch: Partial<PlanState> = {}): PlanState {
  return canonical({ ...state, ...patch, affixes });
}

/** Remove exactly one affix instance (reference equality). */
export function without(state: PlanState, gone: PlanAffix): PlanAffix[] {
  const i = state.affixes.indexOf(gone);
  if (i < 0) throw new Error("planner bug: removing an affix the state does not hold");
  return [...state.affixes.slice(0, i), ...state.affixes.slice(i + 1)];
}

function projectAffix(ctx: PlanCtx, a: PlanAffix, anySide: AffixSide): Affix {
  const t = a.target == null ? null : modOf(ctx, a);
  const mod = t ? ctx.cat.mods[t.modId] : undefined;
  const side = a.side === "any" ? anySide : a.side;
  return {
    lines: mod ? rolledLines(mod.text) : [`(a ${side} mod)`],
    kind: a.kind,
    side,
    family: t?.family ?? null,
    modId: t?.modId ?? null,
    level: t?.level ?? null,
    tier: null,
    unrevealed: a.unrevealed,
    note: null,
  };
}

/**
 * The rules engine's view of an abstract state. Open counts are set from capOf/openOf directly (the
 * projection is provable by construction); "any" junk is placed on the roomier side for display.
 */
export function projectToItemState(ctx: PlanCtx, state: PlanState): ItemState {
  const cap = capOf(ctx, state);
  const anySide: AffixSide = cap.p - sideCount(state, "prefix") >= cap.s - sideCount(state, "suffix") ? "prefix" : "suffix";
  const affixes = state.affixes.map((a) => projectAffix(ctx, a, anySide));
  const count = (side: AffixSide) => affixes.filter((a) => a.side === side).length;
  const openP = openOf(ctx, state, "prefix");
  const openS = openOf(ctx, state, "suffix");
  return {
    rarity: state.rarity,
    itemClass: ctx.base.itemClass,
    baseType: ctx.base.name,
    ilvl: ctx.base.ilvl,
    quality: state.quality,
    // the Essence of the Breach mod "+20% to Maximum Quality" raises the cap while it is on the item
    maxQuality: ctx.base.qualityCap == null ? null : ctx.base.qualityCap + 20 * state.affixes.filter((a) => a.special === "breach-quality").length,
    corrupted: false,
    mirrored: false,
    unidentified: false,
    jewel: ctx.base.jewel,
    timeLost: ctx.base.timeLost,
    affixes,
    prefixes: count("prefix"),
    suffixes: count("suffix"),
    capacity: { p: cap.p, s: cap.s, total: cap.p + cap.s },
    openPrefixes: openP,
    openSuffixes: openS,
    openTotal: openP + openS,
    slots: {
      crafted: affixes.filter((a) => a.kind === "crafted").length,
      desecrated: affixes.filter((a) => a.kind === "desecrated").length,
      fractured: affixes.filter((a) => a.kind === "fractured").length,
      unrevealed: affixes.filter((a) => a.unrevealed).length,
    },
    unmatched: [],
    flags: [],
  };
}

export interface Legality {
  ok: boolean;
  /** First blocked or missing rule with its reason. */
  blocked: string | null;
  /** Rules that passed but are not KB-verified, with the rule's unverified note. */
  unverified: string[];
}

/** Every rule id must be a LEGAL move on the projected state (the planner never invents legality). */
export function legality(ctx: PlanCtx, state: PlanState, ruleIds: readonly string[], rules?: readonly MoveRule[]): Legality {
  const ev = evaluateRules(projectToItemState(ctx, state), rules);
  if (ev.locked) return { ok: false, blocked: ev.locked, unverified: [] };
  const unverified: string[] = [];
  for (const id of ruleIds) {
    const move = ev.moves.find((m) => m.id === id);
    if (!move) {
      const block = ev.blocked.find((b) => b.id === id);
      return { ok: false, blocked: block ? `${id}: ${block.reason}` : `${id}: not a legal move here`, unverified: [] };
    }
    // the rule's source names KB files: keep it for developers, show the player plain words
    if (!move.verified) unverified.push(`${move.label} isn't confirmed by game data or patch notes yet.`);
  }
  return { ok: true, blocked: null, unverified };
}
