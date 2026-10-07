import type { CraftMaterial, MaterialKey } from "../../craftMaterials";
import type { AffixSide } from "../craftmoves/catalog";
import { FACTION_OMENS, type FactionOmen } from "../craftmoves/ruleTableAbyss";
import { attemptsOf, failuresOf, scaleBand, useOf } from "./expectation";
import { makeMove, mat, once, sideOmen, step, targetText, type MoveSpec } from "./methodKit";
import { rankCost } from "./rank";
import { JEWEL_REVEAL_ASSUMPTION, JEWEL_REVEAL_TEST, revealOdds, type BoneKind, type RevealOdds } from "./reveal";
import { sources, type SourceId } from "./sources";
import { exact } from "./odds";
import { acceptedMods, aimable, hasKind, isMet, junk, landAffix, openOf, present, SIDES, withAffixes, withLanded, without } from "./state";
import type { Method, Move, PlanCtx, PlanState, ResolvedTarget } from "./types";

/**
 * Desecration as a way to land a wanted mod: bone + side Necromancy (+ the faction omen for a Lich
 * target: Liege → Amanamu, Sovereign → Ulaman, Blackblooded → Kurgal) → reveal at the Well of Souls; not offered → Omen of Abyssal Echoes once (a
 * variant, kept when it is cheaper) → still not → pick any, Omen of Light + Annulment strips only
 * the desecrated mod → the next bone. Works for desecrated-pool targets and, since the Well's
 * options include the base's ordinary mods, for ordinary ones too (attack flats on rings, every
 * creator's last prefix). One desecrated mod per item (KB §5), so this lands one target at most.
 * Also: the fracture blocker (an unrevealed desecrated throwaway) and its removal.
 */

/** The bone that desecrates each planner class (the UI shows its art on desecrated-pool mods). */
export const BONE: Readonly<Record<string, MaterialKey>> = { Rings: "preservedCollarbone", Amulets: "preservedCollarbone", Belts: "preservedCollarbone", Jewels: "preservedCranium" };
/** Ancient bones (modifier level 40+); jewels have none (no Ancient Cranium). */
const ANCIENT_BONE: Readonly<Record<string, MaterialKey>> = { Rings: "ancientCollarbone", Amulets: "ancientCollarbone", Belts: "ancientCollarbone" };
const TIME_LOST_DESECRATION = "Desecrating a Time-Lost jewel: no source names Time-Lost jewels.";
const ORDINARY_AT_WELL =
  "Ordinary mods at the Well: poe2db says reveals \"may include base modifiers\" and creators reveal them on screen; how the Well picks its three options (one always a faction mod at item level 65+) is not documented.";
// jewels have no faction mods, so the jewellery parenthetical above would mislead there
const ORDINARY_AT_JEWEL_WELL = "Ordinary mods at the Well: poe2db says reveals \"may include base modifiers\" and creators reveal them on screen; how the Well picks its three options is not documented.";
const JEWEL_REVEAL = `Jewel reveals: the planner ${JEWEL_REVEAL_ASSUMPTION}. ${JEWEL_REVEAL_TEST}`;

interface Desecration {
  bone: CraftMaterial;
  boneRule: string;
  omen: { key: MaterialKey; rule: string };
  coreUnknown: boolean;
}

/**
 * Always side-steered: which side an unsteered bone picks when only one side is open is not in the
 * KB, and on a FULL side it removes a random mod there (KB §5) — Necromancy makes it certain.
 */
function desecration(ctx: PlanCtx, state: PlanState, side: AffixSide, bone: BoneKind): Desecration | null {
  const key = bone === "ancient" ? ANCIENT_BONE[ctx.base.itemClass] : BONE[ctx.base.itemClass];
  if (!key || state.rarity !== "Rare" || hasKind(state, "desecrated") || openOf(ctx, state, side) < 1) return null;
  return { bone: mat(key), boneRule: `bone-${bone}`, omen: sideOmen(side, "Necromancy"), coreUnknown: ctx.base.timeLost };
}

interface Variant {
  bone: BoneKind;
  echoes: boolean;
  /** The Lich omen forcing the target's faction; null = unsteered. */
  factionOmen: FactionOmen | null;
}

