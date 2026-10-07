import type { ClaimVerdict } from "../../../lib/claim";
import { PLANNER_CLASSES } from "../../../lib/tools/craftPlannerContract";
import { comboFor, type AffixSide, type CatalogCombo, type CraftCatalog } from "../craftmoves/catalog";
import { baseAllowance, catalystQualityCap } from "../craftmoves/classify";
import { CATALYSTS } from "./catalystTags";
import { ESSENCE_OUTCOMES, BREACH_ESSENCE_ID, essenceWritesFor } from "./essenceOutcomes";
import { sourceLine, sources } from "./sources";
import type { TargetGroupInput } from "../../../lib/tools/craftPlannerContractStart";
import { resolveGroups } from "./groupTargets";
import type { BaseInfo, Faction, QualityGoal, ResolvedTarget, TargetGroup } from "./types";

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

// Feasibility evidence as the player reads it: labels from sources.ts, never file names.
const SRC = {
  group: sourceLine(sources("group-rule")),
  gameData: sourceLine(sources("game-data")),
  essences: sourceLine(sources("kb-essences", "poe2db")),
  ilvl: sourceLine(sources("game-data", "kb-ilvl")),
  fracture: sourceLine(sources("kb-fracture")),
  timeLostCap: sourceLine(sources("owner-test-2026-10-02", "creators")),
  jewelCap: sourceLine(sources("kb-liquids")),
  baseCap: sourceLine(sources("game-data", "kb-ilvl")),
  overCap: sourceLine(sources("kb-liquids", "poe2db", "creators")),
  crafted: sourceLine(sources("kb-essences")),
  desecration: sourceLine(sources("kb-desecration")),
  library: sourceLine(sources("planner-prior")),
  catalysts: sourceLine(sources("kb-catalysts")),
  qualityCap: sourceLine(sources("kb-catalysts", "owner-test-2026-10-02")),
} as const;

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

export type Resolution = { target: ResolvedTarget } | { issue: FeasibilityIssue };

export function impossible(idx: number, rule: string, message: string, grade: ClaimVerdict, source: string): { issue: FeasibilityIssue } {
  return { issue: { severity: "impossible", rule, message, grade, source, target: idx } };
}

function sourceOf(cat: CraftCatalog, combo: CatalogCombo, spec: TargetSpec): ResolvedTarget["source"] | null {
  const mod = cat.mods[spec.minModId]!;
  if (mod.domain === "desecrated") return combo.desecrated[spec.family]?.[spec.minModId] != null ? "desecrated" : null;
  if (mod.craftedOnly) return "essence";
  return combo[spec.side][spec.family]?.[spec.minModId] != null ? "natural" : null;
}

export function resolveOne(cat: CraftCatalog, combo: CatalogCombo, base: BaseInfo, spec: TargetSpec, idx: number): Resolution {
  const mod = cat.mods[spec.minModId];
  if (!mod) return impossible(idx, "catalog", `unknown modifier id "${spec.minModId}"`, "vp", SRC.gameData);
  if (mod.family !== spec.family || mod.side !== spec.side) {
    return impossible(idx, "catalog", `"${mod.text}" is a ${mod.side}, not the ${spec.side} you picked`, "vp", SRC.gameData);
  }
  const source = sourceOf(cat, combo, spec);
  if (!source) return impossible(idx, "base-pool", `"${mod.text}" does not roll on a ${base.name}`, "vp", SRC.gameData);
  const essences = essenceWritesFor(cat, base.itemClass, spec.family, mod.level, spec.minModId);
  if (source === "essence" && essences.length === 0) {
    return impossible(idx, "essence-table", `no essence or alloy we know of writes "${mod.text}" on ${base.itemClass.toLowerCase()}`, "vp", SRC.essences);
  }
  if (source !== "essence" && mod.level > base.ilvl) {
    return impossible(idx, "ilvl-gate", `"${mod.text}" needs item level ${mod.level}; the base is ${base.ilvl}`, "vp", SRC.ilvl);
  }
  if (spec.fractured && source === "desecrated") {
    return impossible(idx, "fracture", "a desecrated mod can't be fractured", "vs", SRC.fracture);
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
    group: null,
    alts: [],
  };
  return { target };
}

/** Rare caps for the finished item, with the rule's grade. */
function finishedCaps(base: BaseInfo): { p: number; s: number; grade: ClaimVerdict; source: string } {
  if (base.timeLost) return { p: 2, s: 2, grade: "vs", source: SRC.timeLostCap };
  if (base.jewel) return { p: 2, s: 2, grade: "ss", source: SRC.jewelCap };
  return { p: 3 + base.allowance.p, s: 3 + base.allowance.s, grade: "vp", source: SRC.baseCap };
}

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
      out.push({ severity: "warn", rule: "over-cap-jewel", message: `${n} ${side}es on a basic jewel: the over-cap Liquid Contempt route — adding to the other side afterwards is untested`, grade: "ss", source: SRC.overCap, target: null });
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
      if (shared) out.push({ severity: "impossible", rule: "mod-group", message: `"${a.text}" and "${b.text}" belong to the same mod group — an item holds one mod per group`, grade: "ss", source: SRC.group, target: b.idx });
    }
  }
  return out;
}

