import type { ClaimVerdict } from "../../../lib/claim";
import { MATS, type CraftMaterial, type MaterialKey } from "../../craftMaterials";
import type { AffixSide } from "../craftmoves/catalog";
import { KB } from "../craftmoves/ruleTypes";
import { band } from "./expectation";
import { isOverCap, legality } from "./state";
import type { Basis, Estimate, MaterialUse, Move, PlanCtx, PlanState, StepText } from "./types";

/** Helpers every method module shares: materials, currency tiers, grades and the legality-checked Move builder. */

export const mat = (key: MaterialKey): CraftMaterial => MATS[key];
export const once = (m: CraftMaterial): MaterialUse => ({ mat: m, qty: band(1) });

export interface CurrencyTier {
  label: string;
  key: MaterialKey;
  rule: string;
  /** KB-verified soft floor (KB §1), null = none. Planned only when the item level reaches it (KB §9). */
  floor: number | null;
}

export const EXALT_TIERS: readonly CurrencyTier[] = [
  { label: "Exalted Orb", key: "exalted", rule: "exalt", floor: null },
  { label: "Greater Exalted Orb", key: "greaterExalted", rule: "exalt-greater", floor: 35 },
  { label: "Perfect Exalted Orb", key: "perfectExalted", rule: "exalt-perfect", floor: 50 },
];

export const AUG_TIERS: readonly CurrencyTier[] = [
  { label: "Orb of Augmentation", key: "aug", rule: "aug", floor: null },
  { label: "Greater Orb of Augmentation", key: "greaterAug", rule: "aug-greater", floor: 44 },
  { label: "Perfect Orb of Augmentation", key: "perfectAug", rule: "aug-perfect", floor: 70 },
];

/** Transmutation tier matching each Augmentation tier (same KB §1 floors). */
export const TRANSMUTE_FOR_AUG: Record<string, CurrencyTier> = {
  aug: { label: "Orb of Transmutation", key: "transmute", rule: "transmute", floor: null },
  "aug-greater": { label: "Greater Orb of Transmutation", key: "greaterTransmute", rule: "transmute-greater", floor: 44 },
  "aug-perfect": { label: "Perfect Orb of Transmutation", key: "perfectTransmute", rule: "transmute-perfect", floor: 70 },
};

export const usableTier = (ctx: PlanCtx, t: CurrencyTier): boolean => t.floor == null || ctx.base.ilvl >= t.floor;

export const SIDE_WORD: Record<AffixSide, string> = { prefix: "prefix", suffix: "suffix" };
export const sideOmen = (side: AffixSide, family: "Exaltation" | "Annulment" | "Necromancy" | "Crystallisation" | "Erasure"): { key: MaterialKey; rule: string } => {
  const dir = side === "prefix" ? "Sinistral" : "Dextral";
  const key = `omen${dir}${family}`;
  if (!(key in MATS)) throw new Error(`planner bug: no material ${key}`);
  return { key: key as MaterialKey, rule: `omen-${dir.toLowerCase()}-${family.toLowerCase()}` };
};

const GRADE_RANK: Record<ClaimVerdict, number> = { vp: 0, vs: 1, syn: 2, ss: 3, cf: 4, uv: 5 };
export const worstGrade = (...grades: ClaimVerdict[]): ClaimVerdict => grades.reduce((a, b) => (GRADE_RANK[b] > GRADE_RANK[a] ? b : a), "vp");

export interface Check {
  state: PlanState;
  rules: readonly string[];
}

export interface MoveSpec {
  methodId: string;
  title: string;
  next: PlanState;
  steps: StepText[];
  uses: MaterialUse[];
  odds: Estimate;
  costBasis?: Basis;
  restartP?: number | null;
  grade: ClaimVerdict;
  coreUnknown?: boolean;
  /** Facts below "verified" the macro leans on — shown as the step's badge. */
  facts?: string[];
  /** Every click the macro makes, on the state it is made on: all must be legal (craftmoves rules). */
  checks: readonly Check[];
  /** The macro adds a mod: on an over-cap jewel that is unverified (KB §6 b), so its core is unknown. */
  adds?: boolean;
  undoRisk?: boolean;
}

const OVER_CAP_FACT = "Adding a mod to an over-cap jewel: whether the other side can still take one is untested.";

/** The Move, or null when a click is illegal or the macro's core is unknown and not admitted. */
export function makeMove(ctx: PlanCtx, spec: MoveSpec): Move | null {
  const overCap = spec.adds === true && spec.checks.length > 0 && isOverCap(ctx, spec.checks[0]!.state);
  const coreUnknown = (spec.coreUnknown ?? false) || overCap;
  if (coreUnknown && !ctx.includeUnverified) return null;
  const facts = [...(spec.facts ?? []), ...(overCap ? [OVER_CAP_FACT] : [])];
  let grade = spec.grade;
  const ruleIds = new Set<string>();
  for (const check of spec.checks) {
    const l = legality(ctx, check.state, check.rules);
    if (!l.ok) return null;
    for (const r of check.rules) ruleIds.add(r);
    if (l.unverified.length > 0) {
      facts.push(...l.unverified);
      grade = worstGrade(grade, "ss");
    }
  }
  return {
    methodId: spec.methodId,
    title: spec.title,
    next: spec.next,
    steps: spec.steps,
    uses: spec.uses,
    odds: spec.odds,
    costBasis: spec.costBasis ?? spec.odds.basis,
    restartP: spec.restartP ?? null,
    ruleIds: [...ruleIds],
    grade: coreUnknown ? "uv" : grade,
    coreUnknown,
    unverified: facts.length > 0 ? [...new Set(facts)].join(" · ") : null,
    undoRisk: spec.undoRisk ?? false,
  };
}

export function step(partial: Partial<StepText> & Pick<StepText, "do" | "why">): StepText {
  return { mats: [], check: null, pick: [], onFail: null, retry: null, sources: [], ...partial };
}

/** Short label for a target: its catalog text, ranges kept, joined onto one line. */
export const targetText = (text: string): string => text.split("\n").join(" / ");
