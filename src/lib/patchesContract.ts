import { z } from "zod";
import {
  patchSummarySchema,
  SUMMARY_STATUSES,
  type ReviewHint,
  type SummaryKind,
  type SummaryStatus,
} from "../sources/patchNotes/summaryContract";

/** /api/patches contracts. Pure — the Patches tab parses every response with these. */

export const patchSummaryStateSchema = z.object({
  status: z.enum(SUMMARY_STATUSES),
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  summarizedAt: z.string().nullable(),
  truncated: z.boolean(),
  /** The last good summary; kept while an edited thread is re-summarized. */
  data: patchSummarySchema.nullable(),
  /** Owner-only failure detail; members see a generic state. */
  error: z.string().nullable(),
});
export type PatchSummaryState = z.infer<typeof patchSummaryStateSchema>;

export const patchReviewSchema = z.enum(["pending", "no_gameplay_impact", "data_refreshed"]).nullable();
export type PatchReview = z.infer<typeof patchReviewSchema>;

export const patchListItemSchema = z.object({
  threadId: z.number().int().positive(),
  title: z.string(),
  versionText: z.string(),
  publishedAt: z.string().nullable(),
  publishedText: z.string(),
  sourceUrl: z.string().url(),
  bodyValid: z.boolean(),
  review: patchReviewSchema,
  /** null = no job: the thread has no stored body (older than the watched range, or unparseable). */
  summary: patchSummaryStateSchema.nullable(),
});
export type PatchListItem = z.infer<typeof patchListItemSchema>;

export const patchesResponseSchema = z.object({
  patches: z.array(patchListItemSchema),
  /** Pass as ?before= for the next (older) page; null when this page was the last. */
  nextBefore: z.number().int().positive().nullable(),
  canResummarize: z.boolean(),
});
export type PatchesResponse = z.infer<typeof patchesResponseSchema>;

export const patchDetailSchema = patchListItemSchema.extend({
  headings: z.array(z.string()),
  listItems: z.array(z.string()),
  bodyText: z.string().nullable(),
});
export type PatchDetail = z.infer<typeof patchDetailSchema>;

export const PATCHES_PAGE_MAX = 50;

export const patchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PATCHES_PAGE_MAX).default(20),
  before: z.coerce.number().int().positive().optional(),
});

export const patchThreadIdSchema = z.coerce.number().int().positive();

export const patchActionSchema = z.object({ action: z.literal("resummarize") });

export const resummarizeResponseSchema = z.object({ status: z.literal("queued") });

const GROUP_LABEL: Record<SummaryKind, string> = {
  economy: "Economy & trade",
  crafting: "Crafting",
  loot: "Loot & drops",
  balance: "Balance",
  bugfix: "Bug fixes",
  other: "Other",
};

export function groupLabel(kind: SummaryKind): string {
  return GROUP_LABEL[kind];
}

export interface Badge {
  label: string;
  hint: string;
}

const SUMMARY_BADGE: Record<SummaryStatus, Badge> = {
  pending: { label: "summarizing", hint: "Queued for an AI summary — the poller runs it with the next patch check." },
  done: { label: "AI summary", hint: "Generated from the official thread text. Verify anything important in-game." },
  failed: { label: "summary failed", hint: "The AI summary could not be produced; the official notes are linked." },
};

export function summaryBadge(status: SummaryStatus): Badge {
  return SUMMARY_BADGE[status];
}

const REVIEW_HINT_LABEL: Record<ReviewHint, string> = {
  likely_no_gameplay_impact: "AI: likely no gameplay impact",
  likely_game_data_change: "AI: likely game-data change",
  unclear: "AI: impact unclear",
};

export function reviewHintLabel(hint: ReviewHint): string {
  return REVIEW_HINT_LABEL[hint];
}

const REVIEW_LABEL: Record<Exclude<PatchReview, null>, string> = {
  pending: "review pending",
  no_gameplay_impact: "reviewed: no gameplay impact",
  data_refreshed: "reviewed: game data refreshed",
};

export function reviewLabel(review: Exclude<PatchReview, null>): string {
  return REVIEW_LABEL[review];
}
