import type { ClaimVerdict } from "../../../lib/claim";
import { PLANNER_CLASSES } from "../../../lib/tools/craftPlannerContract";
import { comboFor, type AffixSide, type CatalogCombo, type CraftCatalog } from "../craftmoves/catalog";
import { baseAllowance, catalystQualityCap } from "../craftmoves/classify";
import { KB } from "../craftmoves/ruleTypes";
import { CATALYSTS } from "./catalystTags";
import { ESSENCE_OUTCOMES, BREACH_ESSENCE_ID, essenceWritesFor } from "./essenceOutcomes";
import { TIME_LOST_CAP_SOURCE } from "./state";
import type { BaseInfo, Faction, QualityGoal, ResolvedTarget } from "./types";

/**
 * User targets → catalog-resolved targets, plus the feasibility verdict. Every refusal names the
 * rule, its verification grade and the source, so "impossible" is never a bare no.
 */

export { PLANNER_CLASSES };

export interface TargetSpec {
  family: string;
  side: AffixSide;
  minModId: string;
  fractured: boolean;
}

export interface FeasibilityIssue {
  severity: "impossible" | "warn";
  rule: string;
  message: string;
  grade: ClaimVerdict;
  source: string;
  target: number | null;
}

export class UnknownPlannerBaseError extends Error {
  constructor(itemClass: string, base: string) {
    super(`"${base}" is not a ${itemClass} base in the craft catalog`);
    this.name = "UnknownPlannerBaseError";
  }
}

const GROUP_RULE_SOURCE = "docs/kb/desecration-abyss.md (standard affix-group exclusion, single-source; fail closed)";
const TIME_LOST_DESECRATION = `${KB} §6 says a Preserved Cranium targets any rare jewel, but no source names Time-Lost jewels`;

export function resolveBase(cat: CraftCatalog, itemClass: string, name: string, ilvl: number): { base: BaseInfo; combo: CatalogCombo } {
  const row = cat.bases[name];
  const combo = row && row.itemClass === itemClass ? comboFor(cat, itemClass, name) : null;
  if (!row || !combo || !(PLANNER_CLASSES as readonly string[]).includes(itemClass)) throw new UnknownPlannerBaseError(itemClass, name);
  const jewel = itemClass === "Jewels";
  const base: BaseInfo = {
    name,
    itemClass,
    ilvl,
    implicits: row.implicits,
    allowance: baseAllowance(cat, name),
    qualityCap: catalystQualityCap(cat, itemClass, name),
    jewel,
    timeLost: jewel && /time-lost/i.test(name),
  };
  return { base, combo };
}

const FACTIONS: readonly Faction[] = ["amanamu", "ulaman", "kurgal"];
export const factionOf = (tags: readonly string[]): Faction | null => FACTIONS.find((f) => tags.includes(`${f}_mod`)) ?? null;

type Resolution = { target: ResolvedTarget } | { issue: FeasibilityIssue };

function impossible(idx: number, rule: string, message: string, grade: ClaimVerdict, source: string): { issue: FeasibilityIssue } {
  return { issue: { severity: "impossible", rule, message, grade, source, target: idx } };
}

function sourceOf(cat: CraftCatalog, combo: CatalogCombo, spec: TargetSpec): ResolvedTarget["source"] | null {
  const mod = cat.mods[spec.minModId]!;
  if (mod.domain === "desecrated") return combo.desecrated[spec.family]?.[spec.minModId] != null ? "desecrated" : null;
  if (mod.craftedOnly) return "essence";
  return combo[spec.side][spec.family]?.[spec.minModId] != null ? "natural" : null;
}