export function slotIssues(base: BaseInfo, targets: readonly ResolvedTarget[]): FeasibilityIssue[] {
  const out: FeasibilityIssue[] = [];
  const crafted = targets.filter((t) => t.source === "essence");
  if (crafted.length > 1) out.push({ severity: "impossible", rule: "one-crafted", message: "two essence- or alloy-only mods: one crafted mod per item — a second needs Astrid's Creativity, which this planner does not plan", grade: "vp", source: SRC.crafted, target: crafted[1]!.idx });
  const desecrated = targets.filter((t) => t.source === "desecrated");
  if (desecrated.length > 1) out.push({ severity: "impossible", rule: "one-desecrated", message: "two desecrated mods: one per item — only Omen of Putrefaction exceeds it, and it corrupts the item (not planned)", grade: "vp", source: SRC.desecration, target: desecrated[1]!.idx });
  const fractured = targets.filter((t) => t.fractured);
  if (fractured.length > 1) out.push({ severity: "impossible", rule: "one-fracture", message: "two fractured mods: one fracture per item, ever", grade: "vs", source: SRC.fracture, target: fractured[1]!.idx });
  for (const t of desecrated) {
    if (base.timeLost) out.push({ severity: "warn", rule: "time-lost-desecration", message: `desecrating a Time-Lost jewel is unverified — planned only with "include unverified methods" (bones target any rare jewel, but no source names Time-Lost ones)`, grade: "uv", source: SRC.desecration, target: t.idx });
    const rolled = targets.filter((x) => x.source === "natural" && x.side === t.side).length;
    if (rolled >= 2) out.push({ severity: "warn", rule: "desecrated-side", message: `"${t.text}" shares its side with ${rolled} rolled mods — no planned method fills such a side yet (a later Annulment could take the desecrated mod)`, grade: "syn", source: SRC.library, target: t.idx });
    if (t.faction !== "amanamu" || base.itemClass === "Jewels") out.push({ severity: "warn", rule: "reveal-pool", message: `no faction omen steers "${t.text}" here — the reveal odds are an estimate over the whole ${t.side} pool (how the Well draws its offers isn't documented)`, grade: "ss", source: SRC.desecration, target: t.idx });
  }
  return out;
}

function qualityIssues(cat: CraftCatalog, base: BaseInfo, quality: QualityGoal | null): FeasibilityIssue[] {
  if (!quality) return [];
  if (!CATALYSTS.some((c) => c.mat.id === quality.catalyst)) {
    return [{ severity: "impossible", rule: "catalyst", message: `unknown catalyst "${quality.catalyst}"`, grade: "vp", source: SRC.gameData, target: null }];
  }
  if (base.qualityCap == null) return [{ severity: "impossible", rule: "catalyst-class", message: "catalysts only apply to rings and amulets", grade: "vp", source: SRC.catalysts, target: null }];
  const breach = ESSENCE_OUTCOMES.some((r) => r.essenceId === BREACH_ESSENCE_ID && r.itemClass === base.itemClass) && cat.mods.EssenceBreach != null;
  const max = base.qualityCap + (breach ? 20 : 0);
  if (quality.pct <= max) return [];
  return [{ severity: "impossible", rule: "quality-cap", message: `${quality.pct}% quality is above this base's ${max}% (cap ${base.qualityCap}%${breach ? " + 20% via Essence of the Breach" : ""})`, grade: "ss", source: SRC.qualityCap, target: null }];
}

export interface TargetResolution {
  targets: ResolvedTarget[];
  groups: TargetGroup[];
  issues: FeasibilityIssue[];
}

/** Single mods first (indices = the request's targets), then each pool's slots. */
export function resolveTargets(
  cat: CraftCatalog,
  combo: CatalogCombo,
  base: BaseInfo,
  specs: readonly TargetSpec[],
  quality: QualityGoal | null,
  pools: readonly TargetGroupInput[] = [],
): TargetResolution {
  const targets: ResolvedTarget[] = [];
  const issues: FeasibilityIssue[] = [];
  specs.forEach((spec, idx) => {
    const r = resolveOne(cat, combo, base, spec, idx);
    if ("issue" in r) issues.push(r.issue);
    else targets.push(r.target);
  });
  if (issues.length > 0) return { targets, groups: [], issues };
  const pooled = resolveGroups({ cat, combo, base, resolve: resolveOne }, pools, targets);
  if (pooled.issues.some((i) => i.severity === "impossible")) return { targets, groups: [], issues: pooled.issues };
  const all = [...targets, ...pooled.targets];
  issues.push(...pooled.issues, ...capIssues(base, all), ...pairIssues(targets), ...slotIssues(base, all), ...qualityIssues(cat, base, quality));
  return { targets: all, groups: pooled.groups, issues };
}

export const isFeasible = (issues: readonly FeasibilityIssue[]): boolean => !issues.some((i) => i.severity === "impossible");
