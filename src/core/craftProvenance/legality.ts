import { MATS, type CraftMaterial, type MaterialKey } from "../craftMaterials";
import type { CraftRecipe, GuideStep } from "../craftRecipes";
import type { EntityRow } from "../entities/schema";
import type { Rarity } from "../../lib/tradeLink";
import { VERIFIED_FLOORS, type CurrencyFloor } from "../tools/craftmoves/gates";
import { ALL_RULES } from "../tools/craftmoves/rules";
import { isPerfectOrCorruptedEssence, RARE_ESSENCE } from "../tools/craftmoves/ruleTableOmens";
import { KB, type MoveRule } from "../tools/craftmoves/ruleTypes";
import type { LegalityCheck, LegalityVerdict, StepLegality } from "./schema";

/**
 * Deterministic per-step legality for a curated recipe: every material exists in the game data,
 * floored currencies and tier-capped bones suit the base's item level and rarity, and each omen
 * rides a pairing a verified rule encodes. No item-state simulation: rarity is judged only on the
 * first material step (the base as bought); anything that needs the item's state later answers
 * "unknown", never "ok". Item level never changes, so ilvl checks hold for every step.
 */

/** KB §1 floors keyed by the material they apply to; a floor with no material fails at load. */
const FLOOR_MATERIAL: Record<string, MaterialKey> = {
  "greater-transmute": "greaterTransmute",
  "perfect-transmute": "perfectTransmute",
  "greater-aug": "greaterAug",
  "perfect-aug": "perfectAug",
  "greater-exalt": "greaterExalted",
  "perfect-exalt": "perfectExalted",
  "perfect-regal": "perfectRegal",
};

interface Floor {
  label: string;
  floor: number;
  source: string;
  /** The item rarity the currency applies to (KB §1); null for bones, whose rule is not in VERIFIED_FLOORS. */
  rarity: CurrencyFloor["rarity"] | null;
}

function buildFloors(): ReadonlyMap<string, Floor> {
  const floors = new Map<string, Floor>();
  for (const f of VERIFIED_FLOORS) {
    const key = FLOOR_MATERIAL[f.id];
    if (!key) throw new Error(`legality: verified floor "${f.id}" has no material mapping`);
    floors.set(MATS[key].id, { label: f.label, floor: f.floor, source: f.source, rarity: f.rarity });
  }
  // KB §5: "Ancient = min mod level 40" — the same soft floor, on the bone tier.
  for (const key of ["ancientJawbone", "ancientRib", "ancientCollarbone"] as const) {
    floors.set(MATS[key].id, { label: MATS[key].label, floor: 40, source: `${KB} §5`, rarity: null });
  }
  return floors;
}

const FLOORS = buildFloors();

/**
 * Currencies the game is on record REFUSING below their floor — KB §9: "Perfect Orb of Augmentation
 * refused on a low-ilvl ring". Every other floor is only the §1 soft floor (fewer tiers, not a refusal).
 */
const REFUSED_BELOW_FLOOR = new Set<string>([MATS.perfectAug.id]);

/** What the base looks like at a step: as bought on the first material step, unknown after it. */
export interface StepBase {
  ilvlMin: number | undefined;
  rarity: Rarity | undefined;
  /** True for the first step that spends materials — nothing has changed the base yet. */
  asBought: boolean;
}

/** KB §5/§9: Gnawed bones answer "Item Level is too high" above 64. */
const GNAWED_MAX_ILVL = 64;
const GNAWED = new Set<string>([MATS.gnawedJawbone.id, MATS.gnawedRib.id, MATS.gnawedCollarbone.id]);

// The Exaltation omen rules say they ride "any Exalt tier", so Greater/Perfect Exalts pair like the base orb.
const PAIRING_ALIAS: Readonly<Record<string, string>> = {
  [MATS.greaterExalted.id]: MATS.exalted.id,
  [MATS.perfectExalted.id]: MATS.exalted.id,
};
const BONE = "*bone";
const RARE_ESSENCE_ANY = "*perfect-or-corrupted-essence";

