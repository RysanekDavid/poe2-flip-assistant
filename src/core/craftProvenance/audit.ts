import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { patchCoverageSchema } from "../../sources/patchNotes/contracts";
import { comparePatch } from "../tools/bossEv/schema";
import type { CraftRecipe } from "../craftRecipes";
import { entityByExchangeId, entityById, loadEntityCatalog } from "../entities/load";
import type { EntityRow } from "../entities/schema";
import { overallVerdict, recipeLegality, type EntityLookup } from "./legality";
import {
  RECIPE_AUDIT_SCHEMA_VERSION,
  recipeAuditFileSchema,
  type AuditStatus,
  type RecipeAudit,
  type RecipeAuditFile,
  type RecipeProvenance,
} from "./schema";

/**
 * The stamped recipe audit (src/data/poe2/craft/recipe-audit.json), written offline by
 * `npm run craft:audit-recipes` and read by the web process. It holds each recipe's step legality
 * and a per-entity digest of the game text the recipe was verified against: when a RePoE refresh
 * changes that text, the next audit run lists the entity under `repoeChanged` and the recipe reads
 * stale until someone re-verifies it and bumps patchVerified (or re-baselines it explicitly).
 */

export const RECIPE_AUDIT_PATH = join(process.cwd(), "src", "data", "poe2", "craft", "recipe-audit.json");
const MANIFEST_PATH = join(process.cwd(), "src", "data", "poe2", "repoe", "manifest.json");
const COVERAGE_PATH = join(process.cwd(), "src", "data", "poe2", "patch-coverage.json");

export interface AuditDeps {
  byExchangeId: EntityLookup;
  byId: (id: string) => EntityRow | null;
  gameDataPatch: string;
  artifactSha256: string;
  repoeVersion: string;
}

/** Stable 16-hex digest of the player-facing game text of one entity. */
export function entityDigest(row: EntityRow): string {
  const text = JSON.stringify([row.name, row.kind, row.summary, row.directions, row.repoe_id, row.exchange_id, row.item_class]);
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Every entity the recipe depends on: its bill of materials, every step's materials, the extras. */
export function recipeEntityRefs(recipe: CraftRecipe, prov: RecipeProvenance, deps: AuditDeps): string[] {
  const exchangeIds = new Set([...recipe.materials.map((m) => m.material.id), ...recipe.guide.phases.flatMap((p) => p.steps.flatMap((s) => (s.mats ?? []).map((m) => m.id)))]);
  const ids = new Set<string>();
  for (const exchangeId of exchangeIds) {
    const row = deps.byExchangeId(exchangeId);
    // a material missing from the catalog is reported by the step legality, not dropped silently
    ids.add(row ? row.id : exchangeId);
  }
  for (const id of prov.extraEntityRefs) {
    if (!deps.byId(id)) throw new Error(`recipe ${recipe.key}: extraEntityRefs names "${id}", which is not in the entity catalog`);
    ids.add(id);
  }
  return [...ids].sort();
}

function currentDigests(refs: readonly string[], deps: AuditDeps): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of refs) {
    const row = deps.byId(id);
    if (row) out[id] = entityDigest(row);
  }
  return out;
}

/**
 * The kept baseline, narrowed to the current refs. A ref the recipe gained since (a data edit, not
 * a game change) joins at its current digest, so only game-text changes ever read as stale.
 */
function carriedBaseline(prev: Record<string, string>, now: Record<string, string>, refs: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of refs) {
    const digest = prev[id] ?? now[id];
    if (digest !== undefined) out[id] = digest;
  }
  return out;
}

/** Entities whose game text changed since the baseline, or that vanished from the game data. */
function changedEntities(baseline: Record<string, string>, now: Record<string, string>): string[] {
  return Object.keys(baseline)
    .filter((id) => baseline[id] !== now[id])
    .sort();
}

