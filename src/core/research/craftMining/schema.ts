/*
 * Craft route mining (docs/research/craft-mining, src/data/poe2/craft/{routes,priors}): what one
 * creator video says (extraction), the route skeletons synthesised from several videos (route
 * templates) and the measured numbers the planner may use instead of its equal prior (priors).
 * Every number carries the transcript timestamp it came from; "unstated" (or null) is always a
 * legal answer and nothing is inferred. A weight a creator reads off a third-party table is kept
 * as `howMeasured: table_reading` and can never become a prior.
 */
import { z } from "zod";
import { claimSchema } from "../../../lib/claim";
import { plannerClassSchema } from "../../../lib/tools/craftPlannerContract";
import {
  creatorClaimSchema,
  isoDay,
  patchVersionSchema,
  RECIPE_STATUSES,
  recipeDurabilitySchema,
  recipeSourceSchema,
} from "../../craftProvenance/schema";
import { patchStampSchema } from "../../strategies/schema";
import { OUT_OF_PATCH_IDS, outOfPatchFor } from "./outOfPatch";
import {
  affixSideSchema,
  amountFields,
  checkAmount,
  checkRoles,
  conflictSchema,
  CRAFT_MINING_SCHEMA_VERSION,
  currencyUnitSchema,
  entityIdSchema,
  evidenceFields,
  isVideoPointer,
  kebabIdSchema,
  OTHER,
  plannerMethodIdSchema,
  sourcePointerSchema,
  targetRoleSchema,
  UNSUPPORTED,
  videoIdSchema,
} from "./schemaParts";

export { CRAFT_MINING_SCHEMA_VERSION };

const nonEmpty = z.string().min(1);
const issue = (ctx: z.RefinementCtx, path: (string | number)[], message: string): void => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

// ---------------------------------------------------------------------------------------------
// Stage X — one video, extracted (docs/research/craft-mining/<archetype>/extractions/<videoId>.json)
// ---------------------------------------------------------------------------------------------

export const MEASURED_QUANTITIES = ["hit_rate", "multiplier", "brick_rate", "reveal_offered", "per_use_quality"] as const;
/** own_attempts = the creator counted their own tries; table_reading = read off a weight tool; statement = said without a count. */
export const HOW_MEASURED = ["own_attempts", "table_reading", "statement"] as const;
export const EXTRACTION_CLAIM_KINDS = ["cost", "sale", "material_price", "odds"] as const;
const tierLabelSchema = z.string().regex(/^(?:T\d{1,2}|unstated)$/, 'expected a tier like "T1" or "unstated"');
const extractionActionSchema = z.union([plannerMethodIdSchema, z.literal(OTHER)]);

const priceClaimSchema = z
  .object({ ...amountFields, unit: currencyUnitSchema, ...evidenceFields })
  .strict()
  .superRefine((a, ctx) => checkAmount(a, ctx));

const extractionBaseSchema = z
  .object({
    name: nonEmpty,
    ilvl: z.number().int().min(1).max(100).nullable(),
    bought: z.union([z.boolean(), z.literal("unstated")]),
    boughtState: z
      .object({
        fracturedMods: z.array(z.object({ text: nonEmpty, tier: tierLabelSchema }).strict()),
        otherMods: z.array(nonEmpty),
      })
      .strict()
      .nullable(),
    priceClaim: priceClaimSchema.nullable(),
    ...evidenceFields,
  })
  .strict();

const extractionStepSchema = z
  .object({
    order: z.number().int().min(1),
    action: extractionActionSchema,
    materials: z.array(entityIdSchema),
    omens: z.array(entityIdSchema),
    side: affixSideSchema.nullable(),
    target: z.object({ text: nonEmpty, acceptedTiers: z.array(tierLabelSchema).min(1) }).strict().nullable(),
    ...evidenceFields,
    note: nonEmpty.nullable(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.action === OTHER && s.note === null) issue(ctx, ["note"], 'an "other" action must say what the creator does');
  });

