import type { CraftRecipe } from "../craftRecipes";
import { provenanceFor } from "../craftProvenanceData";
import { entityById } from "../entities/load";
import { auditStatus, loadRecipeAudit } from "./audit";
import { effectiveHitRate, type AttemptStats } from "./calibration";
import { recipePatchStaleness, TOO_COMMON_NAMES, type StaleSubject } from "./patchStale";
import type { AuditStatus, ProvenanceView, RecipeAudit, StaleReason } from "./schema";

/** Everything the Craft tab shows about where a recipe came from and whether it still holds. */

const entityName = (id: string): string => entityById(id)?.name ?? id;

function auditEntry(key: string, recipes: Record<string, RecipeAudit>): RecipeAudit {
  const entry = recipes[key];
  // CI fails first (test:craft-provenance); a deploy without the entry is a release defect
  if (!entry) throw new Error(`recipe ${key} is missing from recipe-audit.json — run npm run craft:audit-recipes`);
  return entry;
}

function staleSubjects(recipes: readonly CraftRecipe[], audits: Record<string, RecipeAudit>): StaleSubject[] {
  return recipes.map((r) => ({
    key: r.key,
    patchVerified: provenanceFor(r.key).patchVerified,
    names: auditEntry(r.key, audits).entityRefs.map(entityName).filter((n) => !TOO_COMMON_NAMES.has(n)),
  }));
}

function viewFor(r: CraftRecipe, entry: RecipeAudit, patchReasons: StaleReason[], stats: AttemptStats | undefined): ProvenanceView {
  const prov = provenanceFor(r.key);
  const stale: StaleReason[] = [...patchReasons];
  if (entry.repoeChanged.length > 0) stale.push({ kind: "repoe", entities: entry.repoeChanged.map(entityName) });
  return {
    status: stale.length > 0 ? "stale" : prov.status,
    patchVerified: prov.patchVerified,
    sources: prov.sources,
    kbRuleRefs: prov.kbRuleRefs,
    stale,
    hitRate: effectiveHitRate(r, prov, stats),
    steps: entry.steps,
    legality: entry.verdict,
  };
}

export function provenanceViews(
  recipes: readonly CraftRecipe[],
  stats: ReadonlyMap<string, AttemptStats>,
): { views: Map<string, ProvenanceView>; audit: AuditStatus } {
  const audit = loadRecipeAudit();
  const patchStale = recipePatchStaleness(staleSubjects(recipes, audit.recipes));
  const views = new Map(recipes.map((r) => [r.key, viewFor(r, auditEntry(r.key, audit.recipes), patchStale.get(r.key) ?? [], stats.get(r.key))]));
  return { views, audit: auditStatus(audit) };
}
