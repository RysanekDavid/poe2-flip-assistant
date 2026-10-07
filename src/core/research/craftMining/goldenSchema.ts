/*
 * The golden craft set (docs/research/craft-mining/golden/<id>.json): real crafts a creator or the
 * owner finished, with the route, the expected material uses and the market price, so `npm run
 * craft:eval` can score the planner against them. Spec: scratchpad craft-planner/golden-spec.md.
 * Plain zod, no node or DB imports.
 */
import { z } from "zod";
import { planRequestSchema } from "../../../lib/tools/craftPlannerContract";
import { isoDay } from "../../craftProvenance/schema";
import { PLANNER_MATERIAL_IDS } from "../../tools/planner/materialIds";
import { kebabIdSchema, timestampSchema, videoIdSchema } from "./schemaParts";

export const GOLDEN_SCHEMA_VERSION = 1;

/** Files in the golden directory that are not golden entries. */
export const GOLDEN_RESERVED_FILES = ["prices.snapshot.json", "scoreboard.json"] as const;

/**
 * Route vocabulary shared by the creator side (written by hand) and the planner side (derived from
 * the plan's steps by goldenTags.ts), so the two can be compared with a Jaccard overlap.
 */
export const GOLDEN_TAGS = [
  "bought-base",
  "fracture-target",
  "anchored-junk",
  "chaos-loop",
  "essence",
  "greater-exalt",
  "perfect-exalt",
  "exalt-omen-side",
  "annul",
  "whittle",
  "desecrate",
  "omen-light",
  "omen-echoes",
  "catalyse",
  "alloy",
  "liquid",
  "magic-loop",
  "regal",
  "erasure",
] as const;
export const goldenTagSchema = z.enum(GOLDEN_TAGS);
export type GoldenTag = z.infer<typeof goldenTagSchema>;

const nonEmpty = z.string().min(1);
const issue = (ctx: z.RefinementCtx, path: (string | number)[], message: string): void => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

/** An expected amount with its spread: low ≤ point ≤ high. */
export const goldenBandSchema = z
  .object({ point: z.number().nonnegative(), low: z.number().nonnegative(), high: z.number().nonnegative() })
  .strict()
  .refine((b) => b.low <= b.point && b.point <= b.high, "band must hold low ≤ point ≤ high");
export type GoldenBand = z.infer<typeof goldenBandSchema>;

const MATERIAL_IDS = new Set(PLANNER_MATERIAL_IDS);
export const plannerMaterialIdSchema = z.string().refine((id) => MATERIAL_IDS.has(id), (id) => ({ message: `"${id}" is not a planner material id (src/core/tools/planner/materialIds.ts)` }));

const materialUseSchema = z
  .object({
    id: plannerMaterialIdSchema,
    /** Uses for ONE successful finished item, expected (not best case). */
    uses: goldenBandSchema.refine((b) => b.point > 0, "a listed material is used at least a little"),
  })
  .strict();

export const goldenCreatorSchema = z
  .object({
    tags: z.array(goldenTagSchema).min(1),
    materials: z.array(materialUseSchema),
    /** The bought base, in Divine; null for a crafted-from-clean route. */
    baseDiv: goldenBandSchema.nullable(),
    /** What the creator said the craft costs, at their league's prices. */
    statedTotalDiv: goldenBandSchema.nullable(),
    steps: z.array(nonEmpty).min(1),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (new Set(c.tags).size !== c.tags.length) issue(ctx, ["tags"], "a tag is listed twice");
    const ids = c.materials.map((m) => m.id);
    if (new Set(ids).size !== ids.length) issue(ctx, ["materials"], "a material is listed twice; sum its uses");
    if (c.materials.length === 0 && c.baseDiv === null) issue(ctx, ["materials"], "a route costs something: list materials or a bought base");
  });
export type GoldenCreator = z.infer<typeof goldenCreatorSchema>;

export const goldenMarketSchema = z.object({ priceDiv: goldenBandSchema, date: isoDay, source: nonEmpty }).strict();

const httpsUrl = z.string().url().refine((u) => u.startsWith("https://"), "expected an https URL");

export const goldenSourceSchema = z
  .object({
    kind: z.enum(["video", "web", "owner"]),
    /** youtube id | url | note */
    ref: nonEmpty,
    at: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.kind === "video" && !videoIdSchema.safeParse(s.ref).success) issue(ctx, ["ref"], "a video source names its 11-character YouTube id");
    if (s.kind === "web" && !httpsUrl.safeParse(s.ref).success) issue(ctx, ["ref"], "a web source names its https URL");
    if (s.kind !== "video" && s.at !== null) issue(ctx, ["at"], "only a video source has a timestamp");
  });

export const goldenFactCheckSchema = z.object({ date: isoDay, verdict: z.enum(["ok", "fixed", "disputed"]), notes: nonEmpty }).strict();

/**
 * How the harness starts the planner. "request": exactly planRequest.start. "compare": what the
 * planner UI does by default — a clean plan and a bought-base plan (the planner picks what the base
 * carries), the cheaper one counting the base at creator.baseDiv. Not in the first spec draft; added
 * because the owner's own case is a compare and planRequest (the API contract) has no such start.
 */
export const START_MODES = ["request", "compare"] as const;

export const goldenEntrySchema = z
  .object({
    id: kebabIdSchema,
    archetype: kebabIdSchema,
    /** The game patch the craft was done on. */
    patch: z.string().regex(/^\d+\.\d+(?:\.\d+[a-z]?)?$/, "expected a patch like 0.5 or 0.5.5b"),
    league: nonEmpty,
    summary: nonEmpty,
    planRequest: planRequestSchema,
    startMode: z.enum(START_MODES).default("request"),
    creator: goldenCreatorSchema,
    market: goldenMarketSchema.nullable(),
    sources: z.array(goldenSourceSchema).min(1),
    confidence: z.enum(["high", "medium", "low"]),
    factCheck: goldenFactCheckSchema.nullable(),
  })
  .strict()
  .superRefine((g, ctx) => {
    if (g.startMode === "compare" && g.planRequest.start && g.planRequest.start.kind !== "clean") issue(ctx, ["startMode"], "compare plans a clean and a bought start itself: leave planRequest.start out");
  });
export type GoldenEntry = z.infer<typeof goldenEntrySchema>;
export type GoldenEntryInput = z.input<typeof goldenEntrySchema>;
