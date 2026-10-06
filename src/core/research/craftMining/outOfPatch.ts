/*
 * Craft mechanics a creator video may still show but a current-league player cannot use. Mining
 * flags any video that leans on one of these (craftVideoExtractionSchema checks the step
 * materials against `entityIds`), and synthesis excludes them unless the mechanic is
 * patch-notes-unchanged. Each row quotes the official patch notes as already cited in
 * docs/research/poe2-crafting-knowledge.md / docs/kb, so the table never outruns the KB.
 */
import { z } from "zod";
import { ENTITY_ID_PATTERN } from "../../entities/schema";
import { httpsUrl, isoDay, patchVersionSchema } from "../../craftProvenance/schema";

export const OUT_OF_PATCH_STATUSES = ["not_on_league_exchange", "unobtainable", "disabled"] as const;

export const outOfPatchEntrySchema = z
  .object({
    id: z.string().regex(ENTITY_ID_PATTERN),
    label: z.string().min(1),
    /** Entity-catalog ids the mechanic is used through; empty when the catalog no longer lists it. */
    entityIds: z.array(z.string().regex(ENTITY_ID_PATTERN)),
    status: z.enum(OUT_OF_PATCH_STATUSES),
    since: patchVersionSchema,
    /** Verbatim patch-notes text (or the KB's verbatim fragment of it). */
    quote: z.string().min(1),
    source: z
      .object({
        url: httpsUrl,
        accessed: isoDay,
        note: z.string().min(1).nullable(),
      })
      .strict(),
    /** Where our KB records the fact, so a correction there is also a correction here. */
    kbRef: z.string().min(1),
  })
  .strict();
export type OutOfPatchEntry = z.infer<typeof outOfPatchEntrySchema>;

const PATCH_050 = "https://www.pathofexile.com/forum/view-thread/3932540";
const PATCH_030 = "https://www.pathofexile.com/forum/view-thread/3826682";

const ENTRIES: readonly OutOfPatchEntry[] = [
  {
    id: "homogenising-omens",
    label: "Omen of Homogenising Exaltation / Coronation",
    entityIds: ["omen-of-homogenising-exaltation", "omen-of-homogenising-coronation"],
    status: "not_on_league_exchange",
    since: "0.5.0",
    quote:
      "The following items only appear on the Currency Exchange in Standard Leagues: Omen of Corruption, Omen of Homogenising Coronation, and Omen of Homogenising Exaltation.",
    source: { url: PATCH_050, accessed: "2026-10-02", note: "whether they still drop in leagues is not stated (unverified)" },
    kbRef: "docs/research/poe2-crafting-knowledge.md §4",
  },
  {
    id: "omen-of-corruption",
    label: "Omen of Corruption",
    entityIds: ["omen-of-corruption"],
    status: "unobtainable",
    since: "0.5.0",
    quote: "can no longer be obtained",
    source: { url: PATCH_050, accessed: "2026-10-01", note: "fragment as quoted by the 2026-10-01 fact-check; still present in the 0.5.5b entity catalog" },
    kbRef: "docs/research/poe2-crafting-knowledge.md §4",
  },
  {
    id: "omen-of-greater-annulment",
    label: "Omen of Greater Annulment",
    entityIds: [],
    status: "unobtainable",
    since: "0.3.0",
    quote: "The following Omens can no longer be obtained: Omen of Greater Annulment, …",
    source: { url: PATCH_030, accessed: "2026-10-02", note: "absent from the 0.5.5b entity catalog" },
    kbRef: "docs/research/poe2-crafting-knowledge.md §4",
  },
  {
    id: "recombinator",
    label: "Recombinator and Omen of Recombination",
    entityIds: [],
    status: "disabled",
    since: "0.5.0",
    quote: "The Recombinator has been disabled. The Omen of Recombination has been removed. Existing Omens of Recombination will be deleted upon logging in.",
    source: {
      url: PATCH_050,
      accessed: "2026-10-01",
      note: "the KB checked this line against the Maxroll mirror of the 0.5.0 notes; poe2-crafting-knowledge.md does not cover it",
    },
    kbRef: "docs/kb/currency-core.md §9",
  },
];

/** Validated at import: a malformed row is a programming error, not a data condition to tolerate. */
export const OUT_OF_PATCH: readonly OutOfPatchEntry[] = z.array(outOfPatchEntrySchema).parse(ENTRIES);

export const OUT_OF_PATCH_IDS = OUT_OF_PATCH.map((e) => e.id);

/** The out-of-patch row an entity id belongs to, or null when the entity is usable this league. */
export function outOfPatchFor(entityId: string): OutOfPatchEntry | null {
  return OUT_OF_PATCH.find((e) => e.entityIds.includes(entityId)) ?? null;
}