export function buildRecipeAudit(recipe: CraftRecipe, prov: RecipeProvenance, deps: AuditDeps, prev: RecipeAudit | null, rebaseline: boolean): RecipeAudit {
  const entityRefs = recipeEntityRefs(recipe, prov, deps);
  const digests = currentDigests(entityRefs, deps);
  // a bumped patchVerified means someone re-verified the recipe on newer data: that data is the new baseline
  const keep = prev !== null && !rebaseline && comparePatch(prev.baselinePatch, prov.patchVerified) === 0;
  const baselineDigests = keep ? carriedBaseline(prev.baselineDigests, digests, entityRefs) : digests;
  const steps = recipeLegality(recipe, deps.byExchangeId, deps.gameDataPatch);
  return {
    entityRefs,
    baselinePatch: prov.patchVerified,
    baselineDigests,
    repoeChanged: changedEntities(baselineDigests, digests),
    verdict: overallVerdict(steps),
    steps,
  };
}

export function buildAuditFile(
  recipes: readonly CraftRecipe[],
  provenanceOf: (key: string) => RecipeProvenance,
  deps: AuditDeps,
  prev: RecipeAuditFile | null,
  rebaseline: ReadonlySet<string>,
): RecipeAuditFile {
  const out: Record<string, RecipeAudit> = {};
  for (const r of recipes) out[r.key] = buildRecipeAudit(r, provenanceOf(r.key), deps, prev?.recipes[r.key] ?? null, rebaseline.has(r.key));
  return {
    schema_version: RECIPE_AUDIT_SCHEMA_VERSION,
    artifact_sha256: deps.artifactSha256,
    repoe_version: deps.repoeVersion,
    game_data_patch: deps.gameDataPatch,
    recipes: out,
  };
}

/** Parse audit JSON text or throw naming the first mismatching paths. */
export function parseAuditFile(text: string, where: string): RecipeAuditFile {
  const parsed = recipeAuditFileSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`${where} is malformed — re-run npm run craft:audit-recipes (${issues.join("; ")})`);
  }
  return parsed.data;
}

let cachedAudit: RecipeAuditFile | null = null;
let cachedManifestSha: string | null = null;

/** The committed audit; parsed once per process and throws when missing or malformed. */
export function loadRecipeAudit(): RecipeAuditFile {
  cachedAudit ??= parseAuditFile(readFileSync(RECIPE_AUDIT_PATH, "utf8"), RECIPE_AUDIT_PATH);
  return cachedAudit;
}

const manifestSchema = z.object({ artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/), repoe_version: z.string().min(1) });
const readManifest = () => manifestSchema.parse(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));

function manifestSha(): string {
  cachedManifestSha ??= readManifest().artifact_sha256;
  return cachedManifestSha;
}

/**
 * Audit inputs for the committed snapshot. The manifest, patch coverage and entity catalog must
 * all describe the same RePoE artifact, or the audit would stamp one snapshot with another's text.
 */
export function currentAuditDeps(): AuditDeps {
  const manifest = readManifest();
  const coverage = patchCoverageSchema.parse(JSON.parse(readFileSync(COVERAGE_PATH, "utf8")));
  if (coverage.catalog_sha256 !== manifest.artifact_sha256) {
    throw new Error("patch-coverage.json describes a different RePoE snapshot than repoe/manifest.json");
  }
  const catalog = loadEntityCatalog();
  if (catalog.source_sha256 !== manifest.artifact_sha256) {
    throw new Error("entities.json.gz lags repoe/manifest.json — run npm run sync:entities first");
  }
  return {
    byExchangeId: entityByExchangeId,
    byId: entityById,
    gameDataPatch: coverage.game_data_patch,
    artifactSha256: manifest.artifact_sha256,
    repoeVersion: manifest.repoe_version,
  };
}

export function auditStatus(audit: RecipeAuditFile = loadRecipeAudit()): AuditStatus {
  const violations = Object.values(audit.recipes).reduce((n, r) => n + r.steps.filter((s) => s.verdict === "violation").length, 0);
  return { current: audit.artifact_sha256 === manifestSha(), gameDataPatch: audit.game_data_patch, repoeVersion: audit.repoe_version, violations };
}
