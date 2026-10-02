import { z } from "zod";
import type { MaterialGroup } from "../../core/craftMaterials";
import { claimVerdictSchema } from "../claim";

/**
 * GET /api/tools/craft-planner and POST /api/tools/craft-planner/plan. Shared by the routes and the
 * (PR 3) planner UI, so a server-side shape change fails the client parse loudly. Client-safe: no
 * server imports. Every odds and cost number carries its basis — zod refuses a number without one.
 */

export const PLANNER_CLASSES = ["Rings", "Amulets", "Belts", "Jewels"] as const;
export const plannerClassSchema = z.enum(PLANNER_CLASSES);

export const BASIS = ["exact", "estimate", "unknown"] as const;
export const basisSchema = z.enum(BASIS);

const sideSchema = z.enum(["prefix", "suffix"]);
const prob = z.number().min(0).max(1);

export const estimateSchema = z
  .object({
    point: prob.nullable(),
    low: prob.nullable(),
    high: prob.nullable(),
    basis: basisSchema,
    formula: z.string().min(1),
    inputs: z.record(z.string(), z.union([z.number(), z.string()])),
  })
  .superRefine((e, ctx) => {
    if (e.low == null || e.high == null) ctx.addIssue({ code: "custom", message: "odds need their bounds" });
    else if (e.point != null && (e.point < e.low - 1e-12 || e.point > e.high + 1e-12)) ctx.addIssue({ code: "custom", message: "odds point outside its band" });
    if (e.basis !== "unknown" && e.point == null) ctx.addIssue({ code: "custom", message: `${e.basis} odds need a point value` });
  });
export type EstimateView = z.infer<typeof estimateSchema>;

export const bandSchema = z
  .object({ point: z.number().nonnegative(), low: z.number().nonnegative(), high: z.number().nonnegative() })
  .refine((b) => b.low <= b.point + 1e-9 && b.point <= b.high + 1e-9, "band must hold low ≤ point ≤ high");
export type BandView = z.infer<typeof bandSchema>;

export const targetSpecSchema = z.object({
  family: z.string().trim().min(1).max(120),
  side: sideSchema,
  /** The minimum tier you accept (its catalog mod id); better tiers count too. */
  minModId: z.string().trim().min(1).max(160),
  /** The finished item must carry this mod fractured. */
  fractured: z.boolean().default(false),
});
export type TargetSpecInput = z.infer<typeof targetSpecSchema>;

export const planRequestSchema = z
  .object({
    itemClass: plannerClassSchema,
    base: z.string().trim().min(1).max(80),
    ilvl: z.number().int().min(1).max(100),
    targets: z.array(targetSpecSchema).min(1, "pick at least one mod").max(6, "an item holds at most 6 affixes"),
    /** Admit methods whose core rule is unverified (each step then carries the badge). */
    includeUnverified: z.boolean().default(false),
    /** Optional finished-item catalyst quality (rings/amulets). */
    quality: z.object({ catalyst: z.string().trim().min(1).max(60), pct: z.number().int().min(1).max(70) }).nullable().default(null),
  })
  .refine((r) => new Set(r.targets.map((t) => t.minModId)).size === r.targets.length, "the same mod is picked twice");
export type PlanRequest = z.infer<typeof planRequestSchema>;

export const feasibilityIssueSchema = z.object({
  severity: z.enum(["impossible", "warn"]),
  rule: z.string(),
  message: z.string(),
  grade: claimVerdictSchema,
  source: z.string(),
  target: z.number().int().nullable(),
});
export type FeasibilityIssueView = z.infer<typeof feasibilityIssueSchema>;

const MATERIAL_GROUP_IDS = ["omen", "essence", "catalyst", "bone", "currency", "delirium", "rune"] as const satisfies readonly MaterialGroup[];
const materialRefSchema = z.object({ id: z.string(), label: z.string(), group: z.enum(MATERIAL_GROUP_IDS) });

export const planMaterialSchema = materialRefSchema.extend({
  /** Expected quantity, retries (and restarts) included — an estimate, never an instruction. */
  qty: bandSchema,
  unitDiv: z.number().positive().nullable(),
  totalDiv: bandSchema.nullable(),
});
export type PlanMaterialView = z.infer<typeof planMaterialSchema>;

const retryRefSchema = z.object({ phase: z.string(), step: z.number().int().positive().optional() });