const missHandlingSchema = z
  .object({
    afterStep: z.number().int().min(1),
    trigger: nonEmpty,
    repair: extractionActionSchema,
    retryTo: z.number().int().min(1),
    ...evidenceFields,
    note: nonEmpty.nullable(),
  })
  .strict();

const measuredSchema = z
  .object({
    quantity: z.enum(MEASURED_QUANTITIES),
    ...amountFields,
    n: z.number().int().positive().nullable(),
    howMeasured: z.enum(HOW_MEASURED),
    context: nonEmpty,
    ...evidenceFields,
  })
  .strict()
  .superRefine((m, ctx) => checkAmount(m, ctx));

const extractionClaimSchema = z
  .object({
    kind: z.enum(EXTRACTION_CLAIM_KINDS),
    text: nonEmpty,
    ...amountFields,
    unit: currencyUnitSchema.nullable(),
    /** The priced material for a material_price claim (era prices for the market-reality tests). */
    material: entityIdSchema.nullable(),
    /** When the number held ("late league", "week 1 of 0.5") — prices are never timeless. */
    dateContext: nonEmpty,
    ...evidenceFields,
  })
  .strict()
  .superRefine((c, ctx) => {
    checkAmount(c, ctx);
    if (c.kind !== "odds" && c.unit === null) issue(ctx, ["unit"], `a ${c.kind} claim needs a currency unit`);
    if ((c.kind === "material_price") !== (c.material !== null)) issue(ctx, ["material"], "a material_price claim names its material, and only it does");
  });

function checkSteps(x: { steps: { order: number }[]; missHandling: { afterStep: number; retryTo: number }[] }, ctx: z.RefinementCtx): void {
  const orders = x.steps.map((s) => s.order);
  orders.forEach((o, i) => {
    if (i > 0 && o <= orders[i - 1]!) issue(ctx, ["steps", i, "order"], "step orders must be strictly increasing");
  });
  const known = new Set(orders);
  x.missHandling.forEach((m, i) => {
    if (!known.has(m.afterStep)) issue(ctx, ["missHandling", i, "afterStep"], `no step ${m.afterStep}`);
    if (!known.has(m.retryTo)) issue(ctx, ["missHandling", i, "retryTo"], `no step ${m.retryTo}`);
  });
}

/** A step that spends an out-of-patch material must be flagged, naming that mechanic. */
function checkOutOfPatch(
  x: { steps: { materials: string[]; omens: string[] }[]; patch: { outOfPatch: { flag: boolean; reasons: string[]; mechanics: string[] } } },
  ctx: z.RefinementCtx,
): void {
  const oop = x.patch.outOfPatch;
  if (oop.flag !== oop.reasons.length > 0) issue(ctx, ["patch", "outOfPatch", "reasons"], "a flagged video gives reasons, and only a flagged one does");
  if (oop.mechanics.length > 0 && !oop.flag) issue(ctx, ["patch", "outOfPatch", "flag"], "a video using out-of-patch mechanics must be flagged");
  x.steps.forEach((s, i) => {
    for (const id of [...s.materials, ...s.omens]) {
      const row = outOfPatchFor(id);
      if (row && !oop.mechanics.includes(row.id)) issue(ctx, ["steps", i], `${id} is out of patch (${row.id}); flag it in patch.outOfPatch.mechanics`);
    }
  });
}

