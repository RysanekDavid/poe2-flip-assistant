import { z } from "zod";

export const PATCH_SOURCE_ID = "ggg_poe2_patch_notes" as const;
export const PATCH_INDEX_URL = "https://www.pathofexile.com/forum/view-forum/2222" as const;
export const PATCH_ARTIFACT_DIR = "source-snapshots/ggg-patch-notes" as const;
export const PATCH_PARSER_NAME = "ggg-forum-patch-notes" as const;
export const PATCH_PARSER_VERSION = "2" as const;
export const PATCH_THREAD_VALIDATION_POLICY = "thread:structured-staff-body-v1" as const;

export function patchIndexValidationPolicy(minimumEntries: number, baselineThreadId: number): string {
  return `index:min-entries=${minimumEntries};baseline-thread=${baselineThreadId}`;
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

export const patchCoverageSchema = z.object({
  schema_version: z.literal(1),
  game_data_patch: z.string().min(1),
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

export interface PatchSyncResult {
  ok: boolean;
  indexChanged: boolean;
  checkedThreads: number;
  changedThreads: number;
  errors: string[];
}
