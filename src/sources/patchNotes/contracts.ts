import { z } from "zod";

export const PATCH_SOURCE_ID = "ggg_poe2_patch_notes" as const;
// GGG forum ids are per language, not per request: 2222 is the German "Patch-Notes" forum,
// 2233 French, 2243 Spanish. 2212 "Early Access Patch Notes" is the English PoE2 source.
export const PATCH_FORUM_ID = "2212" as const;
export const PATCH_INDEX_URL = `https://www.pathofexile.com/forum/view-forum/${PATCH_FORUM_ID}` as const;
export const PATCH_ARTIFACT_DIR = "source-snapshots/ggg-patch-notes" as const;
export const PATCH_PARSER_NAME = "ggg-forum-patch-notes" as const;
export const PATCH_PARSER_VERSION = "3" as const;
export const PATCH_THREAD_VALIDATION_POLICY = "thread:structured-staff-body-english-v2" as const;

// The forum is part of the policy so a stored index from another forum never passes as current.
export function patchIndexValidationPolicy(minimumEntries: number, baselineThreadId: number): string {
  return `index:forum=${PATCH_FORUM_ID};english-title;min-entries=${minimumEntries};baseline-thread=${baselineThreadId}`;
}

export const patchIndexEntrySchema = z.object({
  threadId: z.number().int().positive(),
  title: z.string().trim().min(1),
  versionText: z.string().trim().min(1),
  publishedAt: z.string().datetime().nullable(),
  publishedText: z.string().trim().min(1),
  sourceUrl: z.string().url(),
});

export const patchDocumentSchema = z.object({
  threadId: z.number().int().positive(),
  title: z.string().trim().min(1),
  headings: z.array(z.string().min(1)),
  listItems: z.array(z.string().min(1)),
  bodyText: z.string().trim().min(1),
});

/**
 * One grammar for every hand-edited PoE2 patch version (patch-coverage.json, boss-loot.json): three
 * or more numeric parts plus an optional lowercase hotfix letter — 0.5.4, 0.5.4d, 0.5.4.1. It is
 * the shape the forum-title parser extracts, so a coverage bump copied from a patch thread fits.
 */
export const PATCH_VERSION_RE = /^\d+(?:\.\d+){2,}[a-z]?$/;

export const patchCoverageSchema = z.object({
  schema_version: z.literal(1),
  game_data_patch: z.string().regex(PATCH_VERSION_RE, "expected a patch version like 0.5.4d"),
  official_patch_thread_id: z.number().int().positive(),
  official_patch_published_at: z.string().datetime(),
  catalog_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const catalogManifestSchema = z.object({
  artifact: z.string().min(1),
  artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const reviewDispositionSchema = z.enum(["no_gameplay_impact", "data_refreshed"]);

export type PatchIndexEntry = z.infer<typeof patchIndexEntrySchema>;
export type PatchDocument = z.infer<typeof patchDocumentSchema>;
export type PatchCoverage = z.infer<typeof patchCoverageSchema>;
export type ReviewDisposition = z.infer<typeof reviewDispositionSchema>;

export interface ConditionalHeaders {
  etag: string | null;
  lastModified: string | null;
}

export interface HtmlFetchResult {
  status: 200 | 304;
  url: string;
  html: string | null;
  raw: Uint8Array | null;
  bytes: number;
  etag: string | null;
  lastModified: string | null;
  retrievedAt: string;
}

export interface PatchIndexPage {
  entries: PatchIndexEntry[];
  /** Thread ids of recognised realm notices that are not patches (see parser NOTICE_TITLES). */
  skippedNotices: number[];
}

export interface PatchThreadFailure {
  threadId: number;
  reason: string;
}

export interface PatchSyncResult {
  ok: boolean;
  indexChanged: boolean;
  checkedThreads: number;
  changedThreads: number;
  /** Threads whose body could not be fetched or parsed; every other thread was still stored. */
  failedThreads: PatchThreadFailure[];
  /** Index threads not tracked as patches; empty when the index was unchanged (304). */
  skippedNotices: number[];
  errors: string[];
}

export function patchSyncSummary(result: PatchSyncResult): string {
  const skipped = result.skippedNotices.length;
  return `checked ${result.checkedThreads} thread(s), changed ${result.changedThreads}`
    + (skipped > 0 ? `, skipped ${skipped} realm notice(s): ${result.skippedNotices.join(", ")}` : "");
}

/**
 * Heartbeat/log text for an incomplete sync. Counts come first because the System panel caps
 * error text, and "1 of 12 failed, 11 kept" is what tells the owner the rest was not lost.
 */
export function patchSyncProblem(result: PatchSyncResult): string | null {
  if (result.ok) return null;
  const detail = result.errors.join("; ") || "no error detail was reported";
  const failed = result.failedThreads.length;
  if (failed === 0) return `sync incomplete: ${detail}`;
  const kept = result.checkedThreads - failed;
  return `sync incomplete: ${failed} of ${result.checkedThreads} thread(s) failed, ${kept} kept: ${detail}`;
}