export const craftVideoExtractionSchema = z
  .object({
    schema_version: z.literal(CRAFT_MINING_SCHEMA_VERSION),
    videoId: videoIdSchema,
    title: nonEmpty.nullable(),
    creator: nonEmpty,
    publishedAt: isoDay.nullable(),
    /** Our committed transcript (docs/kb/sources/transcripts/NN-slug.txt) the timestamps refer to. */
    transcriptRef: z.string().regex(/^docs\/kb\/sources\/transcripts\/\d{2,}-[a-z0-9-]+\.txt$/),
    patch: z
      .object({
        /** What the creator says ("0.5", "Runes of Aldur"), verbatim; null when unstated. */
        stated: nonEmpty.nullable(),
        /** Computed from publishedAt against the patch-notes index; null while publishedAt is unknown. */
        atUpload: patchVersionSchema.nullable(),
        outOfPatch: z
          .object({
            flag: z.boolean(),
            reasons: z.array(nonEmpty),
            mechanics: z.array(z.string().refine((id) => OUT_OF_PATCH_IDS.includes(id), "not an out-of-patch id (outOfPatch.ts)")),
          })
          .strict(),
      })
      .strict(),
    language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
    archetypes: z.array(kebabIdSchema).min(1),
    base: extractionBaseSchema,
    steps: z.array(extractionStepSchema).min(1),
    missHandling: z.array(missHandlingSchema),
    qualityPath: z
      .object({
        catalyst: entityIdSchema.nullable(),
        pct: z.number().int().min(0).max(100).nullable(),
        orderNote: nonEmpty,
        at: evidenceFields.at,
      })
      .strict()
      .nullable(),
    measured: z.array(measuredSchema),
    claims: z.array(extractionClaimSchema),
    salvage: z.array(z.object({ when: nonEmpty, action: nonEmpty, valueClaim: nonEmpty.nullable(), ...evidenceFields }).strict()),
    caveats: z.array(nonEmpty),
    unresolved: z.array(nonEmpty),
  })
  .strict()
  .superRefine((x, ctx) => {
    checkSteps(x, ctx);
    checkOutOfPatch(x, ctx);
  });
export type CraftVideoExtraction = z.infer<typeof craftVideoExtractionSchema>;

// ---------------------------------------------------------------------------------------------
// Stage S — route templates (src/data/poe2/craft/routes/<archetype>.json)
// ---------------------------------------------------------------------------------------------

/** How the craft begins. The bought kinds put a purchase in the player's plan, so the planner asks first. */
export const START_KINDS = ["bought_fractured_target", "bought_magic_with_target", "clean", "anchored"] as const;
export type StartKind = (typeof START_KINDS)[number];
export const ROUTE_TIERS = ["budget", "mid", "high"] as const;

/** A creator's dated money claim (cost, sale, base ask), on top of the provenance creator claim. */
export const pricedCreatorClaimSchema = creatorClaimSchema
  .extend({
    low: z.number().nonnegative(),
    high: z.number().nonnegative(),
    unit: currencyUnitSchema,
    dateContext: nonEmpty,
  })
  .superRefine((c, ctx) => {
    if (c.low > c.high) issue(ctx, ["high"], "high is below low");
  });

const methodOrUnsupported = z.union([plannerMethodIdSchema, z.literal(UNSUPPORTED)]);

const routeStartSchema = z
  .object({
    kind: z.enum(START_KINDS),
    /** Target roles the bought base already carries (by role id). */
    carried: z.array(z.object({ role: kebabIdSchema, fractured: z.boolean() }).strict()),
    askClaims: z.array(pricedCreatorClaimSchema),
    /** Owner rule 2026-10-05: a purchase-based start is offered, never chosen silently. */
    requiresPlayerConsent: z.boolean(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const bought = s.kind === "bought_fractured_target" || s.kind === "bought_magic_with_target";
    if (bought !== s.carried.length > 0) issue(ctx, ["carried"], "a bought start carries at least one target role, and only a bought one does");
    if (bought !== s.requiresPlayerConsent) issue(ctx, ["requiresPlayerConsent"], "a bought start must ask the player, and only a bought one does");
    if (s.kind === "bought_fractured_target" && !s.carried.some((c) => c.fractured)) issue(ctx, ["carried"], "a bought-fractured start carries a fractured role");
    if (s.kind === "bought_magic_with_target" && s.carried.some((c) => c.fractured)) issue(ctx, ["carried"], "a bought magic base carries no fractured mod");
  });

const skeletonStepSchema = z
  .object({
    phase: z.number().int().min(1),
    method: methodOrUnsupported,
    side: affixSideSchema.nullable(),
    targetRole: kebabIdSchema.nullable(),
    note: nonEmpty.nullable(),
    sources: z.array(creatorClaimSchema).min(1),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.method === UNSUPPORTED && s.note === null) issue(ctx, ["note"], "an unsupported phase must say what the creators do");
  });