function resolveOne(cat: CraftCatalog, combo: CatalogCombo, base: BaseInfo, spec: TargetSpec, idx: number): Resolution {
  const mod = cat.mods[spec.minModId];
  if (!mod) return impossible(idx, "catalog", `unknown modifier id "${spec.minModId}"`, "vp", "craft catalog (RePoE)");
  if (mod.family !== spec.family || mod.side !== spec.side) {
    return impossible(idx, "catalog", `${spec.minModId} is a ${mod.side} of family ${mod.family}, not ${spec.side} ${spec.family}`, "vp", "craft catalog (RePoE)");
  }
  const source = sourceOf(cat, combo, spec);
  if (!source) return impossible(idx, "base-pool", `"${mod.text}" does not roll on a ${base.name}`, "vp", "RePoE mods_by_base (craft catalog)");
  const essences = essenceWritesFor(cat, base.itemClass, spec.family, mod.level, spec.minModId);
  if (source === "essence" && essences.length === 0) {
    return impossible(idx, "essence-table", `no curated essence writes "${mod.text}" on ${base.itemClass}`, "vp", "src/core/tools/planner/essenceOutcomes.ts (poe2db)");
  }
  if (source !== "essence" && mod.level > base.ilvl) {
    return impossible(idx, "ilvl-gate", `"${mod.text}" is modifier level ${mod.level} — needs item level ${mod.level}, the base is ${base.ilvl}`, "vp", `RePoE required_level; ${KB} §3`);
  }
  if (spec.fractured && source === "desecrated") {
    return impossible(idx, "fracture", "a desecrated mod can't be fractured", "vs", `${KB} §2`);
  }
  const target: ResolvedTarget = {
    idx,
    family: spec.family,
    side: spec.side,
    modId: spec.minModId,
    level: mod.level,
    text: mod.text,
    groups: mod.groups,
    tags: mod.tags,
    source,
    fractured: spec.fractured,
    essences,
    faction: source === "desecrated" ? factionOf(mod.tags) : null,
  };
  return { target };
}

/** Rare caps for the finished item, with the rule's grade. */
function finishedCaps(base: BaseInfo): { p: number; s: number; grade: ClaimVerdict; source: string } {
  if (base.timeLost) return { p: 2, s: 2, grade: "vs", source: TIME_LOST_CAP_SOURCE };
  if (base.jewel) return { p: 2, s: 2, grade: "ss", source: `${KB} §6 (Maxroll jewel guide)` };
  return { p: 3 + base.allowance.p, s: 3 + base.allowance.s, grade: "vp", source: `game rules; base implicits (RePoE base_items, ${KB} §3)` };
}

const OVER_CAP_SOURCE = `${KB} §6 (Contempt "+1 … allowed": poe2db + RePoE; the stripped over-cap end state: creator-demonstrated)`;

function capIssues(base: BaseInfo, targets: readonly ResolvedTarget[]): FeasibilityIssue[] {
  const caps = finishedCaps(base);
  const count = (side: "prefix" | "suffix") => targets.filter((t) => t.side === side).length;
  const out: FeasibilityIssue[] = [];
  for (const side of ["prefix", "suffix"] as const) {
    const n = count(side);
    const cap = side === "prefix" ? caps.p : caps.s;
    if (n <= cap) continue;
    const other = count(side === "prefix" ? "suffix" : "prefix");
    // a basic jewel can end one over on ONE side: the over-cap Liquid Contempt route
    if (base.jewel && !base.timeLost && n === cap + 1 && other <= cap) {
      out.push({ severity: "warn", rule: "over-cap-jewel", message: `${n} ${side}es on a basic jewel: the over-cap Liquid Contempt route — adding to the other side afterwards is unverified`, grade: "ss", source: OVER_CAP_SOURCE, target: null });
      continue;
    }
    out.push({ severity: "impossible", rule: "affix-cap", message: `${n} ${side}es wanted, a rare ${base.name} holds ${cap}`, grade: caps.grade, source: caps.source, target: null });
  }
  return out;
}

function pairIssues(targets: readonly ResolvedTarget[]): FeasibilityIssue[] {
  const out: FeasibilityIssue[] = [];
  for (const a of targets) {
    for (const b of targets) {
      if (b.idx <= a.idx) continue;
      const shared = a.groups.find((g) => b.groups.includes(g));
      if (shared) out.push({ severity: "impossible", rule: "mod-group", message: `"${a.text}" and "${b.text}" share mod group ${shared} — an item holds one mod per group`, grade: "ss", source: GROUP_RULE_SOURCE, target: b.idx });
    }
  }
  return out;
}

