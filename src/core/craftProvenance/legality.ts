import { MATS, type CraftMaterial, type MaterialKey } from "../craftMaterials";
import type { CraftRecipe, GuideStep } from "../craftRecipes";
import type { EntityRow } from "../entities/schema";
import { VERIFIED_FLOORS } from "../tools/craftmoves/gates";
import { ALL_RULES } from "../tools/craftmoves/rules";
import { KB, type MoveRule } from "../tools/craftmoves/ruleTypes";
import type { LegalityCheck, LegalityVerdict, StepLegality } from "./schema";

/**
 * Deterministic per-step legality for a curated recipe: every material exists in the game data,
 * floored currencies and tier-capped bones suit the base's item level, and each omen rides a
 * pairing a verified rule encodes. No item-state simulation: a step is judged against the base leg
 * as bought, so a check that needs the item's state at that step answers "unknown", never "ok".
 */

/** KB §1 floors keyed by the material they apply to; a floor with no material fails at load. */
const FLOOR_MATERIAL: Record<string, MaterialKey> = {
  "greater-transmute": "greaterTransmute",
  "perfect-transmute": "perfectTransmute",
  "greater-aug": "greaterAug",
  "perfect-aug": "perfectAug",
  "greater-exalt": "greaterExalted",
  "perfect-exalt": "perfectExalted",
};

interface Floor {
  label: string;
  floor: number;
  source: string;
}

function buildFloors(): ReadonlyMap<string, Floor> {
  const floors = new Map<string, Floor>();
  for (const f of VERIFIED_FLOORS) {
    const key = FLOOR_MATERIAL[f.id];
    if (!key) throw new Error(`legality: verified floor "${f.id}" has no material mapping`);
    floors.set(MATS[key].id, { label: f.label, floor: f.floor, source: f.source });
  }
  // KB §5: "Ancient = min mod level 40" — the same soft floor, on the bone tier.
  for (const key of ["ancientJawbone", "ancientRib", "ancientCollarbone"] as const) {
    floors.set(MATS[key].id, { label: MATS[key].label, floor: 40, source: `${KB} §5` });
  }
  return floors;
}

const FLOORS = buildFloors();

/** KB §5/§9: Gnawed bones answer "Item Level is too high" above 64. */
const GNAWED_MAX_ILVL = 64;
const GNAWED = new Set<string>([MATS.gnawedJawbone.id, MATS.gnawedRib.id, MATS.gnawedCollarbone.id]);

// The Exaltation omen rules say they ride "any Exalt tier", so Greater/Perfect Exalts pair like the base orb.
const PAIRING_ALIAS: Readonly<Record<string, string>> = {
  [MATS.greaterExalted.id]: MATS.exalted.id,
  [MATS.perfectExalted.id]: MATS.exalted.id,
};
const BONE = "*bone";

interface PairingRule {
  id: string;
  source: string;
  verified: boolean;
  needs: ReadonlySet<string>;
}

/** Material ids a rule needs; a per-item bone resolver (function spec) becomes "any bone". */
function ruleNeeds(rule: MoveRule): Set<string> {
  const needs = new Set<string>();
  for (const spec of rule.materials) {
    if (typeof spec === "function") needs.add(BONE);
    else if (typeof spec === "string") needs.add(MATS[spec].id);
    else throw new Error(`legality: omen rule ${rule.id} names unlisted material "${spec.key}" — no pairing can match it`);
  }
  return needs;
}

const OMEN_IDS = new Set<string>(Object.values(MATS).filter((m) => m.group === "omen").map((m) => m.id));

export const PAIRING_RULES: readonly PairingRule[] = ALL_RULES.filter((r) =>
  r.materials.some((m) => typeof m === "string" && OMEN_IDS.has(MATS[m].id)),
).map((r) => ({ id: r.id, source: r.source, verified: r.verified, needs: ruleNeeds(r) }));

function worst(verdicts: readonly LegalityVerdict[]): LegalityVerdict {
  if (verdicts.includes("violation")) return "violation";
  return verdicts.includes("unknown") ? "unknown" : "ok";
}

export type EntityLookup = (exchangeId: string) => EntityRow | null;

function catalogCheck(mats: readonly CraftMaterial[], lookup: EntityLookup, gamePatch: string): LegalityCheck {
  const missing = mats.filter((m) => lookup(m.id) === null).map((m) => m.label);
  if (missing.length > 0) {
    return { kind: "catalog", verdict: "violation", detail: `not in the ${gamePatch} game data: ${missing.join(", ")}`, source: "entity catalog" };
  }
  return { kind: "catalog", verdict: "ok", detail: `every material exists in the ${gamePatch} game data`, source: "entity catalog" };
}