const salvageSchema = z
  .object({ id: kebabIdSchema, action: nonEmpty, method: methodOrUnsupported, valueClaims: z.array(pricedCreatorClaimSchema) })
  .strict();

type RouteRefs = {
  targetRoles: { id: string }[];
  start: { carried: { role: string }[]; askClaims: { sourceRef: string }[] };
  skeleton: { phase: number; targetRole: string | null; sources: { sourceRef: string }[] }[];
  decisionPoints: { afterPhase: number; salvage: string }[];
  salvage: { id: string; valueClaims: { sourceRef: string }[] }[];
  costClaims: { sourceRef: string }[];
  saleClaims: { sourceRef: string }[];
  sources: { ref: string | null }[];
};

function checkRouteRefs(r: RouteRefs, ctx: z.RefinementCtx): void {
  const roles = new Set(r.targetRoles.map((t) => t.id));
  r.start.carried.forEach((c, i) => {
    if (!roles.has(c.role)) issue(ctx, ["start", "carried", i, "role"], `no target role "${c.role}"`);
  });
  const phases = r.skeleton.map((s) => s.phase);
  r.skeleton.forEach((s, i) => {
    if (i > 0 && s.phase <= phases[i - 1]!) issue(ctx, ["skeleton", i, "phase"], "phases must be strictly increasing");
    if (s.targetRole !== null && !roles.has(s.targetRole)) issue(ctx, ["skeleton", i, "targetRole"], `no target role "${s.targetRole}"`);
  });
  const salvageIds = new Set(r.salvage.map((s) => s.id));
  if (salvageIds.size !== r.salvage.length) issue(ctx, ["salvage"], "salvage ids must be unique");
  r.decisionPoints.forEach((d, i) => {
    if (!phases.includes(d.afterPhase)) issue(ctx, ["decisionPoints", i, "afterPhase"], `no phase ${d.afterPhase}`);
    if (!salvageIds.has(d.salvage)) issue(ctx, ["decisionPoints", i, "salvage"], `no salvage "${d.salvage}"`);
  });
  const refs = new Set(r.sources.map((s) => s.ref));
  const claims = [...r.start.askClaims, ...r.skeleton.flatMap((s) => s.sources), ...r.salvage.flatMap((s) => s.valueClaims), ...r.costClaims, ...r.saleClaims];
  for (const c of claims) if (!refs.has(c.sourceRef)) issue(ctx, ["sources"], `claim sourceRef "${c.sourceRef}" is not the ref of any source`);
}

export const routeTemplateSchema = z
  .object({
    id: kebabIdSchema,
    archetype: kebabIdSchema,
    itemClass: plannerClassSchema,
    bases: z.array(nonEmpty).min(1),
    tier: z.enum(ROUTE_TIERS),
    patch: patchStampSchema,
    status: z.enum(RECIPE_STATUSES),
    targetRoles: z.array(targetRoleSchema).min(1),
    start: routeStartSchema,
    preconditions: z
      .object({
        ilvlMin: z.number().int().min(1).max(100).nullable(),
        quality: z.object({ catalyst: entityIdSchema, pct: z.number().int().min(1).max(100) }).strict().nullable(),
      })
      .strict(),
    skeleton: z.array(skeletonStepSchema).min(1),
    decisionPoints: z.array(
      z.object({ afterPhase: z.number().int().min(1), acceptLadder: z.array(z.number().int().min(1).max(20)).min(1), salvage: kebabIdSchema }).strict(),
    ),
    salvage: z.array(salvageSchema),
    costClaims: z.array(pricedCreatorClaimSchema),
    saleClaims: z.array(pricedCreatorClaimSchema),
    durability: recipeDurabilitySchema,
    sources: z.array(recipeSourceSchema).min(1),
    conflicts: z.array(conflictSchema),
  })
  .strict()
  .superRefine((r, ctx) => {
    checkRoles(r.targetRoles, ctx, ["targetRoles"]);
    checkRouteRefs(r, ctx);
  });
