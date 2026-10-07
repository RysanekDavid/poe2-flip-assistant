/*
 * Planner plan → golden route tags (goldenSchema GOLDEN_TAGS), so craft:eval can compare the
 * planner's route with a creator's. A step's tags are its macro method's tags (METHOD_TAGS, one row
 * per planner method) plus what its materials say that the method id does not (which Exalt tier,
 * which omen). A step method id no pattern knows throws: a new planner method must be mapped here
 * before the scoreboard can run, or its route would silently score as "no overlap".
 */
import type { PlanStepView } from "../../../lib/tools/craftPlannerContract";
import type { GoldenTag } from "./goldenSchema";
import { PLANNER_METHOD_IDS, type PlannerMethodId } from "./schemaParts";

/** Start moves (methodsStart.ts, methodsJewel.ts startJunkRare): the search seeds them, so they are not in ALL_METHODS. */
export const START_METHOD_IDS = ["acquire-normal", "acquire-anchored", "acquire-bought-rare", "acquire-bought-magic", "acquire-rare-junk"] as const;
export type StartMethodId = (typeof START_METHOD_IDS)[number];
export type MacroMethodId = PlannerMethodId | StartMethodId;

export const MACRO_METHOD_IDS: readonly MacroMethodId[] = [...PLANNER_METHOD_IDS, ...START_METHOD_IDS];

/** Every macro method → the route tags it always means. The Record type makes a missing method a compile error. */
export const METHOD_TAGS: Readonly<Record<MacroMethodId, readonly GoldenTag[]>> = {
  "magic-loop": ["magic-loop"],
  "magic-aug-filler": ["magic-loop"],
  regal: ["regal"],
  // Transmute then Regal onto a Normal base: two throwaway mods, no Augment loop
  "transmute-regal": ["regal"],
  // Alchemy then three Annulments: one throwaway left; no golden tag names Alchemy
  "alchemy-strip": ["annul"],
  "strip-junk": ["annul"],
  // a throwaway Exalt slam: its Exalt tier and side omen come from its materials
  "plant-junk": [],
  fracture: ["fracture-target"],
  "chaos-loop": ["chaos-loop"],
  "erasure-loop": ["erasure"],
  "whittle-loop": ["whittle"],
  // the Exalt tier, side omen, Annulment and catalysts come from its materials
  "slam-fill": [],
  "strip-side": ["annul"],
  contempt: ["liquid"],
  "strip-contempt": ["annul"],
  "breach-quality": ["essence"],
  "catalyse-finish": ["catalyse"],
  "essence-greater": ["essence"],
  "essence-perfect": ["essence"],
  alloy: ["alloy"],
  desecrate: ["desecrate"],
  "strip-desecrated": ["omen-light", "annul"],
  blocker: ["desecrate"],
  "acquire-normal": [],
  "acquire-anchored": ["bought-base", "anchored-junk"],
  "acquire-bought-rare": ["bought-base", "fracture-target"],
  "acquire-bought-magic": ["bought-base"],
  "acquire-rare-junk": ["bought-base"],
};

/**
 * Step method ids are variants of a macro (methodsFill.ts `slam-${side}-${rule}`, methodsWrite.ts
 * `essence-perfect:${id}:${steer}`, `alloy:${id}:${steer}`, …). Each pattern is anchored; exactly one must match.
 */