function floorCheck(floor: Floor, ilvlMin: number | undefined): LegalityCheck {
  const what = `${floor.label} rolls modifier level ${floor.floor}+`;
  if (ilvlMin === undefined) return { kind: "floor", verdict: "unknown", detail: `${what}; the base's item level is not pinned`, source: floor.source };
  if (ilvlMin < floor.floor) {
    return { kind: "floor", verdict: "violation", detail: `${what} but the base may be ilvl ${ilvlMin} — refused below its floor (KB §9)`, source: `${floor.source}; ${KB} §9` };
  }
  return { kind: "floor", verdict: "ok", detail: `${what}; base ilvl ${ilvlMin}+ meets it`, source: floor.source };
}

function gnawedCheck(m: CraftMaterial, ilvlMin: number | undefined): LegalityCheck {
  const source = `${KB} §5, §9`;
  if (ilvlMin === undefined) return { kind: "ilvl", verdict: "unknown", detail: `${m.label} stops at ilvl ${GNAWED_MAX_ILVL}; the base's item level is not pinned`, source };
  if (ilvlMin > GNAWED_MAX_ILVL) {
    return { kind: "ilvl", verdict: "violation", detail: `${m.label} fails above ilvl ${GNAWED_MAX_ILVL} ("Item Level is too high"); the base is ilvl ${ilvlMin}+`, source };
  }
  return { kind: "ilvl", verdict: "ok", detail: `${m.label} on a base under ilvl ${GNAWED_MAX_ILVL + 1}`, source };
}

function levelChecks(mats: readonly CraftMaterial[], ilvlMin: number | undefined): LegalityCheck[] {
  const out: LegalityCheck[] = [];
  for (const m of mats) {
    const floor = FLOORS.get(m.id);
    if (floor) out.push(floorCheck(floor, ilvlMin));
    if (GNAWED.has(m.id)) out.push(gnawedCheck(m, ilvlMin));
  }
  return out;
}

function satisfies(rule: PairingRule, present: ReadonlySet<string>, hasBone: boolean): boolean {
  return [...rule.needs].every((id) => (id === BONE ? hasBone : present.has(id)));
}

function omenCheck(omen: CraftMaterial, present: ReadonlySet<string>, hasBone: boolean, rules: readonly PairingRule[]): LegalityCheck {
  const candidates = rules.filter((r) => r.needs.has(omen.id));
  if (candidates.length === 0) {
    return { kind: "pairing", verdict: "unknown", detail: `no verified rule covers ${omen.label}`, source: `${KB} §4` };
  }
  const hit = candidates.find((r) => satisfies(r, present, hasBone) && r.verified) ?? candidates.find((r) => satisfies(r, present, hasBone));
  if (!hit) {
    return { kind: "pairing", verdict: "unknown", detail: `${omen.label} is not paired here as any rule expects (${candidates.map((r) => r.id).join(", ")})`, source: `${KB} §4` };
  }
  const trust = hit.verified ? "" : " — that rule is itself unverified";
  return { kind: "pairing", verdict: "ok", detail: `${omen.label} pairing matches rule ${hit.id}${trust}`, source: hit.source };
}

function pairingChecks(mats: readonly CraftMaterial[], rules: readonly PairingRule[]): LegalityCheck[] {
  const present = new Set(mats.map((m) => PAIRING_ALIAS[m.id] ?? m.id));
  const hasBone = mats.some((m) => m.group === "bone");
  return mats.filter((m) => m.group === "omen").map((omen) => omenCheck(omen, present, hasBone, rules));
}

/** Checks for one step's materials against the base it is applied to. */
export function checkStep(step: GuideStep, ilvlMin: number | undefined, lookup: EntityLookup, gamePatch: string, rules = PAIRING_RULES): LegalityCheck[] {
  const mats = step.mats ?? [];
  if (mats.length === 0) return [];
  return [catalogCheck(mats, lookup, gamePatch), ...levelChecks(mats, ilvlMin), ...pairingChecks(mats, rules)];
}

/** Legality of every guide step that spends materials, keyed by its flat index in the session. */
export function recipeLegality(recipe: CraftRecipe, lookup: EntityLookup, gamePatch: string): StepLegality[] {
  const steps = recipe.guide.phases.flatMap((p) => p.steps);
  const out: StepLegality[] = [];
  steps.forEach((step, idx) => {
    const checks = checkStep(step, recipe.base.ilvlMin, lookup, gamePatch);
    if (checks.length > 0) out.push({ idx, verdict: worst(checks.map((c) => c.verdict)), checks });
  });
  return out;
}

export function overallVerdict(steps: readonly StepLegality[]): LegalityVerdict {
  return worst(steps.map((s) => s.verdict));
}
