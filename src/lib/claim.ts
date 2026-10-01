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

/**
 * Real-money-trading shops that publish SEO "guides" to sell currency. They are never a source: a
 * citation is a link we send players to, and their facts are copied from elsewhere anyway. Matched
 * on the host and its subdomains. Python mirror: RMT_DOMAINS in services/coach/src/strategies/models.py.
 */
export const RMT_DOMAINS = [
  "poecurrency.com",
  "iggm.com",
  "u4n.com",
  "u4gm.com",
  "mmojugg.com",
  "mmoexp.com",
  "ezg.com",
  "eznpc.com",
  "poe-store.com",
  "ign-store.com",
] as const;

/** True when the URL's host is an RMT shop or one of its subdomains; an unparsable URL is not one. */
export function isRmtUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const host = new URL(url).hostname.toLowerCase();
  return RMT_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

// Rendered as links, so only https (no javascript:/data: hrefs out of a data file), and never a shop.
const sourceUrlSchema = z
  .string()
  .url()
  .regex(/^https:\/\//, "claim sources must be https URLs")
  .refine((url) => !isRmtUrl(url), "claim sources must not be real-money-trading shops (RMT_DOMAINS)");

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
