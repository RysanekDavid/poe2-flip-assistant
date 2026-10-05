/*
 * The per-archetype research files around the extractions (docs/research/craft-mining/<id>/):
 * archetype.json (what is mined and how), candidates.json (every video looked at, kept or dropped
 * with a reason so a refresh never re-evaluates it) and market-sample.json (listed items the
 * owner observed, for the market-reality golden). Strict zod; research:validate parses them.
 */
import { z } from "zod";
import { plannerClassSchema } from "../../../lib/tools/craftPlannerContract";
import { httpsUrl, isoDay, patchVersionSchema } from "../../craftProvenance/schema";
import { OUT_OF_PATCH_IDS } from "./outOfPatch";
import { affixSideSchema, checkRoles, CRAFT_MINING_SCHEMA_VERSION, kebabIdSchema, targetRoleSchema, videoIdSchema } from "./schemaParts";

const nonEmpty = z.string().min(1);
const issue = (ctx: z.RefinementCtx, path: (string | number)[], message: string): void => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
const outOfPatchIdSchema = z.string().refine((id) => OUT_OF_PATCH_IDS.includes(id), "not an out-of-patch id (outOfPatch.ts)");
const transcriptRefSchema = z.string().regex(/^docs\/kb\/sources\/transcripts\/\d{2,}-[a-z0-9-]+\.txt$/);

export const archetypeSchema = z
  .object({
    schema_version: z.literal(CRAFT_MINING_SCHEMA_VERSION),
    id: kebabIdSchema,
    itemClass: plannerClassSchema,
    bases: z.array(nonEmpty).min(1),
    targets: z.array(targetRoleSchema).min(1),
    /** Videos published before the first patch of the line are not mined (discovery `publishedAfter`). */
    patchFloor: z
      .object({
        version: patchVersionSchema,
        /** Publication date of that patch's notes, from the patch-notes index. */
        notesPublished: isoDay,
        threadId: z.number().int().positive(),
        url: httpsUrl,
        note: nonEmpty,
      })
      .strict(),
    excludedMechanics: z.array(outOfPatchIdSchema),
    queries: z.array(z.object({ text: nonEmpty, lang: z.enum(["en", "cs"]) }).strict()).min(1),
    /** At most this many kept videos per channel, so one creator cannot outvote the rest. */
    creatorCap: z.number().int().min(1),
    /** Distinct creators the kept set needs before synthesis may grade anything above single-source. */
    minCreators: z.number().int().min(1),
    notes: z.array(nonEmpty),
  })
  .strict()
  .superRefine((a, ctx) => checkRoles(a.targets, ctx, ["targets"]));
export type Archetype = z.infer<typeof archetypeSchema>;

export const CANDIDATE_DECISIONS = ["kept", "dropped"] as const;

export const candidateSchema = z
  .object({
    videoId: videoIdSchema,
    url: httpsUrl,
    /** From YouTube oEmbed; null when never fetched — never a placeholder. */
    title: nonEmpty.nullable(),
    creator: nonEmpty.nullable(),
    channelUrl: httpsUrl.nullable(),
    publishedAt: isoDay.nullable(),
    decision: z.enum(CANDIDATE_DECISIONS),
    reason: nonEmpty,
    outOfPatch: z.array(outOfPatchIdSchema),
    /** A dropped video still worth citing for one mechanic (its transcript stays committed). */
    useAsReference: z.boolean(),
    transcriptRef: transcriptRefSchema.nullable(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (!c.url.includes(c.videoId)) issue(ctx, ["url"], "the url must be the video's own");
    if (c.decision === "kept" && c.creator === null) issue(ctx, ["creator"], "a kept video names its creator (creator cap)");
    if ((c.decision === "kept" || c.useAsReference) && c.transcriptRef === null) issue(ctx, ["transcriptRef"], "a kept or reference video has a committed transcript");
    if (c.decision === "kept" && c.useAsReference) issue(ctx, ["useAsReference"], "only a dropped video is reference-only");
  });
export type Candidate = z.infer<typeof candidateSchema>;

export const candidatesFileSchema = z
  .object({
    schema_version: z.literal(CRAFT_MINING_SCHEMA_VERSION),
    archetype: kebabIdSchema,
    candidates: z.array(candidateSchema).min(1),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = f.candidates.map((c) => c.videoId);
    if (new Set(ids).size !== ids.length) issue(ctx, ["candidates"], "a video is listed twice");
  });
export type CandidatesFile = z.infer<typeof candidatesFileSchema>;

export const ATTACK_DAMAGE_TYPES = ["physical", "fire", "cold", "lightning"] as const;

const marketItemSchema = z
  .object({
    /** The rare's generated name, as listed. */
    name: nonEmpty,
    ilvl: z.number().int().min(1).max(100).nullable(),
    fractured: z
      .object({
        side: affixSideSchema,
        kind: z.enum(["attack_flat", "other"]),
        /** Rolled text when the notes recorded it; null when only its kind was noted. */
        text: nonEmpty.nullable(),
      })
      .strict(),
    /** The attack flats on the prefixes, the fractured one included. */
    prefixFlats: z.array(z.object({ damage: z.enum(ATTACK_DAMAGE_TYPES), note: nonEmpty.nullable() }).strict()).max(4),
    /** Per-item suffix lines; null when the notes kept only the sample-wide list. */
    suffixes: z.array(nonEmpty).nullable(),
    askDiv: z.number().positive().nullable(),
  })
  .strict();

export const marketSampleSchema = z
  .object({
    schema_version: z.literal(CRAFT_MINING_SCHEMA_VERSION),
    archetype: kebabIdSchema,
    observedAt: isoDay,
    source: z.object({ kind: z.literal("owner_trade_listings"), note: nonEmpty }).strict(),
    common: z
      .object({
        base: nonEmpty,
        ilvlRange: z.object({ min: z.number().int().min(1), max: z.number().int().max(100) }).strict(),
        quality: z.object({ modifiers: nonEmpty, pct: z.number().int().min(1).max(100) }).strict(),
        implicits: z.array(nonEmpty),
      })
      .strict(),
    items: z.array(marketItemSchema).min(1),
    fracturedFlatsObserved: z.array(nonEmpty),
    suffixesObserved: z.array(nonEmpty),
    notes: z.array(nonEmpty),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.common.ilvlRange.min > m.common.ilvlRange.max) issue(ctx, ["common", "ilvlRange"], "min above max");
  });
export type MarketSample = z.infer<typeof marketSampleSchema>;
