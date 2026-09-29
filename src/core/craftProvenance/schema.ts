/*
 * Where each curated craft recipe came from and how far to trust it. Plain zod with no node or DB
 * imports: the Craft tab imports these types, and the audit artifact is re-validated with the same
 * schemas on every read, so a hand edit that drifts from the shape fails loudly instead of rendering.
 */
import { z } from "zod";
import { PATCH_VERSION_RE } from "../../sources/patchNotes/contracts";
import { ENTITY_ID_PATTERN } from "../entities/schema";

export const SOURCE_KINDS = ["video", "guide", "kb", "in_game"] as const;
/** primary = the creator's own demonstration; secondary = a write-up of it; anecdote = unlocated. */
export const SOURCE_TIERS = ["primary", "secondary", "anecdote"] as const;
export const RECIPE_STATUSES = ["draft", "reviewed", "stale"] as const;
/** `measured` is never curated: it only comes from logged attempts (calibration.ts). */
export const HIT_RATE_BASES = ["measured", "creator_claim", "unknown"] as const;

export type SourceTier = (typeof SOURCE_TIERS)[number];
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];
export type HitRateBasis = (typeof HIT_RATE_BASES)[number];

/** Round-trips through Date so an overflowing day (2026-02-30) is rejected, not rolled over. */
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "not a real calendar date");

// Rendered as links, so https only (no javascript:/data: hrefs out of a data file).
const httpsUrl = z.string().url().regex(/^https:\/\//, "source URLs must be https");

export const patchVersionSchema = z.string().regex(PATCH_VERSION_RE, "expected a patch version like 0.5.5b");

export const recipeSourceSchema = z
  .object({
    kind: z.enum(SOURCE_KINDS),
    title: z.string().min(1),
    url: httpsUrl.nullable(),
    creator: z.string().min(1).nullable(),
    /** Publication date; null when it could not be confirmed (never guessed). */
    date: isoDay.nullable(),
    tier: z.enum(SOURCE_TIERS),
    /** Repo path of our own copy or summary (transcript, KB section) — evidence a reviewer can open. */
    ref: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.tier !== "anecdote" && s.url === null && s.ref === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tier"], message: `a ${s.tier} source needs a url or a repo ref` });
    }
  });
export type RecipeSource = z.infer<typeof recipeSourceSchema>;

export const curatedHitRateBasisSchema = z
  .object({
    basis: z.enum(["creator_claim", "unknown"]),
    /** The creator's own stated sample ("won 2 of 3" → 3); null when none was stated. */
    n: z.number().int().positive().nullable(),
    /** How the curated rate was derived — shown in the hit-rate tooltip. */
    note: z.string().min(1),
  })
  .strict();

export const recipeProvenanceSchema = z
  .object({
    /** Last patch whose game data the recipe was checked against (KB + RePoE). */
    patchVerified: patchVersionSchema,
    status: z.enum(RECIPE_STATUSES),
    sources: z.array(recipeSourceSchema).min(1),
    hitRateBasis: curatedHitRateBasisSchema,
    /** Entities beyond the bill of materials and guide-step materials, which are always included. */
    extraEntityRefs: z.array(z.string().regex(ENTITY_ID_PATTERN)),
    /** Sections of docs/research/poe2-crafting-knowledge.md the recipe relies on ("§2", "§9b"). */
    kbRuleRefs: z.array(z.string().regex(/^§\d+b?$/)).min(1),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.status === "reviewed" && p.sources.every((s) => s.tier === "anecdote")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "a reviewed recipe needs a non-anecdote source" });
    }
  });
export type RecipeProvenance = z.infer<typeof recipeProvenanceSchema>;

// ---------------------------------------------------------------------------------------------
// Step legality (legality.ts) and the stamped audit artifact (auditCraftRecipes.ts)
// ---------------------------------------------------------------------------------------------

export const LEGALITY_VERDICTS = ["ok", "violation", "unknown"] as const;
export type LegalityVerdict = (typeof LEGALITY_VERDICTS)[number];
export const LEGALITY_CHECKS = ["catalog", "floor", "ilvl", "pairing"] as const;

export const legalityCheckSchema = z
  .object({
    kind: z.enum(LEGALITY_CHECKS),
    verdict: z.enum(LEGALITY_VERDICTS),
    detail: z.string().min(1),
    source: z.string().min(1),
  })
  .strict();
export type LegalityCheck = z.infer<typeof legalityCheckSchema>;

export const stepLegalitySchema = z
  .object({
    /** Index into guide.phases.flatMap(p => p.steps) — the order the craft session walks. */
    idx: z.number().int().nonnegative(),
    verdict: z.enum(LEGALITY_VERDICTS),
    checks: z.array(legalityCheckSchema).min(1),
  })
  .strict();
export type StepLegality = z.infer<typeof stepLegalitySchema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const digestSchema = z.string().regex(/^[a-f0-9]{16}$/);

export const recipeAuditSchema = z
  .object({
    entityRefs: z.array(z.string().regex(ENTITY_ID_PATTERN)),
    /** The patch the baseline below belongs to; a bumped patchVerified re-baselines. */
    baselinePatch: patchVersionSchema,
    /** Per-entity digest of its game text when the recipe was last verified. */
    baselineDigests: z.record(z.string(), digestSchema),
    /** Entities whose game text changed (or vanished) in RePoE since that baseline. */
    repoeChanged: z.array(z.string()),
    verdict: z.enum(LEGALITY_VERDICTS),
    steps: z.array(stepLegalitySchema),
  })
  .strict();
export type RecipeAudit = z.infer<typeof recipeAuditSchema>;

export const RECIPE_AUDIT_SCHEMA_VERSION = 1;

export const recipeAuditFileSchema = z
  .object({
    schema_version: z.literal(RECIPE_AUDIT_SCHEMA_VERSION),
    artifact_sha256: sha256Schema,
    repoe_version: z.string().min(1),
    game_data_patch: patchVersionSchema,
    recipes: z.record(z.string(), recipeAuditSchema),
  })
  .strict();
export type RecipeAuditFile = z.infer<typeof recipeAuditFileSchema>;

// ---------------------------------------------------------------------------------------------
// What the Craft tab receives per recipe (margins route)
// ---------------------------------------------------------------------------------------------

export type StaleReason =
  | { kind: "patch"; version: string; threadId: number; title: string; items: string[] }
  | { kind: "repoe"; entities: string[] };

export interface HitRateView {
  /** The curated estimate from the recipe data. */
  model: number;
  /** hits ÷ closed attempts across every user's log; null before the first closed attempt. */
  measured: number | null;
  /** Closed (hit or brick) attempts behind `measured`. */
  n: number;
  /** What the EV uses: `measured` once n reaches the calibration minimum, else `model`. */
  effective: number;
  basis: HitRateBasis;
  /** The creator's own sample size when the basis is a creator claim. */
  claimN: number | null;
  note: string;
}

export interface ProvenanceView {
  status: RecipeStatus;
  patchVerified: string;
  sources: RecipeSource[];
  kbRuleRefs: string[];
  stale: StaleReason[];
  hitRate: HitRateView;
  /** Legality per guide step (flat index); empty when the audit has no entry. */
  steps: StepLegality[];
  legality: LegalityVerdict;
}

export interface AuditStatus {
  /** The committed audit was built from the RePoE snapshot the app runs on. */
  current: boolean;
  gameDataPatch: string;
  repoeVersion: string;
  violations: number;
}