export const instructionSchema = z.object({
  do: z.string().min(1),
  why: z.string(),
  check: z.string().nullable(),
  pick: z.array(z.string()),
  onFail: z.string().nullable(),
  retryTo: retryRefSchema.nullable(),
});

export const planStepSchema = z.object({
  index: z.number().int().nonnegative(),
  phase: z.string().min(1),
  method: z.string(),
  instructions: z.array(instructionSchema).min(1),
  odds: estimateSchema,
  cost: z.object({ div: bandSchema.nullable(), basis: basisSchema }),
  /** Success chance of a step whose miss restarts the plan on a new base (a fracture), else null. */
  restartP: prob.nullable(),
  materials: z.array(planMaterialSchema),
  rules: z.array(z.string()),
  grade: claimVerdictSchema,
  unverified: z.string().nullable(),
});
export type PlanStepView = z.infer<typeof planStepSchema>;

const guideStepSchema = z.object({
  do: z.string(),
  why: z.string().optional(),
  mats: z.array(materialRefSchema).optional(),
  warning: z.string().optional(),
  onFail: z.string().optional(),
  retryFrom: retryRefSchema.optional(),
  pick: z.array(z.string()).optional(),
  check: z.string().optional(),
  unverified: z.string().optional(),
});

export const craftGuideSchema = z.object({
  goal: z.string(),
  shopping: z.string(),
  marketCheck: z.string(),
  phases: z.array(z.object({ title: z.string().min(1), steps: z.array(guideStepSchema).min(1) })).min(1),
  brick: z.string(),
});

export const planTargetSchema = z.object({
  idx: z.number().int().nonnegative(),
  modId: z.string(),
  text: z.string(),
  side: sideSchema,
  level: z.number().int(),
  source: z.enum(["natural", "essence", "desecrated"]),
  fractured: z.boolean(),
});

export const planResponseSchema = z.object({
  kind: z.literal("plan"),
  league: z.string(),
  base: z.object({ name: z.string(), itemClass: plannerClassSchema, ilvl: z.number().int() }),
  targets: z.array(planTargetSchema),
  feasibility: z.array(feasibilityIssueSchema),
  steps: z.array(planStepSchema).min(1),
  guide: craftGuideSchema,
  bill: z.array(planMaterialSchema),
  /** Expected spend without the base; null while any material is unpriced. */
  totals: z.object({ div: bandSchema.nullable(), exalt: bandSchema.nullable(), basis: basisSchema }),
  unpriced: z.array(z.string()),
  patch: z.object({ rules: z.string(), data: z.string(), repoe: z.string(), reverifyAfter: z.string() }),
  rulesStale: z.boolean(),
  expanded: z.number().int().nonnegative(),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;

/** 422 body: why there is no plan, with the graded rules behind it. */
export const planRejectedSchema = z.object({ error: z.string(), feasibility: z.array(feasibilityIssueSchema) });
export type PlanRejected = z.infer<typeof planRejectedSchema>;

const tierSchema = z.object({ modId: z.string(), level: z.number().int(), text: z.string() });

export const plannerCatalogSchema = z.object({
  kind: z.literal("catalog"),
  classes: z.array(
    z.object({
      itemClass: plannerClassSchema,
      bases: z.array(z.object({ name: z.string(), implicits: z.array(z.string()), caps: z.object({ p: z.number().int(), s: z.number().int() }), qualityCap: z.number().nullable() })),
    }),
  ),
  catalysts: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type PlannerCatalog = z.infer<typeof plannerCatalogSchema>;

export const plannerPoolSchema = z.object({
  kind: z.literal("pool"),
  itemClass: plannerClassSchema,
  base: z.string(),
  families: z.array(
    z.object({
      family: z.string(),
      side: sideSchema,
      source: z.enum(["natural", "essence", "desecrated"]),
      faction: z.enum(["amanamu", "ulaman", "kurgal"]).nullable(),
      tiers: z.array(tierSchema).min(1),
      essences: z.array(z.object({ id: z.string(), label: z.string(), modId: z.string() })),
    }),
  ),
  patch: z.object({ data: z.string(), repoe: z.string() }),
});
export type PlannerPool = z.infer<typeof plannerPoolSchema>;

export const plannerPoolQuerySchema = z.object({ itemClass: plannerClassSchema, base: z.string().trim().min(1).max(80) });
