import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/** Same file the Coach's retrieval loader reads (services/coach/src/retrieval/manifest.py). */
export const KB_MANIFEST_PATH = "docs/kb/manifest.json";
const KB_DIRECTORY = "docs/kb";

const relativeMarkdownSchema = z.string().regex(/^docs\/(?:kb|research)\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/);

const corpusEntrySchema = z.object({
  path: relativeMarkdownSchema,
  patch: z.string().min(1).max(20),
  league: z.string().min(1).max(60),
  stamped_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const excludedEntrySchema = z.object({
  path: relativeMarkdownSchema,
  reason: z.string().min(1),
}).strict();

export const kbManifestSchema = z.object({
  schema_version: z.literal(1),
  corpus: z.array(corpusEntrySchema).min(1),
  excluded: z.array(excludedEntrySchema),
}).strict();

export type KbManifest = z.infer<typeof kbManifestSchema>;

/**
 * Hash with LF line endings: Windows checkouts convert to CRLF, and a stamp must not go
 * "stale" just because the file was checked out on another OS.
 */
export function kbContentHash(content: string): string {
  return createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

export function readKbManifest(root: string): KbManifest {
  const raw: unknown = JSON.parse(readFileSync(join(root, KB_MANIFEST_PATH), "utf8"));
  return kbManifestSchema.parse(raw);
}

/** Every problem that makes the corpus untrustworthy; an empty list means the KB is fresh. */
export function kbManifestProblems(root: string, manifest: KbManifest): string[] {
  const problems: string[] = [];
  const listed = [...manifest.corpus, ...manifest.excluded].map((entry) => entry.path);
  if (new Set(listed).size !== listed.length) problems.push("manifest lists a path more than once");
  for (const entry of manifest.corpus) {
    const path = join(root, entry.path);
    if (!existsSync(path)) {
      problems.push(`${entry.path}: listed in the manifest but missing`);
      continue;
    }
    if (Number.isNaN(Date.parse(`${entry.stamped_at}T00:00:00Z`))) {
      problems.push(`${entry.path}: stamped_at ${entry.stamped_at} is not a valid date`);
    }
    const actual = kbContentHash(readFileSync(path, "utf8"));
    if (actual !== entry.sha256) {
      problems.push(
        `${entry.path}: edited after its ${entry.stamped_at} stamp — re-verify patch/league, ` +
          `then set stamped_at and sha256=${actual}`,
      );
    }
  }
  for (const entry of manifest.excluded) {
    if (!existsSync(join(root, entry.path))) problems.push(`${entry.path}: excluded but missing`);
  }
  for (const name of readdirSync(join(root, KB_DIRECTORY))) {
    const path = `${KB_DIRECTORY}/${name}`;
    if (name.endsWith(".md") && !listed.includes(path)) {
      problems.push(`${path}: not in the manifest — add it to corpus (stamped) or excluded`);
    }
  }
  return problems;
}
