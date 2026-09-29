/*
 * The Learn tab's curated data files (src/data/poe2/learn/*.json). Every fact carries a Claim so the
 * UI can say how far to trust it; item text itself (what an orb does, its art) is never copied in —
 * it comes from the entity catalog by id, so a patch refresh of the catalog updates the primer too.
 */
import { z } from "zod";
import { claimSchema } from "../../lib/claim";
import { ENTITY_ID_PATTERN } from "../entities/schema";

/** kebab-case ids: stable keys for learn_progress rows and cross-file refs. */
export const LEARN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const learnIdSchema = z.string().regex(LEARN_ID_PATTERN).max(64);

/** Pickup advice for a new player: always take it / take it and stack it for bulk / skip early. */
export const PICKUP_ADVICE = ["always", "stack", "skip_low"] as const;
export const pickupAdviceSchema = z.enum(PICKUP_ADVICE);
export type PickupAdvice = z.infer<typeof pickupAdviceSchema>;

const patchStampSchema = z
  .object({
    /** Game patch the entries were last checked against (e.g. "0.5.5"). */
    verified_against: z.string().min(1),
    stamped_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

function uniqueBy<T>(key: (item: T) => string, label: string) {
  return (items: readonly T[], ctx: z.RefinementCtx): void => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const id = key(item);
      if (seen.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: `duplicate ${label} "${id}"` });
      seen.add(id);
    });
  };
}

export const primerEntrySchema = z
  .object({
    entity_id: z.string().regex(ENTITY_ID_PATTERN),
    /** Who uses it and for what, in one plain line for someone new to the game. */
    who_uses: z.string().min(1).max(160),
    pickup: pickupAdviceSchema,
    /**
     * Exalted per item behind the pickup bucket: the lower of poe.ninja and poe2scout on the
     * file's stamped_at. "always" must agree with isWorthPickingUp(ref_ex) (testLearn checks), so
     * the curated bucket and the live lookup hint follow one rule.
     */
    ref_ex: z.number().positive().finite(),
    claim: claimSchema,
  })
  .strict();
export type PrimerEntry = z.infer<typeof primerEntrySchema>;

export const currencyPrimerSchema = z
  .object({
    schema_version: z.literal(1),
    patch: patchStampSchema,
    entries: z.array(primerEntrySchema).min(1).superRefine(uniqueBy((e) => e.entity_id, "entity_id")),
  })
  .strict();
export type CurrencyPrimer = z.infer<typeof currencyPrimerSchema>;

export const atlasWarningSchema = z
  .object({
    text: z.string().min(1).max(240),
    /** Its own evidence when it is backed differently from the step (e.g. one creator's advice). */
    claim: claimSchema.optional(),
  })
  .strict();
export type AtlasWarning = z.infer<typeof atlasWarningSchema>;

export const atlasStepSchema = z
  .object({
    id: learnIdSchema,
    title: z.string().min(1).max(80),
    detail: z.string().min(1).max(400),
    warnings: z.array(atlasWarningSchema).max(4),
    /** Farm strategy ids (src/data/poe2/strategies/<id>.json) this step leads into. */
    strategy_ids: z.array(learnIdSchema),
    claim: claimSchema,
  })
  .strict();
export type AtlasStep = z.infer<typeof atlasStepSchema>;

export const atlasChecklistSchema = z
  .object({
    schema_version: z.literal(1),
    patch: patchStampSchema,
    /** Whose route this follows, shown as the checklist's attribution. */
    route_source: z.string().min(1).max(160),
    steps: z.array(atlasStepSchema).min(1).superRefine(uniqueBy((s) => s.id, "step id")),
  })
  .strict();
export type AtlasChecklist = z.infer<typeof atlasChecklistSchema>;
