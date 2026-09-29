/*
 * How well one curated fact is backed. Shared by the strategy KB, the Learn data and their UI so a
 * "verified" chip means the same thing everywhere; Python mirrors must keep the same rules.
 */
import { z } from "zod";

export const CLAIM_VERDICTS = ["vp", "vs", "ss", "uv", "cf", "syn"] as const;
export const claimVerdictSchema = z.enum(CLAIM_VERDICTS);
export type ClaimVerdict = z.infer<typeof claimVerdictSchema>;

/** Chip text: short enough to sit inline next to the fact. */
export const CLAIM_LABEL: Record<ClaimVerdict, string> = {
  vp: "primary",
  vs: "2+ sources",
  ss: "1 source",
  uv: "unverified",
  cf: "conflict",
  syn: "synthesis",
};

/** Hover text: what the chip promises, so a reader knows how far to trust the fact. */
export const CLAIM_MEANING: Record<ClaimVerdict, string> = {
  vp: "Checked against a primary source: game data, poe2db or official patch notes.",
  vs: "Two or more independent community sources agree.",
  ss: "One community source; not yet cross-checked.",
  uv: "Not verified — treat as a lead to test in game, not a fact.",
  cf: "Sources disagree; the note says which one this follows and why.",
  syn: "Our own conclusion drawn from the sources listed, not stated by any one of them.",
};

/** Only an unsettled fact earns the amber border; settled grades stay neutral so amber keeps meaning "check this". */
export const isUnsettledClaim = (verdict: ClaimVerdict): boolean => verdict === "uv" || verdict === "cf";

// Rendered as links, so only https (no javascript:/data: hrefs out of a data file).
const sourceUrlSchema = z.string().url().regex(/^https:\/\//, "claim sources must be https URLs");

/** A grade whose label counts sources must carry that many; the others may cite none. */
const MIN_SOURCES: Record<ClaimVerdict, number> = { vp: 1, vs: 2, ss: 1, uv: 0, cf: 0, syn: 0 };

export const claimSchema = z
  .object({
    v: claimVerdictSchema,
    src: z.array(sourceUrlSchema),
    note: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((claim, ctx) => {
    const min = MIN_SOURCES[claim.v];
    if (claim.src.length < min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["src"], message: `a "${claim.v}" claim needs at least ${min} source URL(s)` });
    }
  });
export type Claim = z.infer<typeof claimSchema>;