export const STEP_PATTERNS: ReadonlyArray<readonly [RegExp, MacroMethodId]> = [
  [/^magic-loop-aug(?:-greater|-perfect)?$/, "magic-loop"],
  [/^magic-aug-filler$/, "magic-aug-filler"],
  [/^regal$/, "regal"],
  [/^transmute-regal$/, "transmute-regal"],
  [/^alchemy-strip$/, "alchemy-strip"],
  [/^strip-junk$/, "strip-junk"],
  [/^plant-junk-(?:prefix|suffix|any)$/, "plant-junk"],
  [/^fracture$/, "fracture"],
  [/^chaos-loop$/, "chaos-loop"],
  [/^erasure-loop-(?:prefix|suffix)$/, "erasure-loop"],
  [/^whittle-loop$/, "whittle-loop"],
  [/^slam-(?:prefix|suffix)-exalt(?:-greater|-perfect)?(?:-catalysing)?$/, "slam-fill"],
  [/^strip-(?:prefix|suffix)$/, "strip-side"],
  [/^contempt-(?:prefix|suffix)$/, "contempt"],
  [/^strip-contempt$/, "strip-contempt"],
  [/^breach-quality(?::(?:prefix|suffix))?$/, "breach-quality"],
  [/^catalyse-finish$/, "catalyse-finish"],
  [/^essence-greater:[a-z0-9-]+$/, "essence-greater"],
  [/^essence-perfect:[a-z0-9-]+(?::(?:prefix|suffix))?$/, "essence-perfect"],
  [/^alloy:[a-z0-9-]+(?::(?:prefix|suffix))?$/, "alloy"],
  [/^desecrate(?:-liege|-(?:preserved|ancient)(?:-echoes)?)?$/, "desecrate"],
  [/^strip-desecrated$/, "strip-desecrated"],
  [/^blocker-(?:prefix|suffix)$/, "blocker"],
  [/^acquire-normal$/, "acquire-normal"],
  [/^acquire-anchored-(?:prefix|suffix)$/, "acquire-anchored"],
  [/^acquire-bought-rare$/, "acquire-bought-rare"],
  [/^acquire-bought-magic$/, "acquire-bought-magic"],
  [/^acquire-rare-junk$/, "acquire-rare-junk"],
];

/** Materials whose use names a route tag the method id leaves open (by planner material id). */
export const MATERIAL_TAGS: Readonly<Record<string, GoldenTag>> = {
  "greater-exalted-orb": "greater-exalt",
  "perfect-exalted-orb": "perfect-exalt",
  "omen-of-sinistral-exaltation": "exalt-omen-side",
  "omen-of-dextral-exaltation": "exalt-omen-side",
  "omen-of-catalysing-exaltation": "catalyse",
  annul: "annul",
  "omen-of-sinistral-annulment": "annul",
  "omen-of-dextral-annulment": "annul",
  "omen-of-light": "omen-light",
  "omen-of-abyssal-echoes": "omen-echoes",
  "omen-of-whittling": "whittle",
  "omen-of-sinistral-erasure": "erasure",
  "omen-of-dextral-erasure": "erasure",
  regal: "regal",
  "greater-regal-orb": "regal",
  "perfect-regal-orb": "regal",
  "transcendent-alloy": "alloy",
  "celestial-alloy": "alloy",
  "swift-alloy": "alloy",
  "mystic-alloy": "alloy",
  "runic-alloy": "alloy",
  "protective-alloy": "alloy",
  "sovereign-alloy": "alloy",
};

/** Whole material groups that name a tag (planMaterialSchema group). */
const GROUP_TAGS: Readonly<Partial<Record<PlanStepView["materials"][number]["group"], GoldenTag>>> = {
  catalyst: "catalyse",
  essence: "essence",
  delirium: "liquid",
  bone: "desecrate",
};

/** The macro method a step's method id belongs to; throws on an id no pattern (or more than one) matches. */
export function macroOf(stepMethodId: string): MacroMethodId {
  const hits = STEP_PATTERNS.filter(([re]) => re.test(stepMethodId));
  if (hits.length !== 1) {
    throw new Error(`craft:eval: planner step method "${stepMethodId}" matches ${hits.length} tag patterns (goldenTags.ts STEP_PATTERNS); map it to exactly one macro method`);
  }
  return hits[0]![1];
}

/** One step's route tags: its method's, plus those its materials name (only materials it expects to use). */
export function stepTags(step: Pick<PlanStepView, "method" | "materials">): GoldenTag[] {
  const tags = new Set<GoldenTag>(METHOD_TAGS[macroOf(step.method)]);
  for (const m of step.materials) {
    if (m.qty.point <= 0) continue;
    const tag = MATERIAL_TAGS[m.id] ?? GROUP_TAGS[m.group];
    if (tag) tags.add(tag);
  }
  return [...tags];
}

/** The whole plan's route tags, sorted (the set the scoreboard compares). */
export function planTags(steps: ReadonlyArray<Pick<PlanStepView, "method" | "materials">>): GoldenTag[] {
  return [...new Set(steps.flatMap(stepTags))].sort();
}
