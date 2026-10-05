/*
 * Building blocks shared by the craft-mining schemas (schema.ts, scaffoldSchema.ts): timestamped
 * evidence, source pointers, target roles and the planner method vocabulary. Plain zod with no
 * node or DB imports, so the planner and the UI can import the types later.
 */
import { z } from "zod";
import { ENTITY_ID_PATTERN } from "../../entities/schema";
import { httpsUrl, TIMESTAMP_RANGE_RE } from "../../craftProvenance/schema";

export const CRAFT_MINING_SCHEMA_VERSION = 1;

/**
 * The planner's macro method ids (Method.id in src/core/tools/planner/methods*.ts). A test pins
 * this list to ALL_METHODS, so a renamed or new method fails CI until the vocabulary follows.
 */
export const PLANNER_METHOD_IDS = [
  "magic-loop",
  "magic-aug-filler",
  "regal",
  "strip-junk",
  "plant-junk",
  "fracture",
  "chaos-loop",
  "erasure-loop",
  "whittle-loop",
  "slam-fill",
  "strip-side",
  "contempt",
  "strip-contempt",
  "breach-quality",
  "catalyse-finish",
  "essence-greater",
  "essence-perfect",
  "desecrate",
  "blocker",
] as const;
export const plannerMethodIdSchema = z.enum(PLANNER_METHOD_IDS);
export type PlannerMethodId = z.infer<typeof plannerMethodIdSchema>;

/** What a creator does that no planner method models yet (route skeletons). */
export const UNSUPPORTED = "unsupported" as const;
/** What a creator does that no planner method names (extraction steps). */
export const OTHER = "other" as const;

export const AFFIX_SIDES = ["prefix", "suffix"] as const;
export const affixSideSchema = z.enum(AFFIX_SIDES);
export const CURRENCY_UNITS = ["div", "ex", "chaos"] as const;
export const currencyUnitSchema = z.enum(CURRENCY_UNITS);
/** Where a target member can come from; null when the sources do not say. Mirrors planner TargetSource. */
export const TARGET_SOURCES = ["natural", "essence", "desecrated"] as const;

export const kebabIdSchema = z.string().regex(ENTITY_ID_PATTERN, "expected a kebab-case id");
export const entityIdSchema = z.string().regex(ENTITY_ID_PATTERN, "expected an entity-catalog id");
export const videoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/, "expected an 11-character YouTube video id");
export const timestampSchema = z.string().regex(TIMESTAMP_RANGE_RE, "expected a transcript timestamp like 0:18 or 0:18–0:24");
/** A catalog mod family (craft-catalog.json `family`), e.g. ColdDamage. */
export const familyIdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "expected a craft-catalog family id");

export const MAX_QUOTE_WORDS = 25;
const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** A verbatim transcript fragment: short enough to quote in the UI with a timestamped link. */
export const quoteSchema = z
  .string()
  .min(1)
  .refine((s) => wordCount(s) <= MAX_QUOTE_WORDS, `quotes are at most ${MAX_QUOTE_WORDS} words`);

/** Where in a video something was said — required on every evidence-bearing field. */
export const evidenceFields = { at: timestampSchema, quote: quoteSchema };

/** A point in one of our committed transcripts. */
export const videoPointerSchema = z.object({ videoId: videoIdSchema, at: timestampSchema }).strict();
/** A written source (patch notes, poe2db, a wiki page). */
export const urlPointerSchema = z.object({ url: httpsUrl }).strict();
export const sourcePointerSchema = z.union([videoPointerSchema, urlPointerSchema]);
export type SourcePointer = z.infer<typeof sourcePointerSchema>;
export const isVideoPointer = (p: SourcePointer): p is z.infer<typeof videoPointerSchema> => "videoId" in p;

/** One side of a disagreement, with what that source says. */
export const conflictPositionSchema = z.union([
  videoPointerSchema.extend({ text: z.string().min(1) }),
  urlPointerSchema.extend({ text: z.string().min(1) }),
]);

/** Sources that disagree; the resolution names the winner and why (KB `[cf]` convention). */
export const conflictSchema = z
  .object({
    topic: z.string().min(1),
    positions: z.array(conflictPositionSchema).min(2),
    resolution: z.string().min(1),
    grade: z.literal("cf"),
  })
  .strict();
export type Conflict = z.infer<typeof conflictSchema>;

export const targetMemberSchema = z
  .object({
    family: familyIdSchema,
    label: z.string().min(1),
    source: z.enum(TARGET_SOURCES).nullable(),
  })
  .strict();

/**
 * A wanted slot group: `count` of the `anyOf` families on `side`, each at `minTier` or better
 * ("3 of {cold, fire, lightning, phys} attack flats, T3+"). A single fixed target is count 1 with
 * one member. `minTier` is the worst tier still accepted (3 = T1–T3); null = any tier.
 */
export const targetRoleSchema = z
  .object({
    id: kebabIdSchema,
    side: affixSideSchema,
    count: z.number().int().min(1).max(4),
    anyOf: z.array(targetMemberSchema).min(1),
    minTier: z.number().int().min(1).max(20).nullable(),
    note: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((role, ctx) => {
    const families = role.anyOf.map((m) => m.family);
    if (new Set(families).size !== families.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anyOf"], message: "a family is listed twice" });
    }
    // Mod families are exclusive on an item, so a role cannot want more mods than it has families.
    if (role.count > role.anyOf.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["count"], message: `count ${role.count} exceeds the ${role.anyOf.length} families it may use` });
    }
  });
export type TargetRole = z.infer<typeof targetRoleSchema>;

/** Role ids unique, and no side asked for more than the 4 slots an allowance implicit can give. */
export function checkRoles(roles: readonly TargetRole[], ctx: z.RefinementCtx, path: (string | number)[]): void {
  const ids = roles.map((r) => r.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "target role ids must be unique" });
  for (const side of AFFIX_SIDES) {
    const wanted = roles.filter((r) => r.side === side).reduce((sum, r) => sum + r.count, 0);
    if (wanted > 4) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `roles want ${wanted} ${side}es; an item has at most 4` });
  }
}

/** A number or range a creator states, with its currency. Shared by extraction price fields. */
export const amountFields = {
  value: z.number().nonnegative().nullable(),
  low: z.number().nonnegative().nullable(),
  high: z.number().nonnegative().nullable(),
};

/** At least a point or a full range, and a range that is not upside down. */
export function checkAmount(a: { value: number | null; low: number | null; high: number | null }, ctx: z.RefinementCtx): void {
  if ((a.low === null) !== (a.high === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["low"], message: "low and high come together" });
  }
  if (a.value === null && a.low === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "state a value or a low–high range (use `unresolved` when the creator gives no number)" });
  }
  if (a.low !== null && a.high !== null && a.low > a.high) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["high"], message: "high is below low" });
  }
  if (a.value !== null && a.low !== null && a.high !== null && (a.value < a.low || a.value > a.high)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "value lies outside low–high" });
  }
}