/**
 * The faction omen for a Lich target: the item text reads "Weapon or Jewellery Desecration", and
 * poe2wiki says it does nothing on jewels — so never on a jewel.
 */
function factionOmenFor(ctx: PlanCtx, t: ResolvedTarget): FactionOmen | null {
  return t.faction != null && ctx.base.itemClass !== "Jewels" ? FACTION_OMENS[t.faction] : null;
}

/** A desecrated-pool target keeps its one route (Preserved + Echoes, its faction omen); an ordinary one may use either bone, with or without Echoes. */
function variantsFor(ctx: PlanCtx, t: ResolvedTarget): Variant[] {
  if (t.source === "desecrated") return [{ bone: "preserved", echoes: true, factionOmen: factionOmenFor(ctx, t) }];
  return (["preserved", "ancient"] as const).flatMap((bone) => [false, true].map((echoes) => ({ bone, echoes, factionOmen: null })));
}

/**
 * An ordinary mod is desecrated only as the last one its side still needs (what every creator
 * does): a desecrated mod on a side stops that side's slams, Chaos and Erasure loops (they could
 * take it), and the item holds one — earlier, it only blocks the cheaper methods. Desecrated-pool
 * targets keep any order.
 */
function lastOnSide(ctx: PlanCtx, state: PlanState, t: ResolvedTarget): boolean {
  if (t.source === "desecrated") return true;
  return ctx.targets.filter((x) => x.side === t.side && x.idx !== t.idx && !present(state, x.idx)).length === 0;
}

/**
 * Every variant lands the same mod on the same item, so only the cheapest (by the search's own edge
 * cost) is offered — "Echoes when it is cheaper", the bone likewise; the next one is tried only when
 * the cheapest is not a legal click.
 */
function desecrateLoop(state: PlanState, ctx: PlanCtx): Move[] {
  const out: Move[] = [];
  for (const t of ctx.targets) {
    if (t.source === "essence" || t.fractured || !aimable(ctx, state, t) || !lastOnSide(ctx, state, t)) continue;
    const specs: MoveSpec[] = [];
    for (const bone of ["preserved", "ancient"] as const) {
      const d = desecration(ctx, state, t.side, bone);
      const vs = variantsFor(ctx, t).filter((v) => v.bone === bone);
      const odds = d && vs.length > 0 ? revealOdds(ctx, state, t, { factionOmen: vs[0]!.factionOmen != null, bone }) : null;
      if (d && odds) specs.push(...vs.map((v) => desecrateSpec(state, ctx, t, d, v, odds)));
    }
    specs.sort((a, b) => rankCost(a, ctx) - rankCost(b, ctx));
    for (const spec of specs) {
      const move = makeMove(ctx, spec);
      if (move) {
        out.push(move);
        break;
      }
    }
  }
  return out;
}

/** desecrate-liege | -sovereign | -blackblooded: the omen rule's suffix ("omen-liege" → "liege"), so "desecrate-liege" stays stable. */
const methodIdOf = (t: ResolvedTarget, v: Variant): string =>
  t.source === "desecrated" ? `desecrate${v.factionOmen ? `-${v.factionOmen.rule.replace(/^omen-/, "")}` : ""}` : `desecrate-${v.bone}${v.echoes ? "-echoes" : ""}`;

/** Creators' Omen of Light count for a ring prefix aimed at attack flats (the curated anchor), as player prose. */
function anchorNote(ctx: PlanCtx, state: PlanState, t: ResolvedTarget): string {
  const a = ctx.reveal.lightAnchor;
  const flats = acceptedMods(ctx, state, t).some((m) => m.tags.includes("attack"));
  if (!a || ctx.base.itemClass !== "Rings" || t.side !== "prefix" || !flats) return "";
  return ` Creators land a top attack flat or rarity on a ring prefix in usually under ${a.point} Omens of Light, ${a.high} at most (${a.basis}).`;
}