export function slotIssues(base: BaseInfo, targets: readonly ResolvedTarget[]): FeasibilityIssue[] {
  const out: FeasibilityIssue[] = [];
  const crafted = targets.filter((t) => t.source === "essence");
  if (crafted.length > 1) out.push({ severity: "impossible", rule: "one-crafted", message: "two essence-only mods: one crafted mod per item — a second needs Astrid's Creativity, which this planner does not plan", grade: "vp", source: `${KB} §7`, target: crafted[1]!.idx });
  const desecrated = targets.filter((t) => t.source === "desecrated");
  if (desecrated.length > 1) out.push({ severity: "impossible", rule: "one-desecrated", message: "two desecrated mods: one per item — only Omen of Putrefaction exceeds it, and it corrupts the item (not planned)", grade: "vp", source: `${KB} §5`, target: desecrated[1]!.idx });
  const fractured = targets.filter((t) => t.fractured);
  if (fractured.length > 1) out.push({ severity: "impossible", rule: "one-fracture", message: "two fractured mods: one fracture per item, ever", grade: "vs", source: `${KB} §2`, target: fractured[1]!.idx });
  for (const t of desecrated) {
    if (base.timeLost) out.push({ severity: "warn", rule: "time-lost-desecration", message: `desecrating a Time-Lost jewel is unverified — planned only with "include unverified methods"`, grade: "uv", source: TIME_LOST_DESECRATION, target: t.idx });
    if (t.faction !== "amanamu" || base.itemClass === "Jewels") out.push({ severity: "warn", rule: "reveal-pool", message: `no faction omen steers "${t.text}" here — the reveal odds are an estimate over the whole ${t.side} pool`, grade: "ss", source: `${KB} §5 (reveal draw rules OPEN)`, target: t.idx });
  }
  return out;
}

function qualityIssues(cat: CraftCatalog, base: BaseInfo, quality: QualityGoal | null): FeasibilityIssue[] {
  if (!quality) return [];
  if (!CATALYSTS.some((c) => c.mat.id === quality.catalyst)) {
    return [{ severity: "impossible", rule: "catalyst", message: `unknown catalyst "${quality.catalyst}"`, grade: "vp", source: "entity catalog (game data 0.5.5b)", target: null }];
  }
  if (base.qualityCap == null) return [{ severity: "impossible", rule: "catalyst-class", message: "catalysts only apply to rings and amulets", grade: "vp", source: `${KB} §8`, target: null }];
  const breach = ESSENCE_OUTCOMES.some((r) => r.essenceId === BREACH_ESSENCE_ID && r.itemClass === base.itemClass) && cat.mods.EssenceBreach != null;
  const max = base.qualityCap + (breach ? 20 : 0);
  if (quality.pct <= max) return [];
  return [{ severity: "impossible", rule: "quality-cap", message: `${quality.pct}% quality is above this base's ${max}% (cap ${base.qualityCap}%${breach ? " + 20% via Essence of the Breach" : ""})`, grade: "ss", source: `${KB} §8; theory-gaps T12`, target: null }];
}

export interface TargetResolution {
  targets: ResolvedTarget[];
  issues: FeasibilityIssue[];
}

export function resolveTargets(cat: CraftCatalog, combo: CatalogCombo, base: BaseInfo, specs: readonly TargetSpec[], quality: QualityGoal | null): TargetResolution {
  const targets: ResolvedTarget[] = [];
  const issues: FeasibilityIssue[] = [];
  specs.forEach((spec, idx) => {
    const r = resolveOne(cat, combo, base, spec, idx);
    if ("issue" in r) issues.push(r.issue);
    else targets.push(r.target);
  });
  if (issues.length > 0) return { targets, issues };
  issues.push(...capIssues(base, targets), ...pairIssues(targets), ...slotIssues(base, targets), ...qualityIssues(cat, base, quality));
  return { targets, issues };
}

export const isFeasible = (issues: readonly FeasibilityIssue[]): boolean => !issues.some((i) => i.severity === "impossible");
