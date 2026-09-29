import { createHash } from "node:crypto";
import { PATCH_SUMMARY_REQUEST_CAPS as CAPS, type CoachPatchSummaryRequest } from "./summaryContract";

/**
 * Idempotency key of a summary: exactly the text the model is shown. Hashing the raw HTML instead
 * would re-summarize on every forum re-render (view counters, avatars) with no content change.
 */
export function patchSummaryInputSha256(title: string, headings: readonly string[], listItems: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify([title, headings, listItems])).digest("hex");
}

export interface StoredPatchText {
  threadId: number;
  versionText: string;
  title: string;
  headings: string[];
  listItems: string[];
}

const clip = (value: string, max: number): string => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);
const nonEmpty = (value: string): boolean => value.trim().length > 0;

/**
 * Body for POST /internal/patch-summary, clipped to the Coach's request caps so an oversized
 * thread is summarized from its first part instead of being rejected forever. `clipped` reports
 * whether anything was cut here; the Coach reports its own 150k-character cut separately.
 */
export function buildSummaryRequest(patch: StoredPatchText): { body: CoachPatchSummaryRequest; clipped: boolean } {
  const headings = patch.headings.filter(nonEmpty);
  const items = patch.listItems.filter(nonEmpty);
  const body: CoachPatchSummaryRequest = {
    thread_id: patch.threadId,
    version_text: clip(patch.versionText.trim(), CAPS.versionChars),
    title: clip(patch.title.trim(), CAPS.titleChars),
    headings: headings.slice(0, CAPS.headings).map((h) => clip(h.trim(), CAPS.headingChars)),
    list_items: items.slice(0, CAPS.listItems).map((i) => clip(i.trim(), CAPS.itemChars)),
  };
  const clipped =
    headings.length > CAPS.headings ||
    items.length > CAPS.listItems ||
    headings.some((h) => h.trim().length > CAPS.headingChars) ||
    items.some((i) => i.trim().length > CAPS.itemChars);
  return { body, clipped };
}
