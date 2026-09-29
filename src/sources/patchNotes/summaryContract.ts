import { z } from "zod";

/*
 * The Coach's patch-summary contract (services/coach/src/patch_summary.py). Pure zod, no node
 * imports: the Patches tab parses the same summary shape in the browser.
 */

/** Characters of patch text the Coach sends to the model; it truncates past this and says so. */
export const PATCH_SUMMARY_INPUT_LIMIT = 150_000;

/** Request caps, identical to PatchSummaryRequest — the poller clips to them before sending. */
export const PATCH_SUMMARY_REQUEST_CAPS = {
  versionChars: 40,
  titleChars: 300,
  headings: 500,
  headingChars: 500,
  listItems: 5_000,
  itemChars: 2_000,
} as const;

export const SUMMARY_KINDS = ["economy", "crafting", "loot", "balance", "bugfix", "other"] as const;
export const REVIEW_HINTS = ["likely_no_gameplay_impact", "likely_game_data_change", "unclear"] as const;

// The Coach caps after parsing (tldr 240, bullet 200, 6×6, impact 300, reason 240). These are
// 1.5× looser so a Coach-side tweak never strands a stored summary, yet a runaway still fails.
const text = (max: number) => z.string().max(max);

export const patchSummarySchema = z.object({
  schema_version: z.literal(1),
  tldr: text(360),
  hotfix: z.boolean(),
  groups: z.array(z.object({ kind: z.enum(SUMMARY_KINDS), bullets: z.array(text(300)).max(9) })).max(9),
  trading_impact: text(450),
  review_hint: z.enum(REVIEW_HINTS),
  review_reason: text(360),
});
export type PatchSummary = z.infer<typeof patchSummarySchema>;
export type SummaryKind = (typeof SUMMARY_KINDS)[number];
export type ReviewHint = (typeof REVIEW_HINTS)[number];

export const patchSummaryUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
export type PatchSummaryUsage = z.infer<typeof patchSummaryUsageSchema>;

export const coachPatchSummaryResponseSchema = z.object({
  request_id: z.string().regex(/^[a-f0-9]{24,32}$/),
  model: z.string().min(1).max(100),
  prompt_version: z.string().min(1).max(20),
  truncated: z.boolean(),
  summary: patchSummarySchema,
  usage: patchSummaryUsageSchema,
});
export type CoachPatchSummaryResponse = z.infer<typeof coachPatchSummaryResponseSchema>;

export interface CoachPatchSummaryRequest {
  thread_id: number;
  version_text: string;
  title: string;
  headings: string[];
  list_items: string[];
}
