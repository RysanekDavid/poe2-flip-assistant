import type { ClaimVerdict } from "../../../lib/claim";
import type { TargetGroupInput } from "../../../lib/tools/craftPlannerContractStart";
import { poolName } from "../../../lib/tools/modNames";
import type { CatalogCombo, CraftCatalog } from "../craftmoves/catalog";
import { sourceLine, sources } from "./sources";
import type { FeasibilityIssue, Resolution, TargetSpec } from "./targets";
import type { BaseInfo, ResolvedTarget, TargetGroup } from "./types";

/**
 * Mod pools ("any 3 of these 4 flats"): each pool becomes `need` target slots that share its
 * candidates. Every candidate is checked like a single mod (on the base, item level, a natural
 * roll), candidates must be different kinds of mod (one mod per mod group), and a candidate a
 * wanted single mod already blocks can never land, so it is left out with a warning.
 */

const GROUP_RULE = sourceLine(sources("group-rule"));
const GAME_DATA = sourceLine(sources("game-data"));

export interface GroupDeps {
  cat: CraftCatalog;
  combo: CatalogCombo;
  base: BaseInfo;
  resolve: (cat: CraftCatalog, combo: CatalogCombo, base: BaseInfo, spec: TargetSpec, idx: number) => Resolution;
}

interface Resolved {
  targets: ResolvedTarget[];
  groups: TargetGroup[];
  issues: FeasibilityIssue[];
}

const issue = (severity: FeasibilityIssue["severity"], rule: string, message: string, grade: ClaimVerdict, source: string, target: number): FeasibilityIssue => ({ severity, rule, message, grade, source, target });

/** P(a plain add that rolls this family lands the candidate's tier or better): good / reachable tiers. */
function tierShare(combo: CatalogCombo, base: BaseInfo, c: ResolvedTarget): number {
  const levels = Object.values(combo[c.side][c.family] ?? {}).filter((l) => l <= base.ilvl);
  return levels.length === 0 ? 0 : levels.filter((l) => l >= c.level).length / levels.length;
}

function candidates(d: GroupDeps, g: TargetGroupInput, slot0: number): { list: ResolvedTarget[]; issues: FeasibilityIssue[] } {
  const list: ResolvedTarget[] = [];
  const issues: FeasibilityIssue[] = [];
  for (const c of g.candidates) {
    const r = d.resolve(d.cat, d.combo, d.base, { family: c.family, side: g.side, minModId: c.minModId, fractured: false }, slot0);
    if ("issue" in r) issues.push(r.issue);
    else if (r.target.source !== "natural") issues.push(issue("impossible", "pool-source", `"${r.target.text}" only comes from ${r.target.source === "essence" ? "an essence" : "desecration"} — a pool holds mods currency can roll`, "vp", GAME_DATA, slot0));
    else list.push(r.target);
  }
  for (let i = 0; i < list.length; i++) {
    for (let k = i + 1; k < list.length; k++) {
      const shared = list[i]!.groups.find((x) => list[k]!.groups.includes(x));
      if (shared) issues.push(issue("impossible", "pool-group", `"${list[i]!.text}" and "${list[k]!.text}" are the same kind of mod (one per item) — a pool needs different kinds`, "ss", GROUP_RULE, slot0));
    }
  }
  return { list, issues };
}

function slotsFor(g: TargetGroupInput, gi: number, list: readonly ResolvedTarget[], slot0: number): ResolvedTarget[] {
  return Array.from({ length: g.need }, (_, k) => {
    const idx = slot0 + k;
    const alts = list.map((c) => ({ ...c, idx, group: gi }));
    return {
      idx,
      family: `pool:${gi}`,
      side: g.side,
      modId: list[0]!.modId,
      level: Math.min(...list.map((c) => c.level)),
      // each candidate's minimum tier travels in `alts` (the response lists them); the name stays one short line
      text: poolName(list.map((c) => c.text)),
      groups: [],
      tags: [...new Set(list.flatMap((c) => c.tags))],
      source: "natural" as const,
      fractured: false,
      essences: [],
      faction: null,
      group: gi,
      alts,
    };
  });
}

/** Pools → slots after the single targets (`plain`); candidates sorted likeliest first. */
export function resolveGroups(d: GroupDeps, pools: readonly TargetGroupInput[], plain: readonly ResolvedTarget[]): Resolved {
  const out: Resolved = { targets: [], groups: [], issues: [] };
  let next = plain.length;
  pools.forEach((g, gi) => {
    const slot0 = next;
    const got = candidates(d, g, slot0);
    out.issues.push(...got.issues);
    const blockedBy = (c: ResolvedTarget) => plain.find((t) => t.groups.some((x) => c.groups.includes(x)));
    const free = got.list.filter((c) => {
      const t = blockedBy(c);
      if (t) out.issues.push(issue("warn", "pool-blocked", `"${c.text}" can't join "${t.text}" on one item (same kind of mod) — left out of the pool`, "ss", GROUP_RULE, slot0));
      return !t;
    });
    if (free.length < g.need && !got.issues.some((i) => i.severity === "impossible")) {
      out.issues.push(issue("impossible", "pool-need", `the ${g.side} pool needs ${g.need} but only ${free.length} of its mods can be on this item`, "vp", GAME_DATA, slot0));
    }
    // likeliest first under the equal prior (more good tiers among the reachable ones), then as picked
    const order = free.map((c, i) => ({ c, i, share: tierShare(d.combo, d.base, c) })).sort((a, b) => b.share - a.share || a.i - b.i).map((x) => x.c);
    if (order.length >= g.need) out.targets.push(...slotsFor(g, gi, order, slot0));
    out.groups.push({ side: g.side, need: g.need, slots: Array.from({ length: g.need }, (_, k) => slot0 + k) });
    next += g.need;
  });
  return out;
}