interface PairingRule {
  id: string;
  source: string;
  verified: boolean;
  needs: ReadonlySet<string>;
}

/**
 * Material ids a rule needs; a per-item bone resolver (function spec) becomes "any bone" and the
 * Crystallisation omens' essence "any Perfect or Corrupted essence".
 */
function ruleNeeds(rule: MoveRule): Set<string> {
  const needs = new Set<string>();
  for (const spec of rule.materials) {
    if (typeof spec === "function") needs.add(BONE);
    else if (typeof spec === "string") needs.add(MATS[spec].id);
    else if (spec.key === RARE_ESSENCE.key) needs.add(RARE_ESSENCE_ANY);
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

function floorCheck(floor: Floor, id: string, ilvlMin: number | undefined): LegalityCheck {
  const soft = `${floor.label} cannot roll tiers below modifier level ${floor.floor}`;
  if (ilvlMin === undefined) return { kind: "floor", verdict: "unknown", detail: `${soft}; the base's item level is not pinned`, source: floor.source };
  if (ilvlMin >= floor.floor) return { kind: "floor", verdict: "ok", detail: `${soft}; base ilvl ${ilvlMin}+ clears it`, source: floor.source };
  if (REFUSED_BELOW_FLOOR.has(id)) {
    return { kind: "floor", verdict: "violation", detail: `${floor.label} was refused in game on a base below ilvl ${floor.floor}; this base may be ilvl ${ilvlMin}`, source: `${floor.source}; ${KB} §9` };
  }
  // KB §1 soft floor: families whose every reachable tier sits below it keep their top reachable tier
  return { kind: "floor", verdict: "unknown", detail: `${soft}; on an ilvl ${ilvlMin} base only each family's top reachable tier stays eligible`, source: floor.source };
}

function gnawedCheck(m: CraftMaterial, ilvlMin: number | undefined): LegalityCheck {
  const source = `${KB} §5, §9`;
  if (ilvlMin === undefined) return { kind: "ilvl", verdict: "unknown", detail: `${m.label} stops at ilvl ${GNAWED_MAX_ILVL}; the base's item level is not pinned`, source };
  if (ilvlMin > GNAWED_MAX_ILVL) {
    return { kind: "ilvl", verdict: "violation", detail: `${m.label} fails above ilvl ${GNAWED_MAX_ILVL} ("Item Level is too high"); the base is ilvl ${ilvlMin}+`, source };
  }
  return { kind: "ilvl", verdict: "ok", detail: `${m.label} on a base under ilvl ${GNAWED_MAX_ILVL + 1}`, source };
}

/** KB §1 rarity: judged only on the first material step, where the base is still as bought. */
function rarityCheck(floor: Floor & { rarity: CurrencyFloor["rarity"] }, base: StepBase): LegalityCheck {
  const needs = `${floor.label} needs a ${floor.rarity.toLowerCase()} item`;
  if (!base.asBought) return { kind: "rarity", verdict: "unknown", detail: `${needs}; the item's rarity after earlier steps is not simulated`, source: floor.source };
  if (base.rarity === undefined) return { kind: "rarity", verdict: "unknown", detail: `${needs}; the base's rarity is not pinned`, source: floor.source };
  if (base.rarity !== floor.rarity.toLowerCase()) {
    return { kind: "rarity", verdict: "violation", detail: `${needs}, but the base is bought ${base.rarity}`, source: floor.source };
  }
  return { kind: "rarity", verdict: "ok", detail: `${needs}; the base is bought ${base.rarity}`, source: floor.source };
}

function levelChecks(mats: readonly CraftMaterial[], base: StepBase): LegalityCheck[] {
  const out: LegalityCheck[] = [];
  for (const m of mats) {
    const floor = FLOORS.get(m.id);
    if (floor) out.push(floorCheck(floor, m.id, base.ilvlMin));
    if (floor?.rarity) out.push(rarityCheck({ ...floor, rarity: floor.rarity }, base));
    if (GNAWED.has(m.id)) out.push(gnawedCheck(m, base.ilvlMin));
  }
  return out;
}

/** Wildcards a step's materials fill: any bone, any Perfect or Corrupted essence. */
interface StepWildcards {
  bone: boolean;
  rareEssence: boolean;
}

function satisfies(rule: PairingRule, present: ReadonlySet<string>, wild: StepWildcards): boolean {
  return [...rule.needs].every((id) => (id === BONE ? wild.bone : id === RARE_ESSENCE_ANY ? wild.rareEssence : present.has(id)));
}

function omenCheck(omen: CraftMaterial, present: ReadonlySet<string>, wild: StepWildcards, rules: readonly PairingRule[]): LegalityCheck {
  const candidates = rules.filter((r) => r.needs.has(omen.id));
  if (candidates.length === 0) {
    return { kind: "pairing", verdict: "unknown", detail: `no rule covers ${omen.label}`, source: `${KB} §4` };
  }
  const matching = candidates.filter((r) => satisfies(r, present, wild));
  const verified = matching.find((r) => r.verified);
  if (verified) return { kind: "pairing", verdict: "ok", detail: `${omen.label} pairing matches verified rule ${verified.id}`, source: verified.source };
  const unverified = matching[0];
  if (unverified) {
    // an unverified rule is a lead, not evidence: the pairing is plausible but not checked
    return { kind: "pairing", verdict: "unknown", detail: `${omen.label} pairing matches only the unverified rule ${unverified.id}`, source: unverified.source };
  }
  return { kind: "pairing", verdict: "unknown", detail: `${omen.label} is not paired here as any rule expects (${candidates.map((r) => r.id).join(", ")})`, source: `${KB} §4` };
}

/**
 * Whether a Crystallisation omen in this step meets a Perfect or Corrupted essence. The omen is
 * consumed by the first essence it meets, Greater included (KB §4, single-source), and creators
 * steer alloys with it too (KB §4, unverified). So only the FIRST essence or alloy in the step's
 * materials counts: "Crystallisation + Horror essence, then an alloy" pairs, "+ alloy + Perfect
 * essence" or "+ Greater essence + Perfect essence" does not.
 */
function crystallisationConsumer(mats: readonly CraftMaterial[]): boolean {
  const first = mats.find((m) => m.group === "essence" || m.id.endsWith("-alloy"));
  return first != null && first.group === "essence" && isPerfectOrCorruptedEssence(first.id);
}

function pairingChecks(mats: readonly CraftMaterial[], rules: readonly PairingRule[]): LegalityCheck[] {
  const present = new Set(mats.map((m) => PAIRING_ALIAS[m.id] ?? m.id));
  const wild: StepWildcards = { bone: mats.some((m) => m.group === "bone"), rareEssence: crystallisationConsumer(mats) };
  return mats.filter((m) => m.group === "omen").map((omen) => omenCheck(omen, present, wild, rules));
}

/** Checks for one step's materials against the base it is applied to. */
export function checkStep(step: GuideStep, base: StepBase, lookup: EntityLookup, gamePatch: string, rules = PAIRING_RULES): LegalityCheck[] {
  const mats = step.mats ?? [];
  if (mats.length === 0) return [];
  return [catalogCheck(mats, lookup, gamePatch), ...levelChecks(mats, base), ...pairingChecks(mats, rules)];
}

/** Legality of every guide step that spends materials, keyed by its flat index in the session. */
export function recipeLegality(recipe: CraftRecipe, lookup: EntityLookup, gamePatch: string): StepLegality[] {
  const steps = recipe.guide.phases.flatMap((p) => p.steps);
  const out: StepLegality[] = [];
  steps.forEach((step, idx) => {
    const base: StepBase = { ilvlMin: recipe.base.ilvlMin, rarity: recipe.base.rarity, asBought: out.length === 0 };
    const checks = checkStep(step, base, lookup, gamePatch);
    if (checks.length > 0) out.push({ idx, verdict: worst(checks.map((c) => c.verdict)), checks });
  });
  return out;
}

export function overallVerdict(steps: readonly StepLegality[]): LegalityVerdict {
  return worst(steps.map((s) => s.verdict));
}