export type RouteTemplate = z.infer<typeof routeTemplateSchema>;

export const routeFileSchema = z
  .object({
    schema_version: z.literal(CRAFT_MINING_SCHEMA_VERSION),
    archetype: kebabIdSchema,
    templates: z.array(routeTemplateSchema).min(1),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = f.templates.map((t) => t.id);
    if (new Set(ids).size !== ids.length) issue(ctx, ["templates"], "template ids must be unique");
    f.templates.forEach((t, i) => {
      if (t.archetype !== f.archetype) issue(ctx, ["templates", i, "archetype"], `expected "${f.archetype}"`);
    });
  });
export type RouteFile = z.infer<typeof routeFileSchema>;

// ---------------------------------------------------------------------------------------------
// Stage S — empirical priors (src/data/poe2/craft/priors/{global,<itemClass>}.json)
// ---------------------------------------------------------------------------------------------

/** No `table_reading` here on purpose: a number read off a third-party weight tool is never a prior. */
export const PRIOR_BASES = ["creator_measured", "creator_stated", "community_model", "owner_test"] as const;

/** The planner inputs a prior may set (research-pipeline-plan §2.5). */
export const PRIOR_KEY_PATTERNS: readonly RegExp[] = [
  /^catalysing\.multiplier@\d{1,3}$/,
  /^reveal\.(?:options|lichMin)$/,
  /^reveal\.lightLoopAnchor\.[a-z0-9-]+$/,
  /^tierWeight\.[A-Za-z]+\.(?:prefix|suffix)\.[A-Za-z][A-Za-z0-9_]*\.\d{1,3}$/,
  /^pool\.desecrated\.physFactor$/,
  /^catalyst\.qualityPerUse@ilvl\d{1,3}$/,
  /^brick\.[a-z0-9-]+$/,
];

export const priorEntrySchema = z
  .object({
    key: nonEmpty.refine((k) => PRIOR_KEY_PATTERNS.some((re) => re.test(k)), "not a known prior key (see PRIOR_KEY_PATTERNS)"),
    value: z.object({ point: z.number().nonnegative(), low: z.number().nonnegative(), high: z.number().nonnegative() }).strict(),
    basis: z.enum(PRIOR_BASES),
    n: z.number().int().positive().nullable(),
    sources: z.array(sourcePointerSchema),
    claim: claimSchema,
    patch: patchVersionSchema,
    conflicts: z.array(conflictSchema),
  })
  .strict()
  .superRefine((p, ctx) => {
    const { point, low, high } = p.value;
    if (!(low <= point && point <= high)) issue(ctx, ["value"], "expected low <= point <= high");
    const videos = p.sources.filter(isVideoPointer).length;
    if ((p.basis === "creator_measured" || p.basis === "creator_stated") && videos === 0) issue(ctx, ["sources"], `a ${p.basis} prior cites a video timestamp`);
    if (p.basis === "community_model" && p.sources.length === videos) issue(ctx, ["sources"], "a community_model prior cites the model's URL");
    if ((p.basis === "creator_measured" || p.basis === "owner_test") && p.n === null) issue(ctx, ["n"], `a ${p.basis} prior states its sample size`);
  });
export type PriorEntry = z.infer<typeof priorEntrySchema>;

export const priorsFileSchema = z
  .object({
    schema_version: z.literal(CRAFT_MINING_SCHEMA_VERSION),
    /** "global" (global.json) or the planner item class it applies to (rings.json → "Rings"). */
    scope: z.union([z.literal("global"), plannerClassSchema]),
    entries: z.array(priorEntrySchema).min(1),
  })
  .strict()
  .superRefine((f, ctx) => {
    const keys = f.entries.map((e) => e.key);
    if (new Set(keys).size !== keys.length) issue(ctx, ["entries"], "prior keys must be unique within a file");
  });
export type PriorsFile = z.infer<typeof priorsFileSchema>;