function desecrateSteps(ctx: PlanCtx, state: PlanState, t: ResolvedTarget, d: Desecration, v: Variant, slam: CraftMaterial[]) {
  const ordinary = t.source !== "desecrated";
  const label = targetText(t.text);
  const steps = [
    step({
      do: `${slam.map((m) => m.label).join(" + ")} on the open ${t.side}, then reveal at the Well of Souls.`,
      why: `Necromancy puts the desecrated mod on the ${t.side}; ${v.factionOmen ? `${v.factionOmen.name} guarantees one ${v.factionOmen.lich} mod among the options; ` : ""}an open slot means nothing is removed.${ordinary ? ` The three options can be ordinary ${t.side}es too — pick ${label}.` : ""}${v.bone === "ancient" ? " An Ancient bone only reveals modifier level 40+, so low tiers drop out." : ""}`,
      sources: sources("kb-omens", "kb-desecration", ...(ordinary ? (["poe2db", "creators"] as SourceId[]) : [])),
      mats: slam,
      pick: [label],
    }),
  ];
  if (v.echoes) {
    steps.push(step({
      do: "Not offered → Omen of Abyssal Echoes rerolls the three options once.",
      why: "One reroll, not a guarantee. Arm it before the first reveal; arming it after a reveal can eat it unused (forum 3861139).",
      sources: sources("kb-omens", "forum"),
      mats: [mat("omenAbyssalEchoes")],
      pick: [label],
    }));
  }
  steps.push(step({
    do: `${v.echoes ? "Still not" : "Not"} offered → pick any, then Omen of Light + Orb of Annulment strips only the desecrated mod.`,
    why: `Light makes the Annulment remove only desecrated mods — the slot is free for a new bone.${ordinary ? anchorNote(ctx, state, t) : ""}`,
    sources: ordinary ? sources("kb-omens", "creators") : [],
    mats: [mat("omenLight"), mat("annul")],
    onFail: "Back to the bone.",
    retry: "self",
    check: `${label} revealed on the item.`,
  }));
  return steps;
}

/** The item text never names belts: a creator video is the evidence, or none for an omen nobody showed there. */
const beltFact = (o: FactionOmen): string =>
  o.beltShownBy ? `${o.name} on belts: seen in one creator video only (${o.beltShownBy}).` : `${o.name} on belts: no source shows it; assumed from its twins' identical "Weapon or Jewellery" text.`;

function desecrateSpec(state: PlanState, ctx: PlanCtx, t: ResolvedTarget, d: Desecration, v: Variant, odds: RevealOdds): MoveSpec {
  const e = v.echoes ? odds.withEchoes : odds.once;
  const slam = [mat(d.omen.key), ...(v.factionOmen ? [mat(v.factionOmen.key)] : []), d.bone];
  const unrevealed = withAffixes(state, [...state.affixes, { ...landAffix(ctx, state, t.idx, "desecrated"), unrevealed: true }]);
  const revealedJunk = withAffixes(state, [...state.affixes, junk(t.side, "desecrated")]);
  const ordinary = t.source !== "desecrated";
  const facts = [
    ...(ctx.base.itemClass === "Belts" && v.factionOmen ? [beltFact(v.factionOmen)] : []),
    ...(d.coreUnknown ? [TIME_LOST_DESECRATION] : []),
    ...(ordinary ? [ctx.base.jewel ? ORDINARY_AT_JEWEL_WELL : ORDINARY_AT_WELL] : []),
    ...(ctx.base.jewel ? [JEWEL_REVEAL] : []),
  ];
  return {
    methodId: methodIdOf(t, v),
    title: `Desecrated ${targetText(t.text)}`,
    next: withLanded(ctx, state, t.idx, "desecrated"),
    steps: desecrateSteps(ctx, state, t, d, v, slam),
    uses: [
      ...slam.map((m) => useOf(m, attemptsOf(e))),
      ...(v.echoes ? [useOf(mat("omenAbyssalEchoes"), scaleBand(attemptsOf(e), 1 - odds.first))] : []),
      useOf(mat("omenLight"), failuresOf(e)),
      useOf(mat("annul"), failuresOf(e)),
    ],
    odds: e,
    grade: ordinary ? "ss" : "vp",
    adds: true,
    coreUnknown: d.coreUnknown,
    facts,
    checks: [
      { state, rules: [d.boneRule, d.omen.rule, ...(v.factionOmen ? [v.factionOmen.rule] : [])] },
      ...(v.echoes ? [{ state: unrevealed, rules: ["omen-abyssal-echoes"] }] : []),
      { state: revealedJunk, rules: ["omen-light"] },
    ],
  };
}

