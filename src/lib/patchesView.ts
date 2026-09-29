import type { PatchDetailRow, PatchListRow } from "../db/patchSummaryQueries";
import { patchSummarySchema, type PatchSummary } from "../sources/patchNotes/summaryContract";
import type { PatchDetail, PatchListItem, PatchSummaryState } from "./patchesContract";

/** Rows → /api/patches items. Server-only (reads DB row types); pure. */

const STORED_SUMMARY_BROKEN = "stored summary no longer matches the summary schema";

/** A stored summary that stopped parsing is reported, never silently dropped. */
function parseStoredSummary(row: PatchListRow): { data: PatchSummary | null; broken: boolean } {
  if (row.summaryJson == null) return { data: null, broken: false };
  const parsed = patchSummarySchema.safeParse(JSON.parse(row.summaryJson));
  if (parsed.success) return { data: parsed.data, broken: false };
  console.error(`[patches] thread ${row.threadId}: ${STORED_SUMMARY_BROKEN}`);
  return { data: null, broken: true };
}

function summaryState(row: PatchListRow, isOwner: boolean): PatchSummaryState | null {
  if (row.summaryStatus == null) return null;
  const { data, broken } = parseStoredSummary(row);
  // Coach/HTTP detail is operator information; members only need to know it failed.
  const detail = broken ? STORED_SUMMARY_BROKEN : row.lastError;
  return {
    status: row.summaryStatus,
    truncated: row.truncated,
    data,
    error: isOwner ? detail : null,
  };
}

export function toPatchListItem(row: PatchListRow, isOwner: boolean): PatchListItem {
  return {
    threadId: row.threadId,
    title: row.title,
    versionText: row.versionText,
    publishedAt: row.publishedAt,
    publishedText: row.publishedText,
    sourceUrl: row.sourceUrl,
    bodyValid: row.bodyValid,
    review: row.disposition,
    summary: summaryState(row, isOwner),
  };
}

export function toPatchDetail(row: PatchDetailRow, isOwner: boolean): PatchDetail {
  return { ...toPatchListItem(row, isOwner), headings: row.headings, listItems: row.listItems, bodyText: row.bodyText };
}