/**
 * A fracture is coming: a target the player wants fractured, or — the self-fracture (Alohaa, KB §2) —
 * an unfractured 3-mod item holding a landed target the Fracturing Orb can lock (explicit or crafted,
 * revealed: the same keepers as methodsPrep fracture()) while another natural target is still
 * missing (the blocker makes the 4th mod; fracturing the last target would protect nothing).
 */
function fracturePending(state: PlanState, ctx: PlanCtx): boolean {
  if (hasKind(state, "fractured")) return false;
  if (ctx.targets.some((t) => t.fractured)) return true;
  if (state.affixes.length !== 3) return false;
  const lockable = state.affixes.filter((a) => a.target != null && !a.unrevealed && (a.kind === "explicit" || a.kind === "crafted"));
  return lockable.some((a) => ctx.targets.some((t) => t.idx !== a.target && t.source === "natural" && !isMet(ctx, state, t.idx)));
}

/** An UNREVEALED desecrated throwaway: counts toward the Fracturing Orb's 4 mods, can't be fractured (KB §2). */
function blocker(state: PlanState, ctx: PlanCtx): Move[] {
  if (!fracturePending(state, ctx) || ctx.targets.some((t) => t.source === "desecrated")) return [];
  const out: Move[] = [];
  for (const side of SIDES) {
    const d = desecration(ctx, state, side, "preserved");
    if (!d) continue;
    const mats = [mat(d.omen.key), d.bone];
    const move = makeMove(ctx, {
      methodId: `blocker-${side}`,
      title: "Fracture blocker",
      next: withAffixes(state, [...state.affixes, { ...junk(side, "desecrated"), unrevealed: true }]),
      steps: [step({ do: `${mats.map((m) => m.label).join(" + ")} → a desecrated ${side}; leave it UNREVEALED.`, why: "It counts toward the Fracturing Orb's 4 mods but can't be fractured, so the fracture odds improve.", mats, sources: sources("kb-fracture", "creators") })],
      uses: mats.map(once),
      odds: exact(1, "any desecrated mod blocks"),
      grade: "ss",
      adds: true,
      coreUnknown: d.coreUnknown,
      facts: ["An unrevealed desecrated mod counting toward the 4 is shown in creator videos, not confirmed by game data."],
      checks: [{ state, rules: ["bone-preserved", d.omen.rule] }],
    });
    if (move) out.push(move);
  }
  return out;
}

/** A throwaway desecrated mod (the spent fracture blocker) → Omen of Light + Annulment frees the one desecrated slot. */
function stripDesecrated(state: PlanState, ctx: PlanCtx): Move[] {
  const gone = state.affixes.find((a) => a.kind === "desecrated" && a.target == null);
  const wantsOne = ctx.targets.some((t) => t.source !== "essence" && !t.fractured && !present(state, t.idx));
  if (state.rarity !== "Rare" || !gone || !wantsOne) return [];
  const move = makeMove(ctx, {
    methodId: "strip-desecrated",
    title: "Clear the desecrated slot",
    next: withAffixes(state, without(state, gone)),
    steps: [step({ do: "Omen of Light + Orb of Annulment → removes the desecrated throwaway.", why: "Light makes the Annulment remove only desecrated mods, so nothing else goes; an item holds one desecrated mod, and this frees it for the next bone.", mats: [mat("omenLight"), mat("annul")], sources: sources("kb-omens", "kb-desecration") })],
    uses: [once(mat("omenLight")), once(mat("annul"))],
    odds: exact(1, "the only desecrated mod is the throwaway"),
    grade: gone.unrevealed ? "ss" : "vp",
    facts: gone.unrevealed ? ["Omen of Light taking an UNREVEALED desecrated mod is our reading of its text (\"remove only Desecrated modifiers\"); creators strip the blocker without naming how."] : [],
    checks: [{ state, rules: ["omen-light"] }],
  });
  return move ? [move] : [];
}

export const DESECRATE_METHODS: readonly Method[] = [
  { id: "desecrate", order: 60, moves: desecrateLoop },
  { id: "strip-desecrated", order: 62, moves: stripDesecrated },
  { id: "blocker", order: 75, moves: blocker },
];
